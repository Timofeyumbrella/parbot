import type { Citation } from '@parbot/shared';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';

import { hostnameOf } from '@/lib/chat/format';
import { groupCitationsByPage } from '@/lib/citations';
import { documentHref } from '@/lib/knowledge/links';

const CHIP =
  'bg-card hover:bg-muted inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs transition-colors';

/**
 * The sources row under an answer, shared by the chat and the Inbox transcript so an answer reads
 * the same on both screens. A web page opens in a new tab; a file or a note (no url) opens in the
 * document viewer at the cited passage when `assistantId` says whose viewer. `id` is where an
 * inline marker without anywhere else to go points; the scroll margin keeps the row clear of the
 * fixed phone header when a marker jumps to it.
 */
export const Sources = ({
  citations,
  id,
  assistantId,
}: {
  citations: Citation[];
  id: string;
  assistantId?: string;
}) => (
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

      // The lowest marker's passage: the first one a reader matching numbers would look for.
      const viewer =
        !citation.url && assistantId && citation.documentId
          ? documentHref(assistantId, citation.documentId, members[0]?.chunkId)
          : null;

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
      ) : viewer ? (
        <Link key={indexes[0]} href={viewer} title={title} className={CHIP}>
          {inner}
        </Link>
      ) : (
        <span key={indexes[0]} title={title} className={CHIP}>
          {inner}
        </span>
      );
    })}
  </div>
);
