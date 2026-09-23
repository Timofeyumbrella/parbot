import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type DailyRow, dayLabel, formatCount, niceTicks } from '@/lib/analytics';

const WIDTH = 720;
const HEIGHT = 220;
const MARGIN = { top: 12, right: 8, bottom: 24, left: 36 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const BASELINE = MARGIN.top + PLOT_HEIGHT;

/** A rect with rounded top corners and a square base, the data-end of a column. */
const roundedTop = (x: number, y: number, width: number, height: number) => {
  const r = Math.min(RADIUS, width / 2, height);

  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height}`,
    'Z',
  ].join(' ');
};

const describe = (row: DailyRow) =>
  `${dayLabel(row.day)}: ${formatCount(row.questions)} ${row.questions === 1 ? 'question' : 'questions'}, ${formatCount(row.answered)} answered, ${formatCount(row.unanswered)} unanswered`;

const Legend = () => (
  <ul className="text-muted-foreground flex items-center gap-4 text-xs" aria-label="Legend">
    <li className="flex items-center gap-1.5">
      <span aria-hidden="true" className="bg-chart-2 inline-block h-2.5 w-3 rounded-[3px]" />
      Answered
    </li>
    <li className="flex items-center gap-1.5">
      <span aria-hidden="true" className="bg-chart-1 inline-block h-2.5 w-3 rounded-[3px]" />
      Unanswered
    </li>
  </ul>
);

export type DailyChartProps = {
  rows: DailyRow[];
  days: number;
};

/**
 * One column per day, answered questions at the base and unanswered stacked on top with a
 * surface gap between them. Plain SVG so it renders on the server and scales with the card.
 */
export const DailyChart = ({ rows, days }: DailyChartProps) => {
  const max = rows.reduce((peak, row) => Math.max(peak, row.answered + row.unanswered), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const slot = rows.length > 0 ? PLOT_WIDTH / rows.length : PLOT_WIDTH;
  const barWidth = Math.min(MAX_BAR, Math.max(slot * 0.6, 4));
  const labelEvery = rows.length <= 7 ? 1 : 5;
  const scale = (value: number) => (value / top) * PLOT_HEIGHT;
  const empty = max === 0;

  return (
    <Card data-testid="daily-chart">
      <CardHeader className="border-b">
        <CardTitle>Questions per day</CardTitle>
        <CardDescription>Answered and unanswered, over the last {days} days.</CardDescription>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end" data-slot="card-action">
          <Legend />
        </div>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            No questions in this period. Ask one in Chat or wait for widget traffic.
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Questions per day for the last ${days} days. Peak of ${formatCount(max)} in one day.`}
          >
            {ticks.map((tick) => {
              const y = BASELINE - scale(tick);

              return (
                <g key={tick}>
                  <line
                    x1={MARGIN.left}
                    x2={WIDTH - MARGIN.right}
                    y1={y}
                    y2={y}
                    className="stroke-border"
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <text
                    x={MARGIN.left - 8}
                    y={y}
                    dy="0.35em"
                    textAnchor="end"
                    fontSize={10}
                    className="fill-muted-foreground tabular-nums"
                  >
                    {formatCount(tick)}
                  </text>
                </g>
              );
            })}

            {rows.map((row, index) => {
              const x = MARGIN.left + slot * index + (slot - barWidth) / 2;
              const answeredHeight = scale(row.answered);
              const unansweredHeight = scale(row.unanswered);
              const hasAnswered = row.answered > 0;
              const hasUnanswered = row.unanswered > 0;
              const answeredTop = BASELINE - answeredHeight;
              const unansweredTop = answeredTop - (hasAnswered ? GAP : 0) - unansweredHeight;
              const unansweredVisible = hasUnanswered ? Math.max(unansweredHeight - (hasAnswered ? GAP : 0), 1) : 0;
              const showLabel = index % labelEvery === 0 || index === rows.length - 1;

              return (
                <g
                  key={row.day}
                  data-day={row.day}
                  data-testid="chart-bar"
                  tabIndex={0}
                  className="outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80"
                >
                  <title>{describe(row)}</title>
                  {/* Hit target: the whole slot, not only the painted bar. */}
                  <rect x={MARGIN.left + slot * index} y={MARGIN.top} width={slot} height={PLOT_HEIGHT} fill="transparent" />
                  {hasAnswered ? (
                    hasUnanswered ? (
                      <rect x={x} y={answeredTop} width={barWidth} height={answeredHeight} className="fill-chart-2" />
                    ) : (
                      <path d={roundedTop(x, answeredTop, barWidth, answeredHeight)} className="fill-chart-2" />
                    )
                  ) : null}
                  {hasUnanswered ? (
                    <path
                      d={roundedTop(x, unansweredTop, barWidth, unansweredVisible)}
                      className="fill-chart-1"
                    />
                  ) : null}
                  {showLabel ? (
                    <text
                      x={MARGIN.left + slot * index + slot / 2}
                      y={HEIGHT - 6}
                      textAnchor="middle"
                      fontSize={10}
                      className="fill-muted-foreground"
                    >
                      {dayLabel(row.day)}
                    </text>
                  ) : null}
                </g>
              );
            })}

            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={BASELINE}
              y2={BASELINE}
              className="stroke-border"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          </svg>
        )}

        {empty ? null : (
          <details className="text-muted-foreground mt-3 text-xs">
            <summary className="hover:text-foreground cursor-pointer select-none">Show as a table</summary>
            <table className="mt-2 w-full text-left tabular-nums">
              <thead>
                <tr className="border-b">
                  <th className="py-1 pr-2 font-medium">Day</th>
                  <th className="py-1 pr-2 text-right font-medium">Questions</th>
                  <th className="py-1 pr-2 text-right font-medium">Answered</th>
                  <th className="py-1 text-right font-medium">Unanswered</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.day} className="border-b last:border-0">
                    <td className="py-1 pr-2">{dayLabel(row.day)}</td>
                    <td className="py-1 pr-2 text-right">{formatCount(row.questions)}</td>
                    <td className="py-1 pr-2 text-right">{formatCount(row.answered)}</td>
                    <td className="py-1 text-right">{formatCount(row.unanswered)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </CardContent>
    </Card>
  );
};
