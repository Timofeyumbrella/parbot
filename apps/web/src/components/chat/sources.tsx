import type { Citation } from '@parbot/shared';
import { ExternalLink } from 'lucide-react';

import { hostnameOf } from '@/lib/chat/format';

type SourceGroup = { citation: Citation; indexes: number[]; snippets: string[] };

/**
 * One entry per document, in the order the answer first cites it. An answer often cites several
 * passages of the same page; the page is listed once with every marker that points at it, so the
 * row stays short and a reader can still match any marker to its source.
 */
const byDocument = (citations: Citation[]) => {
  const groups = new Map<string, SourceGroup>();

  for (const citation of citations) {
    // Stored rows are only checked for an index and a title; one without a document stands alone.
    const key = citation.documentId || `index:${citation.index}`;
    const group = groups.get(key);

    if (group) {
      group.indexes.push(citation.index);
      group.snippets.push(citation.snippet);
    } else {
      groups.set(key, { citation, indexes: [citation.index], snippets: [citation.snippet] });
    }
  }

  return [...groups.values()];
};

const CHIP =
  'bg-card hover:bg-muted inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs transition-colors';

/**
 * The sources row under an answer, shared by the chat and the Inbox transcript so an answer reads
 * the same on both screens. `id` is where an inline marker without a url points.
 */
export const Sources = ({ citations, id }: { citations: Citation[]; id: string }) => (
  <div id={id} className="flex flex-wrap items-center gap-1.5 pt-1" data-testid="sources">
    <span className="text-muted-foreground mr-0.5 text-xs">Sources</span>
    {byDocument(citations).map(({ citation, indexes, snippets }) => {
      const host = hostnameOf(citation.url);
      const title = snippets.filter(Boolean).join('\n\n') || undefined;
      const inner = (
        <>
          <span className="inline-flex gap-0.5">
            {indexes.map((index) => (
              <span
                key={index}
                className="bg-accent text-accent-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 font-mono text-[10px] font-medium"
              >
                {index}
              </span>
            ))}
          </span>
          <span className="max-w-48 truncate">{citation.title}</span>
          {host ? <span className="text-muted-foreground max-w-32 truncate">{host}</span> : null}
          {citation.url ? <ExternalLink className="text-muted-foreground size-3 shrink-0" /> : null}
        </>
      );

      return citation.url ? (
        <a key={indexes[0]} href={citation.url} target="_blank" rel="noreferrer" title={title} className={CHIP}>
          {inner}
        </a>
      ) : (
        <span key={indexes[0]} title={title} className={CHIP}>
          {inner}
        </span>
      );
    })}
  </div>
);
