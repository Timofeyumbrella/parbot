'use client';

import type { Citation } from '@parbot/shared';
import { cn } from 'cn';
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
} from '@/lib/chat/markdown';

import './answer.css';

type AnswerMarkdownProps = {
  content: string;
  citations: Citation[];
  /** The id the sources row carries, so a chip without a url can jump to it. */
  sourcesId: string;
  streaming?: boolean;
  className?: string;
};

const remarkPlugins = [remarkGfm];

const CitationChip = ({ index, citation, sourcesId }: { index: number; citation?: Citation; sourcesId: string }) => {
  const href = citation?.url ?? `#${sourcesId}`;
  const external = Boolean(citation?.url);

  return (
    <sup data-citation={index} className="mx-0.5">
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        title={citation?.title}
        className="bg-accent text-accent-foreground hover:bg-primary hover:text-primary-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 align-baseline font-mono text-[10px] font-medium no-underline transition-colors"
      >
        {index}
      </a>
    </sup>
  );
};

/** react-markdown hands every component its hast `node`; the DOM must not receive it. */
const domProps = <T extends { node?: unknown }>(props: T): Omit<T, 'node'> => {
  const rest: Record<string, unknown> = { ...props };

  delete rest.node;

  return rest as Omit<T, 'node'>;
};

const buildComponents = (citations: Citation[], sourcesId: string): Components => ({
  pre: ({ node, children }) => {
    const element = node as unknown as HastElement | undefined;
    const code = element?.children.find((child) => child.type === 'element') as HastElement | undefined;

    return (
      <CodeBlock language={codeLanguage(code?.properties?.className)} code={hastText(code).replace(/\n$/, '')}>
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
      <CitationChip index={index} citation={citations.find((citation) => citation.index === index)} sourcesId={sourcesId} />
    );
  },
  a: ({ href, children, ...rest }) => {
    const external = typeof href === 'string' && /^https?:\/\//i.test(href);

    return (
      <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} {...domProps(rest)}>
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
  streaming = false,
  className,
}: AnswerMarkdownProps) {
  const max = citations.length;

  const rehypePlugins = useMemo(() => {
    const plugins: NonNullable<React.ComponentProps<typeof ReactMarkdown>['rehypePlugins']> = [
      [rehypeHighlight, { detect: false }],
    ];

    if (max > 0) {
      plugins.push([rehypeCitations, { max }]);
    }

    if (streaming) {
      plugins.push(rehypeStreamingCaret);
    }

    return plugins;
  }, [max, streaming]);

  const components = useMemo(() => buildComponents(citations, sourcesId), [citations, sourcesId]);

  return (
    <div className={cn('answer-prose', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
