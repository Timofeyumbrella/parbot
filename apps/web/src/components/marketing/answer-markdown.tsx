'use client';

import { cn } from 'cn';
import { Copy } from 'lucide-react';
import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { codeLanguage, type HastElement, rehypeStreamingCaret } from '@/lib/chat/markdown';

import '@/components/chat/answer.css';

import { CitationChip } from './demo-window';

const CODE_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/g;
const MARKER_PATTERN = /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g;
const CITE_PREFIX = '#cite-';

/** Turns [1] and [1, 2] into links to #cite-n, leaving code spans and fences untouched. */
export const linkCitationMarkers = (text: string) =>
  text
    .split(CODE_PATTERN)
    .map((part, position) =>
      position % 2 === 1
        ? part
        : part.replace(MARKER_PATTERN, (_match, list: string) =>
            list
              .split(',')
              .map((index) => index.trim())
              .map((index) => `[${index}](${CITE_PREFIX}${index})`)
              .join(''),
          ),
    )
    .join('');

type Token = { text: string; kind: string | null };

/**
 * Just enough highlighting for the demo's shell and JavaScript samples, in the hljs class names the
 * chat's stylesheet colours. The in-app chat uses highlight.js; the landing should not ship it.
 */
const GRAMMARS: Record<string, { pattern: RegExp; kinds: string[] }> = {
  bash: {
    pattern: /(#.*)|('[^'\n]*'|"[^"\n]*")|(\$\w+)|((?:^|\s)--?[\w-]+)|(^\s*[a-z][\w-]*)/gm,
    kinds: ['comment', 'string', 'variable', 'attr', 'built_in'],
  },
  js: {
    pattern:
      /(\/\/.*)|('[^'\n]*'|"[^"\n]*"|`[^`]*`)|(\b(?:const|let|await|async|return|if|else|new|function|import|from|export)\b)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][\w$]*(?=\())/g,
    kinds: ['comment', 'string', 'keyword', 'number', 'title'],
  },
};

export const highlight = (code: string, language: string | null): Token[] => {
  const grammar = language
    ? GRAMMARS[language === 'javascript' || language === 'ts' ? 'js' : language]
    : undefined;

  if (!grammar) {
    return [{ text: code, kind: null }];
  }

  const tokens: Token[] = [];
  let cursor = 0;

  for (const match of code.matchAll(new RegExp(grammar.pattern.source, grammar.pattern.flags))) {
    const kind = grammar.kinds[match.slice(1).findIndex((group) => group !== undefined)];

    if (!kind || match[0].length === 0) {
      continue;
    }

    if (match.index > cursor) {
      tokens.push({ text: code.slice(cursor, match.index), kind: null });
    }

    tokens.push({ text: match[0], kind });
    cursor = match.index + match[0].length;
  }

  if (cursor < code.length) {
    tokens.push({ text: code.slice(cursor), kind: null });
  }

  return tokens;
};

const textOf = (children: React.ReactNode): string =>
  Array.isArray(children)
    ? children.map(textOf).join('')
    : typeof children === 'string' || typeof children === 'number'
      ? String(children)
      : '';

const buildComponents = (citations: { index: number }[]): Components => ({
  a: ({ href, children }) => {
    if (href?.startsWith(CITE_PREFIX)) {
      const index = Number(href.slice(CITE_PREFIX.length));

      return citations.some((citation) => citation.index === index) ? (
        <CitationChip index={index} />
      ) : (
        <>[{index}]</>
      );
    }

    // Nothing in the demo leads anywhere: a link reads as one and stays put.
    return <span className="text-primary underline underline-offset-2">{children}</span>;
  },
  pre: ({ node, children }) => {
    const code = (node as unknown as HastElement | undefined)?.children.find(
      (child) => child.type === 'element',
    ) as HastElement | undefined;

    return (
      <div
        className="bg-background my-3 max-w-full overflow-hidden rounded-lg border"
        data-testid="demo-code-block"
      >
        <div className="bg-muted/60 flex h-8 items-center justify-between border-b pl-3 pr-2.5">
          <span className="text-muted-foreground font-mono text-[11px] uppercase tracking-wide">
            {codeLanguage(code?.properties?.className) ?? 'text'}
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <Copy className="size-3" aria-hidden="true" />
            Copy
          </span>
        </div>
        <pre>{children}</pre>
      </div>
    );
  },
  code: ({ className, children }) => {
    const language = codeLanguage(className);

    if (!language) {
      return <code className={className}>{children}</code>;
    }

    return (
      <code className={cn('hljs', className)}>
        {highlight(textOf(children), language).map((token, position) =>
          token.kind ? (
            <span key={position} className={`hljs-${token.kind}`}>
              {token.text}
            </span>
          ) : (
            token.text
          ),
        )}
      </code>
    );
  },
});

const remarkPlugins = [remarkGfm];

type AnswerMarkdownProps = {
  content: string;
  citations: { index: number }[];
  /** Puts the blinking caret after the last character, as the chat does while an answer streams. */
  streaming?: boolean;
  className?: string;
};

/**
 * An answer's Markdown in the chat's own prose styles, with [n] markers as chips. Nothing in it
 * is a link or a button: the landing demo is a picture of the product, not a way out of the page.
 */
export const AnswerMarkdown = memo(function AnswerMarkdown({
  content,
  citations,
  streaming = false,
  className,
}: AnswerMarkdownProps) {
  const components = useMemo(() => buildComponents(citations), [citations]);

  return (
    <div className={cn('answer-prose', className)} data-testid="demo-answer">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={streaming ? [rehypeStreamingCaret] : []}
        components={components}
      >
        {linkCitationMarkers(content)}
      </ReactMarkdown>
    </div>
  );
});
