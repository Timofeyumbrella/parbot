/**
 * A small Markdown renderer for answers. It understands the handful of constructs the answer
 * engine is told to produce (paragraphs, bold, italic, inline code, fenced code, links, lists
 * and [n] citation markers) and escapes everything else, so model output can never inject markup.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Only http(s) and mailto links are rendered as links; anything else stays plain text. */
export const safeUrl = (url: string) => {
  const trimmed = url.trim();

  return SAFE_URL.test(trimmed) ? trimmed : null;
};

const TOKEN = '\u0000';

/** Bold before italic, so the inner asterisks of **bold** are never read as emphasis. */
const emphasis = (text: string) =>
  text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(\S(?:[^*\n]*?\S)?)\*(?![*\w])/g, '$1<em>$2</em>');

/**
 * Inline formatting on one line of already-escaped text. Code spans and links are lifted out
 * first, so a `*` inside code or a `[1]` inside a URL is never rewritten.
 */
export const renderInline = (raw: string) => {
  const lifted: string[] = [];
  const lift = (html: string) => `${TOKEN}${lifted.push(html) - 1}${TOKEN}`;

  let text = escapeHtml(raw).replace(/`([^`\n]+)`/g, (_, code: string) =>
    lift(`<code>${code}</code>`),
  );

  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
    // The label was escaped along with the rest, so quotes in the URL were too. Undo that
    // before validating; the attribute is re-escaped below.
    const href = safeUrl(
      url
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'"),
    );

    return href
      ? lift(
          `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${emphasis(label)}</a>`,
        )
      : match;
  });

  text = emphasis(text);

  // Citation markers such as [1] or [1, 3], but not the [text](url) form of a link that was
  // refused above. Several numbers in one bracket keep their comma, so "1, 3" never reads as 13.
  text = text.replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\](?!\()/g, (_, list: string) =>
    list
      .split(',')
      .map((part) => `<sup class="pb-cite" data-cite="${part.trim()}">${part.trim()}</sup>`)
      .join('<sup class="pb-cite-sep">,</sup>'),
  );

  // A lifted link may hold a lifted code span, so restoring is recursive.
  const restore = (html: string): string =>
    html.replace(new RegExp(`${TOKEN}(\\d+)${TOKEN}`, 'g'), (_, index: string) =>
      restore(lifted[Number(index)] ?? ''),
    );

  return restore(text);
};

type Block =
  | { kind: 'code'; language: string; body: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[]; start: number }
  | { kind: 'heading'; text: string }
  | { kind: 'p'; lines: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const FENCE = /^\s*```\s*([\w+-]*)\s*$/;

/** Splits Markdown into blocks. An unclosed fence (mid-stream) is treated as a code block. */
export const parseBlocks = (markdown: string): Block[] => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  const flushParagraph = (buffer: string[]) => {
    if (buffer.length > 0) {
      blocks.push({ kind: 'p', lines: [...buffer] });
      buffer.length = 0;
    }
  };

  const paragraph: string[] = [];

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const fence = FENCE.exec(line);

    if (fence) {
      flushParagraph(paragraph);
      const body: string[] = [];
      index += 1;

      while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? '')) {
        body.push(lines[index] ?? '');
        index += 1;
      }

      index += 1;
      blocks.push({ kind: 'code', language: fence[1] ?? '', body: body.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph(paragraph);
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);

    if (heading) {
      flushParagraph(paragraph);
      blocks.push({ kind: 'heading', text: heading[1] ?? '' });
      index += 1;
      continue;
    }

    if (BULLET.test(line)) {
      flushParagraph(paragraph);
      const items: string[] = [];

      while (index < lines.length) {
        const item = BULLET.exec(lines[index] ?? '');

        if (!item) {
          break;
        }

        items.push(item[1] ?? '');
        index += 1;
      }

      blocks.push({ kind: 'ul', items });
      continue;
    }

    const numbered = NUMBERED.exec(line);

    if (numbered) {
      flushParagraph(paragraph);
      const items: string[] = [];
      const start = Number(numbered[1]);

      while (index < lines.length) {
        const item = NUMBERED.exec(lines[index] ?? '');

        if (!item) {
          break;
        }

        items.push(item[2] ?? '');
        index += 1;
      }

      blocks.push({ kind: 'ol', items, start });
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph(paragraph);

  return blocks;
};

const LANGUAGE = /^[\w+-]{1,20}$/;

export const renderMarkdown = (markdown: string) =>
  parseBlocks(markdown)
    .map((block) => {
      switch (block.kind) {
        case 'code': {
          const language = LANGUAGE.test(block.language)
            ? ` class="language-${escapeHtml(block.language)}"`
            : '';

          return `<pre><code${language}>${escapeHtml(block.body)}</code></pre>`;
        }
        case 'ul':
          return `<ul>${block.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`;
        case 'ol': {
          const start = block.start > 1 ? ` start="${block.start}"` : '';

          return `<ol${start}>${block.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`;
        }
        case 'heading':
          return `<p class="pb-heading">${renderInline(block.text)}</p>`;
        case 'p':
          return `<p>${block.lines.map(renderInline).join('<br>')}</p>`;
      }
    })
    .join('');
