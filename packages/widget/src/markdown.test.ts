import { describe, expect, it } from 'vitest';

import { escapeHtml, parseBlocks, renderInline, renderMarkdown, safeUrl } from './markdown';

describe('escapeHtml', () => {
  it('neutralises markup', () => {
    expect(escapeHtml('<script>alert("x")</script> & \'q\'')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;',
    );
  });
});

describe('safeUrl', () => {
  it('accepts http, https and mailto', () => {
    expect(safeUrl('https://docs.example.com/a?b=1')).toBe('https://docs.example.com/a?b=1');
    expect(safeUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(safeUrl('mailto:hi@example.com')).toBe('mailto:hi@example.com');
  });

  it('rejects anything else', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('/relative')).toBeNull();
  });
});

describe('renderInline', () => {
  it('renders bold, inline code and links', () => {
    expect(renderInline('Use **bold** and `code` and [docs](https://x.io/a)')).toBe(
      'Use <strong>bold</strong> and <code>code</code> and <a href="https://x.io/a" target="_blank" rel="noopener noreferrer">docs</a>',
    );
  });

  it('keeps formatting characters inside inline code literal', () => {
    expect(renderInline('`**not bold** [1]`')).toBe('<code>**not bold** [1]</code>');
  });

  it('turns citation markers into superscripts', () => {
    expect(renderInline('Keys live in Settings [1]. Rotate them [1, 2].')).toBe(
      'Keys live in Settings <sup class="pb-cite" data-cite="1">1</sup>. Rotate them <sup class="pb-cite" data-cite="1">1</sup><sup class="pb-cite" data-cite="2">2</sup>.',
    );
  });

  it('does not treat link text as a citation', () => {
    expect(renderInline('[1](https://x.io)')).toBe(
      '<a href="https://x.io" target="_blank" rel="noopener noreferrer">1</a>',
    );
  });

  it('leaves unsafe links as text and escapes html', () => {
    expect(renderInline('[click](javascript:alert(1)) <b>x</b>')).toBe(
      '[click](javascript:alert(1)) &lt;b&gt;x&lt;/b&gt;',
    );
  });

  it('escapes quotes inside link urls', () => {
    expect(renderInline('[a](https://x.io/?q="1")')).toBe(
      '<a href="https://x.io/?q=&quot;1&quot;" target="_blank" rel="noopener noreferrer">a</a>',
    );
  });
});

describe('parseBlocks', () => {
  it('splits paragraphs, lists, headings and fences', () => {
    const blocks = parseBlocks(
      ['# Title', 'Para one', 'still one', '', '- a', '- b', '', '1. x', '2. y', '', '```ts', 'const a = 1;', '', 'done', '```', 'tail'].join('\n'),
    );

    expect(blocks).toEqual([
      { kind: 'heading', text: 'Title' },
      { kind: 'p', lines: ['Para one', 'still one'] },
      { kind: 'ul', items: ['a', 'b'] },
      { kind: 'ol', items: ['x', 'y'], start: 1 },
      { kind: 'code', language: 'ts', body: 'const a = 1;\n\ndone' },
      { kind: 'p', lines: ['tail'] },
    ]);
  });

  it('treats an unclosed fence as code, so streaming output renders as it arrives', () => {
    expect(parseBlocks('Run:\n```bash\nnpm i')).toEqual([
      { kind: 'p', lines: ['Run:'] },
      { kind: 'code', language: 'bash', body: 'npm i' },
    ]);
  });
});

describe('renderMarkdown', () => {
  it('renders a full answer', () => {
    const html = renderMarkdown('Create keys in **Settings** [1].\n\n- Open Settings\n- Click *New*\n\n```sh\ncurl -X POST <url>\n```');

    expect(html).toBe(
      '<p>Create keys in <strong>Settings</strong> <sup class="pb-cite" data-cite="1">1</sup>.</p>' +
        '<ul><li>Open Settings</li><li>Click *New*</li></ul>' +
        '<pre><code class="language-sh">curl -X POST &lt;url&gt;</code></pre>',
    );
  });

  it('joins lines of a paragraph with breaks and numbers ordered lists from their start', () => {
    expect(renderMarkdown('a\nb\n\n3. c\n4. d')).toBe('<p>a<br>b</p><ol start="3"><li>c</li><li>d</li></ol>');
  });

  it('never lets raw html through', () => {
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('renders nothing for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });
});
