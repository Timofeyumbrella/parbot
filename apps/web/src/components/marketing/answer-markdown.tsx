'use client';

import { cn } from 'cn';
import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { CitationMarker, type DemoCitation } from './demo-window';

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

const buildComponents = (citations: DemoCitation[]): Components => ({
  a: ({ href, children }) => {
    if (href?.startsWith(CITE_PREFIX)) {
      const index = Number(href.slice(CITE_PREFIX.length));

      return <CitationMarker index={index} citation={citations.find((citation) => citation.index === index)} />;
    }

    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
        {children}
      </a>
    );
  },
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
  li: ({ children }) => <li className="my-0.5">{children}</li>,
  h1: ({ children }) => <p className="my-2 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="my-2 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="my-2 font-semibold">{children}</p>,
  pre: ({ children }) => (
    <pre className="bg-muted my-2 overflow-x-auto rounded-md p-3 font-mono text-xs leading-relaxed">{children}</pre>
  ),
  code: ({ children, className }) => (
    <code className={cn('bg-muted rounded px-1 py-0.5 font-mono text-[0.85em] [pre_&]:bg-transparent [pre_&]:p-0', className)}>
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left">
        {children}
      </table>
    </div>
  ),
});

/** Renders an answer's Markdown with its [n] markers as citation chips. */
export const AnswerMarkdown = ({ content, citations }: { content: string; citations: DemoCitation[] }) => {
  const components = useMemo(() => buildComponents(citations), [citations]);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {linkCitationMarkers(content)}
    </ReactMarkdown>
  );
};
