import { ExternalLink, FileText } from 'lucide-react';
import Link from 'next/link';

import { LocalTime } from '@/components/inbox/local-time';
import { formatCount, plural, pluralWord } from '@/lib/format';

import { NextStep, Section } from './section';

type SourceKind = 'url' | 'sitemap' | 'upload' | 'text';

export type ContentDocument = {
  /** Null for a cited page that has since been removed from Knowledge. */
  documentId: string | null;
  title: string;
  url: string | null;
  sourceTitle: string | null;
  sourceKind: SourceKind | null;
};

export type CitedDocument = ContentDocument & { answers: number };

export type UncitedDocument = ContentDocument & { documentId: string; createdAt: string };

const SOURCE_LABEL: Record<SourceKind, string> = {
  url: 'Website',
  sitemap: 'Sitemap',
  upload: 'Upload',
  text: 'Pasted text',
};

/** Where a document's title leads: the page itself when it has an address, else its source. */
export const documentHref = (assistantId: string, document: ContentDocument) =>
  document.url ?? `/a/${assistantId}/knowledge`;

const DocumentTitle = ({
  assistantId,
  document,
}: {
  assistantId: string;
  document: ContentDocument;
}) => {
  const className =
    'hover:text-foreground inline-flex min-w-0 max-w-full items-center gap-1.5 font-medium hover:underline';

  return document.url ? (
    <a
      href={document.url}
      target="_blank"
      rel="noreferrer"
      className={className}
      title={document.url}
    >
      <span className="truncate">{document.title}</span>
      <ExternalLink aria-hidden="true" className="text-muted-foreground size-3 shrink-0" />
    </a>
  ) : (
    <Link href={documentHref(assistantId, document)} className={className}>
      <FileText aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
      <span className="truncate">{document.title}</span>
    </Link>
  );
};

const SourceLine = ({ document }: { document: ContentDocument }) =>
  document.sourceTitle ? (
    <span className="truncate">
      {document.sourceKind ? `${SOURCE_LABEL[document.sourceKind]} · ` : ''}
      {document.sourceTitle}
    </span>
  ) : (
    <span>No longer in Knowledge</span>
  );

const Panel = ({
  title,
  testId,
  children,
}: {
  title: React.ReactNode;
  testId: string;
  children: React.ReactNode;
}) => (
  <div className="flex min-w-0 flex-col" data-testid={testId}>
    <h3 className="px-(--card-spacing) text-muted-foreground pb-1 pt-3 text-xs font-medium">
      {title}
    </h3>
    {children}
  </div>
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground px-(--card-spacing) py-6 text-center text-sm">{children}</p>
);

export type ContentUsageProps = {
  assistantId: string;
  days: number;
  cited: CitedDocument[];
  citedTotal: number;
  uncited: UncitedDocument[];
  uncitedTotal: number;
  indexed: number;
  now: number;
};

/**
 * The pages answers come from, most cited first, and the indexed pages no answer used. The first
 * are the pages worth keeping accurate; the second may be hard to find, duplicated or obsolete.
 */
export const ContentUsage = ({
  assistantId,
  days,
  cited,
  citedTotal,
  uncited,
  uncitedTotal,
  indexed,
  now,
}: ContentUsageProps) => {
  const peak = cited.reduce((max, document) => Math.max(max, document.answers), 0);

  return (
    <Section
      testId="content-usage"
      title="Content that works, and content that does not"
      why="The pages answers come from are the ones readers see: keep them accurate. Pages no answer used may be hard to find, duplicated or out of date."
      footer={
        <NextStep href={`/a/${assistantId}/knowledge`}>Review your sources in Knowledge</NextStep>
      }
    >
      <div className="grid flex-1 divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <Panel
          testId="cited-documents"
          title={
            citedTotal > 0
              ? `Most cited: ${plural(citedTotal, 'page')} used in answers`
              : 'Most cited'
          }
        >
          {cited.length === 0 ? (
            <Note>No answer cited a page in the last {days} days.</Note>
          ) : (
            <ul className="pb-2">
              {cited.map((document) => (
                <li
                  key={document.documentId ?? `${document.url}-${document.title}`}
                  className="px-(--card-spacing) flex flex-col gap-1 py-2 text-sm"
                  data-testid="cited-row"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <DocumentTitle assistantId={assistantId} document={document} />
                    <span
                      className="text-muted-foreground shrink-0 whitespace-nowrap text-xs tabular-nums"
                      data-testid="cited-answers"
                    >
                      {plural(document.answers, 'answer')}
                    </span>
                  </div>
                  {/* Length is the count relative to the most cited page, for scanning. */}
                  <div aria-hidden="true" className="bg-muted h-1 overflow-hidden rounded-full">
                    <div
                      className="bg-chart-2 h-full rounded-full"
                      style={{ width: `${Math.max((document.answers / peak) * 100, 2)}%` }}
                    />
                  </div>
                  <div className="text-muted-foreground flex min-w-0 text-xs">
                    <SourceLine document={document} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          testId="uncited-documents"
          title={
            indexed > 0
              ? `Never cited: ${formatCount(uncitedTotal)} of ${formatCount(indexed)} indexed ${pluralWord(indexed, 'page')}`
              : 'Never cited'
          }
        >
          {indexed === 0 ? (
            <Note>Nothing is indexed yet. Add a source in Knowledge.</Note>
          ) : uncited.length === 0 ? (
            <Note>Every indexed page was cited at least once in the last {days} days.</Note>
          ) : (
            <ul className="pb-2">
              {uncited.map((document) => (
                <li
                  key={document.documentId}
                  className="px-(--card-spacing) flex flex-col gap-0.5 py-2 text-sm"
                  data-testid="uncited-row"
                >
                  <DocumentTitle assistantId={assistantId} document={document} />
                  <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
                    <SourceLine document={document} />
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0 whitespace-nowrap">
                      Added <LocalTime value={document.createdAt} now={now} />
                    </span>
                  </div>
                </li>
              ))}
              {uncitedTotal > uncited.length ? (
                <li className="text-muted-foreground px-(--card-spacing) py-1 text-xs">
                  and {formatCount(uncitedTotal - uncited.length)} more
                </li>
              ) : null}
            </ul>
          )}
        </Panel>
      </div>
    </Section>
  );
};
