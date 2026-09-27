import { cn } from 'cn';
import { Code2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/format';
import { answerRate, EMPTY_TOTALS, pageLabel } from '@/lib/overview';

import { Section, SectionEmpty } from './section';

export type ReaderPage = {
  host: string;
  path: string;
  /** The latest full address a question came from, so the link opens a real page. */
  pageUrl: string;
  questions: number;
  answered: number;
  unanswered: number;
};

/** Below this share of answers, a page's topic is thin in the docs and the rate is flagged. */
export const LOW_ANSWER_RATE = 50;

const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);

export type ReaderPagesProps = {
  assistantId: string;
  pages: ReaderPage[];
  total: number;
};

/** The pages of the docs site the widget is used on, busiest first, with how well each is served. */
export const ReaderPages = ({ assistantId, pages, total }: ReaderPagesProps) => (
  <Section
    testId="reader-pages"
    title="Where readers ask"
    count={pages.length > 0 ? total : undefined}
    why="The pages readers need help on most. A low answer rate on a page means its topic is thin in the docs."
    footer={
      total > pages.length
        ? `${formatCount(total - pages.length)} more ${total - pages.length === 1 ? 'page' : 'pages'} with fewer questions.`
        : undefined
    }
  >
    {pages.length === 0 ? (
      <SectionEmpty
        action={
          <Button asChild size="sm" variant="outline">
            <Link href={`/a/${assistantId}/widget`}>
              <Code2 data-icon="inline-start" aria-hidden="true" />
              Get the embed code
            </Link>
          </Button>
        }
      >
        No widget questions in this period. This fills once the widget is on your docs site: each
        row is a page readers asked from.
      </SectionEmpty>
    ) : (
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th scope="col" className="pl-(--card-spacing) py-2 pr-2 font-medium">
              Page
            </th>
            <th scope="col" className="w-20 px-2 py-2 text-right font-medium">
              Questions
            </th>
            <th scope="col" className="pr-(--card-spacing) w-20 py-2 pl-2 text-right font-medium">
              Answered
            </th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => {
            const rate = answerRate({
              ...EMPTY_TOTALS,
              answered: page.answered,
              unanswered: page.unanswered,
            });
            const low = rate.percent !== null && rate.percent < LOW_ANSWER_RATE;
            const href = safeHref(page.pageUrl);

            return (
              <tr
                key={`${page.host}${page.path}`}
                className="border-b last:border-0"
                data-testid="page-row"
              >
                <td className="pl-(--card-spacing) min-w-0 py-2 pr-2">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate font-medium hover:underline"
                      title={pageLabel(page.host, page.path)}
                    >
                      {page.path}
                    </a>
                  ) : (
                    <span className="block truncate font-medium">{page.path}</span>
                  )}
                  {page.host ? (
                    <span className="text-muted-foreground block truncate text-xs">
                      {page.host}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-right tabular-nums" data-testid="page-questions">
                  {formatCount(page.questions)}
                </td>
                <td
                  className={cn(
                    'pr-(--card-spacing) py-2 pl-2 text-right tabular-nums',
                    low && 'text-destructive font-medium',
                  )}
                  data-testid="page-rate"
                  title={
                    rate.whole > 0
                      ? `${formatCount(rate.part)} of ${formatCount(rate.whole)} answers came from the docs`
                      : 'No finished answers yet'
                  }
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    {low ? <TriangleAlert aria-hidden="true" className="size-3 shrink-0" /> : null}
                    {rate.percent === null ? '–' : `${rate.percent}%`}
                  </span>
                  {low ? <span className="sr-only"> (low)</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )}
  </Section>
);
