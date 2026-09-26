import type { Citation } from '@parbot/shared';
import { ExternalLink } from 'lucide-react';

import { hostnameOf } from '@/lib/chat/format';
import { groupCitationsByPage } from '@/lib/citations';

const CHIP =
  'bg-card hover:bg-muted inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs transition-colors';

/**
 * The sources row under an answer, shared by the chat and the Inbox transcript so an answer reads
 * the same on both screens. `id` is where an inline marker without a url points; the scroll margin
 * keeps the row clear of the fixed phone header when a marker jumps to it.
 */
export const Sources = ({ citations, id }: { citations: Citation[]; id: string }) => (
  <div
    id={id}
    className="flex scroll-mt-16 flex-wrap items-center gap-1.5 pt-1"
    data-testid="sources"
  >
    <span className="text-muted-foreground mr-0.5 text-xs">Sources</span>
    {/* Pages keep the order the answer first cites them in, the order a reader meets them. */}
    {groupCitationsByPage(citations).map(({ citation, indexes, members }) => {
      const host = hostnameOf(citation.url);
      const title =
        members
          .map(({ snippet }) => snippet)
          .filter(Boolean)
          .join('\n\n') || undefined;
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
        <a
          key={indexes[0]}
          href={citation.url}
          target="_blank"
          rel="noreferrer"
          title={title}
          className={CHIP}
        >
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
