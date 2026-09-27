import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AnswerMarkdown, highlight, linkCitationMarkers } from './answer-markdown';

describe('linkCitationMarkers', () => {
  it('turns [n] and [n, m] into cite links', () => {
    expect(linkCitationMarkers('Rotate the key [1]. Old keys expire [1, 2].')).toBe(
      'Rotate the key [1](#cite-1). Old keys expire [1](#cite-1)[2](#cite-2).',
    );
  });

  it('leaves markers inside code spans and fences alone', () => {
    const text = 'Use `items[1]` and\n```js\nconst first = list[2];\n```\nthen see [3].';

    expect(linkCitationMarkers(text)).toBe(
      'Use `items[1]` and\n```js\nconst first = list[2];\n```\nthen see [3](#cite-3).',
    );
  });
});

describe('highlight', () => {
  it('marks the parts of a shell command and keeps every character', () => {
    const code = 'curl https://x.dev \\\n  -u "$KEY:" \\\n  -d amount=1500 # refund';
    const tokens = highlight(code, 'bash');

    expect(tokens.map((token) => token.text).join('')).toBe(code);
    expect(
      tokens.filter((token) => token.kind).map((token) => `${token.kind}:${token.text.trim()}`),
    ).toEqual(['built_in:curl', 'attr:-u', 'string:"$KEY:"', 'attr:-d', 'comment:# refund']);
  });

  it('marks keywords, calls and strings in JavaScript', () => {
    const kinds = highlight("const expected = createHmac('sha256', secret);", 'js')
      .filter((token) => token.kind)
      .map((token) => `${token.kind}:${token.text}`);

    expect(kinds).toEqual(['keyword:const', 'title:createHmac', "string:'sha256'"]);
  });

  it('leaves unknown languages and half-written strings as plain text', () => {
    expect(highlight('SELECT 1', 'sql')).toEqual([{ text: 'SELECT 1', kind: null }]);
    expect(highlight("update('sha", 'js').map((token) => token.kind)).toEqual(['title', null]);
  });
});

describe('AnswerMarkdown', () => {
  it('renders markers as chips and code in a labelled block, without any link', () => {
    render(
      <AnswerMarkdown
        content={
          'Open **Settings** [1]. See [the guide](https://docs.acme.dev/guide).\n\n```bash\nacme keys rotate\n```'
        }
        citations={[{ index: 1 }]}
      />,
    );

    const answer = screen.getByTestId('demo-answer');

    expect(answer).toHaveClass('answer-prose');
    expect(answer.querySelector('sup[data-citation="1"]')).toHaveTextContent('1');
    expect(screen.getByText('Settings').tagName).toBe('STRONG');
    expect(screen.getByText('the guide').tagName).toBe('SPAN');
    expect(answer.querySelector('a')).toBeNull();

    const block = screen.getByTestId('demo-code-block');

    expect(block).toHaveTextContent(/^bashCopy/);
    expect(block.querySelector('.hljs-built_in')).toHaveTextContent('acme');
  });

  it('leaves a marker that cites nothing as the text it was', () => {
    render(<AnswerMarkdown content="See [2]." citations={[{ index: 1 }]} />);

    expect(screen.getByTestId('demo-answer')).toHaveTextContent('See [2].');
    expect(screen.getByTestId('demo-answer').querySelector('sup')).toBeNull();
  });

  it('puts the streaming caret on the last line while the answer arrives', () => {
    render(<AnswerMarkdown content={'First.\n\nSecond'} citations={[]} streaming />);

    expect(screen.getByText('Second')).toHaveClass('streaming-caret');
    expect(screen.getByText('First.')).not.toHaveClass('streaming-caret');
  });
});
