'use client';

import type { Citation } from '@parbot/shared';
import { cn } from 'cn';
import Link from 'next/link';
import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

import { CodeBlock } from '@/components/chat/code-block';
import {
  codeLanguage,
  type HastElement,
  hastText,
  rehypeCitations,
  rehypeStreamingCaret,
  rehypeStripCitations,
} from '@/lib/chat/markdown';
import { documentHref } from '@/lib/knowledge/links';

import './answer.css';

type AnswerMarkdownProps = {
  content: string;
  citations: Citation[];
  /** The id the sources row carries, so a chip with nowhere else to go can jump to it. */
  sourcesId: string;
  /** Whose document viewer a file's citation opens in; without it the chip jumps to the row. */
  assistantId?: string;
  streaming?: boolean;
  /** Removes `[n]` markers instead of linking them: for a stopped answer that got no citations. */
  stripCitations?: boolean;
  className?: string;
};

const remarkPlugins = [remarkGfm];

const CHIP_CLASS =
  'bg-accent text-accent-foreground hover:bg-primary hover:text-primary-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 align-baseline font-mono text-[10px] font-medium no-underline transition-colors';

const CitationChip = ({
  index,
  citation,
  sourcesId,
  assistantId,
}: {
  index: number;
  citation?: Citation;
  sourcesId: string;
  assistantId?: string;
}) => {
  // A web page opens itself; a file or a note opens in the viewer at the passage this marker cites.
  const viewer =
    citation && !citation.url && assistantId && citation.documentId
      ? documentHref(assistantId, citation.documentId, citation.chunkId)
      : null;

  return (
    <sup data-citation={index} className="mx-0.5">
      {viewer ? (
        <Link href={viewer} title={citation?.title} className={CHIP_CLASS}>
          {index}
        </Link>
      ) : (
        <a
          href={citation?.url ?? `#${sourcesId}`}
          target={citation?.url ? '_blank' : undefined}
          rel={citation?.url ? 'noreferrer' : undefined}
          title={citation?.title}
          className={CHIP_CLASS}
        >
          {index}
        </a>
      )}
    </sup>
  );
};

/** react-markdown hands every component its hast `node`; the DOM must not receive it. */
const domProps = <T extends { node?: unknown }>(props: T): Omit<T, 'node'> => {
  const rest: Record<string, unknown> = { ...props };

  delete rest.node;

  return rest as Omit<T, 'node'>;
};

const buildComponents = (
  citations: Citation[],
  sourcesId: string,
  assistantId: string | undefined,
): Components => ({
  pre: ({ node, children }) => {
    const element = node as unknown as HastElement | undefined;
    const code = element?.children.find((child) => child.type === 'element') as
      HastElement | undefined;

    return (
      <CodeBlock
        language={codeLanguage(code?.properties?.className)}
        code={hastText(code).replace(/\n$/, '')}
      >
        {children}
      </CodeBlock>
    );
  },
  sup: ({ children, ...rest }) => {
    const props = domProps(rest);
    const marker = (props as Record<string, unknown>)['data-citation'];

    if (typeof marker !== 'string' && typeof marker !== 'number') {
      return <sup {...props}>{children}</sup>;
    }

    const index = Number(marker);

    return (
      <CitationChip
        index={index}
        citation={citations.find((citation) => citation.index === index)}
        sourcesId={sourcesId}
        assistantId={assistantId}
      />
    );
  },
  a: ({ href, children, ...rest }) => {
    const external = typeof href === 'string' && /^https?:\/\//i.test(href);

    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        {...domProps(rest)}
      >
        {children}
      </a>
    );
  },
  table: ({ children, ...rest }) => (
    <div className="answer-table">
      <table {...domProps(rest)}>{children}</table>
    </div>
  ),
});

/** Renders an answer's Markdown: GFM, highlighted code, [n] markers as chips, and the caret while streaming. */
export const AnswerMarkdown = memo(function AnswerMarkdown({
  content,
  citations,
  sourcesId,
  assistantId,
  streaming = false,
  stripCitations = false,
  className,
}: AnswerMarkdownProps) {
  // Indexes are the passages' places in the prompt and only cited ones are kept, so an answer
  // citing [2] and [5] has two citations; counting them would leave the [5] marker as plain text.
  const max = citations.reduce((highest, citation) => Math.max(highest, citation.index), 0);

  const rehypePlugins = useMemo(() => {
    const plugins: NonNullable<React.ComponentProps<typeof ReactMarkdown>['rehypePlugins']> = [
      [rehypeHighlight, { detect: false }],
    ];

    if (stripCitations) {
      plugins.push(rehypeStripCitations);
    } else if (max > 0) {
      plugins.push([rehypeCitations, { max }]);
    }

    if (streaming) {
      plugins.push(rehypeStreamingCaret);
    }

    return plugins;
  }, [max, streaming, stripCitations]);

  const components = useMemo(
    () => buildComponents(citations, sourcesId, assistantId),
    [citations, sourcesId, assistantId],
  );

  return (
    <div className={cn('answer-prose', className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
