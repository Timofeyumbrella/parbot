import { safeHttpUrl } from '@parbot/shared';
import Markdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

import { CodeBlock } from '@/components/chat/code-block';
import { codeLanguage, type HastElement, hastText } from '@/lib/chat/markdown';
import { rehypePassage } from '@/lib/knowledge/passage';

import '@/components/chat/answer.css';
import './document.css';

/** react-markdown hands every component its hast `node`; the DOM must not receive it. */
const domProps = <T extends { node?: unknown }>(props: T): Omit<T, 'node'> => {
  const rest: Record<string, unknown> = { ...props };

  delete rest.node;

  return rest as Omit<T, 'node'>;
};

/**
 * A link or image address from the page, made absolute against the page's own address. Relative
 * addresses in a file have nothing to resolve against, and would point into this app; they are
 * dropped.
 */
export const resolveAddress = (href: unknown, base: string | null) => {
  if (typeof href !== 'string' || !href.trim()) {
    return null;
  }

  const absolute = safeHttpUrl(href);

  if (absolute) {
    return absolute;
  }

  if (!base) {
    return null;
  }

  try {
    return safeHttpUrl(new URL(href, base).toString());
  } catch {
    return null;
  }
};

const buildComponents = (baseUrl: string | null): Components => ({
  pre: ({ node, children }) => {
    const element = node as unknown as HastElement | undefined;
    const code = element?.children.find((child) => child.type === 'element') as
      HastElement | undefined;
    const passage = element?.properties?.dataPassage === 'true';

    return (
      <div
        data-passage={passage ? 'true' : undefined}
        id={typeof element?.properties?.id === 'string' ? element.properties.id : undefined}
      >
        <CodeBlock
          language={codeLanguage(code?.properties?.className)}
          code={hastText(code).replace(/\n$/, '')}
        >
          {children}
        </CodeBlock>
      </div>
    );
  },
  a: ({ href, children, ...rest }) => {
    const target = resolveAddress(href, baseUrl);

    return target ? (
      <a href={target} target="_blank" rel="noreferrer" {...domProps(rest)}>
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
  img: ({ src, alt }) => {
    const target = resolveAddress(src, baseUrl);

    return target ? (
      // A docs page's own images, from wherever the page keeps them; next/image would need every
      // host configured up front.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={target} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />
    ) : alt ? (
      <span className="text-muted-foreground">[{alt}]</span>
    ) : null;
  },
  table: ({ children, ...rest }) => (
    <div className="answer-table">
      <table {...domProps(rest)}>{children}</table>
    </div>
  ),
});

const remarkPlugins = [remarkGfm];

export type RenderedDocument = { body: React.ReactNode; matched: boolean };

/**
 * Renders an indexed page's Markdown, with the cited passage marked when there is one. Returns
 * whether the passage was found, so the viewer can quote it instead when it was not. Rendering
 * runs here, synchronously, on the server: the highlight is part of the first paint.
 */
export const renderDocument = (
  content: string,
  options: { passage?: string | null; baseUrl?: string | null } = {},
): RenderedDocument => {
  let matched = false;
  // Markdown is a plain function of its props (no hooks), so calling it here gives the element
  // tree and, through the plugin, whether the passage was found, in the same pass.
  const body = Markdown({
    children: content,
    remarkPlugins,
    rehypePlugins: [
      [rehypeHighlight, { detect: false }],
      [
        rehypePassage,
        {
          passage: options.passage,
          onMatch: (found: boolean) => {
            matched = found;
          },
        },
      ],
    ],
    components: buildComponents(options.baseUrl ?? null),
  });

  return { body: <div className="answer-prose document-prose">{body}</div>, matched };
};
