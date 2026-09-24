import { ArrowUpRight, BookOpen } from 'lucide-react';
import Link from 'next/link';

import { LocalTime } from '@/components/inbox/local-time';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCount } from '@/lib/format';

export type TopQuestion = {
  question: string;
  asks: number;
  last_asked_at: string;
};

export type UnansweredQuestion = TopQuestion & {
  conversation_id: string;
};

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground px-(--card-spacing) py-8 text-center text-sm">{children}</p>
);

const Row = ({
  question,
  asks,
  lastAskedAt,
  now,
  href,
}: {
  question: string;
  asks: number;
  lastAskedAt: string;
  now: number;
  href?: string;
}) => {
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate" title={question}>
        {question}
      </span>
      <span
        className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums"
        title={`Asked ${formatCount(asks)} ${asks === 1 ? 'time' : 'times'}`}
      >
        {formatCount(asks)}
        {asks === 1 ? ' time' : ' times'}
      </span>
      <LocalTime value={lastAskedAt} now={now} className="text-muted-foreground w-16 shrink-0 text-right text-xs" />
    </>
  );

  return (
    <li className="border-b last:border-0">
      {href ? (
        <Link
          href={href}
          className="hover:bg-muted/60 flex items-center gap-3 px-(--card-spacing) py-2 text-sm transition-colors"
        >
          {body}
          <ArrowUpRight aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-(--card-spacing) py-2 text-sm">{body}</div>
      )}
    </li>
  );
};

export const TopQuestions = ({ rows, now }: { rows: TopQuestion[]; now: number }) => (
  <Card className="gap-0" data-testid="top-questions">
    <CardHeader className="border-b pb-(--card-spacing)">
      <CardTitle>Top questions</CardTitle>
      <CardDescription>What people ask most often.</CardDescription>
    </CardHeader>
    <CardContent className="p-0">
      {rows.length === 0 ? (
        <Empty>No questions in this period.</Empty>
      ) : (
        <ul>
          {rows.map((row) => (
            <Row key={row.question} question={row.question} asks={row.asks} lastAskedAt={row.last_asked_at} now={now} />
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

export const UnansweredQuestions = ({
  rows,
  now,
  assistantId,
}: {
  rows: UnansweredQuestion[];
  now: number;
  assistantId: string;
}) => (
  <Card className="gap-0" data-testid="unanswered-questions">
    <CardHeader className="border-b pb-(--card-spacing)">
      <CardTitle>Unanswered questions</CardTitle>
      <CardDescription>Questions the documentation could not answer.</CardDescription>
    </CardHeader>
    <CardContent className="p-0">
      {rows.length === 0 ? (
        <Empty>Nothing unanswered in this period.</Empty>
      ) : (
        <>
          <ul>
            {rows.map((row) => (
              <Row
                key={`${row.question}-${row.conversation_id}`}
                question={row.question}
                asks={row.asks}
                lastAskedAt={row.last_asked_at}
                now={now}
                href={`/a/${assistantId}/inbox/${row.conversation_id}`}
              />
            ))}
          </ul>
          <div className="bg-muted/50 border-t px-(--card-spacing) py-2.5">
            <Link
              href={`/a/${assistantId}/knowledge`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
            >
              <BookOpen aria-hidden="true" className="size-3.5" />
              Add docs that cover these
            </Link>
          </div>
        </>
      )}
    </CardContent>
  </Card>
);
