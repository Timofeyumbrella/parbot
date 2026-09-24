import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';

export type ExtractedHtml = {
  title: string | null;
  markdown: string;
  /** Raw href values found on the page, unresolved. */
  links: string[];
};

export type HtmlOptions = {
  /** Resolves relative links in the Markdown. */
  baseUrl?: string;
  /** Skip Readability and take the whole body. Right for documents that are all content. */
  readability?: boolean;
};

/** Chrome that never carries documentation content. */
const NOISE_SELECTOR =
  'script, style, noscript, iframe, svg, canvas, template, nav, footer, aside, button, [role="navigation"], [role="contentinfo"]';

const LANGUAGE_PATTERN = /(?:^|\s)(?:language|lang)-([\w#+.-]+)/i;

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

const resolveHref = (href: string, baseUrl?: string) => {
  if (!baseUrl) {
    return href;
  }

  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
};

const detectLanguage = (pre: Element, code: Element | null) => {
  for (const element of [code, pre]) {
    if (!element) {
      continue;
    }

    const explicit = element.getAttribute('data-language') ?? element.getAttribute('data-lang');

    if (explicit?.trim()) {
      return explicit.trim();
    }

    const match = (element.getAttribute('class') ?? '').match(LANGUAGE_PATTERN);

    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  return '';
};

const cellText = (cell: Element) => collapse(cell.textContent ?? '').replace(/\|/g, '\\|');

const createTurndown = (baseUrl?: string) => {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
    hr: '---',
  });

  service.remove(['script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'aside', 'button', 'template']);

  service.addRule('fencedCode', {
    filter: (node) => node.nodeName === 'PRE',
    replacement: (_content, node) => {
      const pre = node as HTMLElement;
      const codes = pre.querySelectorAll('code');
      const code = codes.length === 1 ? codes[0]! : null;
      const language = detectLanguage(pre, code ?? codes[0] ?? null);
      const text = (code ?? pre).textContent?.replace(/\n$/, '') ?? '';

      return `\n\n\`\`\`${language}\n${text}\n\`\`\`\n\n`;
    },
  });

  service.addRule('links', {
    filter: (node) => node.nodeName === 'A' && Boolean(node.getAttribute('href')),
    replacement: (content, node) => {
      const text = content.trim();
      const href = (node as HTMLElement).getAttribute('href') ?? '';

      if (!text || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) {
        return text;
      }

      return `[${text}](${resolveHref(href, baseUrl)})`;
    },
  });

  service.addRule('images', {
    filter: 'img',
    replacement: (_content, node) => {
      const alt = collapse((node as HTMLElement).getAttribute('alt') ?? '');

      return alt ? ` ${alt} ` : '';
    },
  });

  // Turndown pads list markers to four columns ("-   item"); one space is what people write.
  service.addRule('listItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode as HTMLElement | null;
      let prefix = `${options.bulletListMarker} `;

      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? 1);
        const index = Array.prototype.indexOf.call(parent.children, node);

        prefix = `${start + index}. `;
      }

      const isParagraph = /\n$/.test(content);
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '') + (isParagraph ? '\n' : '');

      return prefix + body.replace(/\n/gm, `\n${' '.repeat(prefix.length)}`) + (node.nextSibling ? '\n' : '');
    },
  });

  service.addRule('tables', {
    filter: 'table',
    replacement: (_content, node) => {
      const rows = Array.from((node as HTMLElement).querySelectorAll('tr')).map((row) =>
        Array.from(row.querySelectorAll('th, td')).map(cellText),
      );
      const width = Math.max(0, ...rows.map((row) => row.length));

      if (rows.length === 0 || width === 0) {
        return '';
      }

      const line = (cells: string[]) =>
        `| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`;
      const [head, ...body] = rows;

      return `\n\n${line(head!)}\n| ${Array.from({ length: width }, () => '---').join(' | ')} |\n${body
        .map(line)
        .join('\n')}\n\n`;
    },
  });

  return service;
};

/** " | Site", " — Site", " · Site" and the like; a plain hyphen is too common inside real titles. */
const SITE_SUFFIX = /\s+(?:\||—|–|·|::|»)\s+[^|—–·»]{1,80}$/;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The page's own name: the h1 when the document title merely wraps it ("Setup | AuditDocs"),
 * otherwise the title with the site name stripped from either end.
 */
export const cleanTitle = (title: string, heading: string | null, siteName: string | null) => {
  const trimmed = collapse(title);
  const h1 = collapse(heading ?? '');

  if (h1.length >= 2 && h1.length < trimmed.length && trimmed.toLowerCase().includes(h1.toLowerCase())) {
    return h1;
  }

  const site = collapse(siteName ?? '');

  if (site && trimmed.toLowerCase() !== site.toLowerCase()) {
    const separator = '\\s+(?:\\||—|–|·|::|»|-)\\s+';
    const withoutSite = trimmed
      .replace(new RegExp(`${separator}${escapeRegExp(site)}$`, 'i'), '')
      .replace(new RegExp(`^${escapeRegExp(site)}${separator}`, 'i'), '');

    if (withoutSite.length >= 2) {
      return withoutSite;
    }
  }

  const withoutSuffix = trimmed.replace(SITE_SUFFIX, '');

  if (withoutSuffix.length >= 3 && withoutSuffix !== trimmed) {
    return withoutSuffix;
  }

  return trimmed;
};

const hostOf = (baseUrl?: string) => {
  try {
    return baseUrl ? new URL(baseUrl).hostname.replace(/^www\./, '').toLowerCase() : null;
  } catch {
    return null;
  }
};

/** True when a heading names the site rather than the page: the site name, or the host itself. */
const isSiteName = (text: string, siteName: string | null, host: string | null) => {
  const value = collapse(text).toLowerCase();

  return Boolean(value) && (value === collapse(siteName ?? '').toLowerCase() || value === host || value === `www.${host}`);
};

const pageTitle = (document: Document, host: string | null) => {
  const headings = Array.from(document.querySelectorAll('h1'))
    .map((element) => collapse(element.textContent ?? ''))
    .filter(Boolean);
  const declaredSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? null;
  // Many sites put their logo in an h1; that heading names the site, and the page heading comes after it.
  const siteName = declaredSite ?? headings.find((text) => isSiteName(text, null, host)) ?? null;
  const heading = headings.find((text) => !isSiteName(text, siteName, host)) ?? null;
  const candidates = [
    document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    document.querySelector('title')?.textContent,
    heading,
  ];

  for (const candidate of candidates) {
    const title = cleanTitle(candidate ?? '', heading, siteName);

    if (title) {
      return title.slice(0, 200);
    }
  }

  return null;
};

const contentRoot = (document: Document) =>
  document.querySelector('main') ?? document.querySelector('article') ?? document.body;

/** Readability sometimes keeps only a fraction of a docs page; below this share the page wins. */
const READABILITY_MIN_SHARE = 0.5;

const tidyMarkdown = (markdown: string) =>
  markdown
    .replace(/ /g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Readability drops the h1 that repeats the page title and demotes the others, which would leave
 * every chunk without the top of its heading path. The title goes back in as the level one heading.
 */
const withTitleHeading = (markdown: string, title: string | null) =>
  markdown && title && !/^ {0,3}#[ \t]/m.test(markdown) ? `# ${title}\n\n${markdown}` : markdown;

/**
 * HTML to Markdown: links and title are read from the raw document, chrome is dropped, Readability
 * picks the main content (with <main>/<article>/<body> as the fallback), and Turndown writes
 * headings, fenced code, lists, links and tables.
 */
export const htmlToMarkdown = (html: string, options: HtmlOptions = {}): ExtractedHtml => {
  const source = /<body[\s>]/i.test(html) ? html : `<!doctype html><html><body>${html}</body></html>`;
  const { document } = parseHTML(source);
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map((anchor) => anchor.getAttribute('href') ?? '')
    .filter(Boolean);
  const title = pageTitle(document, hostOf(options.baseUrl));

  for (const node of Array.from(document.querySelectorAll(NOISE_SELECTOR))) {
    node.remove();
  }

  const root = contentRoot(document);
  const fallbackHtml = root?.innerHTML ?? '';
  const fallbackLength = collapse(root?.textContent ?? '').length;
  const isSectioned = root !== null && root !== document.body;
  let contentHtml = '';

  if (options.readability !== false) {
    try {
      const article = new Readability(document as unknown as Document, { keepClasses: true }).parse();
      const articleLength = collapse(article?.textContent ?? '').length;
      const tooThin = isSectioned && articleLength < fallbackLength * READABILITY_MIN_SHARE;

      contentHtml = article?.content && !tooThin ? article.content : '';
    } catch {
      contentHtml = '';
    }
  }

  const markdown = tidyMarkdown(createTurndown(options.baseUrl).turndown(contentHtml || fallbackHtml));

  return { title, markdown: withTitleHeading(markdown, title), links };
};
