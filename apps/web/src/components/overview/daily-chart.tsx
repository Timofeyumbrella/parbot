import { type DailyRow, dayLabel, labelIndexes, niceTicks } from '@/lib/analytics';
import { formatCount } from '@/lib/format';

/**
 * Two drawings of the same data: a wide one for desktop widths and a narrower one below the `sm`
 * breakpoint. A single 720-unit viewBox squeezed into a phone made the labels four pixels tall;
 * drawing at the phone's own scale keeps them legible. Both are short: the trend sits under the
 * quality numbers as context, not as the page's headline.
 */
const VARIANTS = {
  wide: { width: 720, height: 150, className: 'hidden sm:block' },
  narrow: { width: 360, height: 150, className: 'sm:hidden' },
} as const;

type Variant = keyof typeof VARIANTS;

const MARGIN = { top: 12, right: 8, bottom: 24, left: 36 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;
const FONT = 11;

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

export const describeDay = (row: DailyRow) =>
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

type PlotProps = {
  rows: DailyRow[];
  days: number;
  max: number;
  ticks: number[];
  variant: Variant;
};

const Plot = ({ rows, days, max, ticks, variant }: PlotProps) => {
  const { width, height, className } = VARIANTS[variant];
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const baseline = MARGIN.top + plotHeight;
  const top = ticks[ticks.length - 1] || 1;
  const slot = rows.length > 0 ? plotWidth / rows.length : plotWidth;
  const barWidth = Math.min(MAX_BAR, Math.max(slot * 0.6, 3));
  const labelled = new Set(labelIndexes(rows.length, plotWidth));
  const scale = (value: number) => (value / top) * plotHeight;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`h-auto w-full ${className}`}
      role="img"
      data-testid={`chart-${variant}`}
      aria-label={`Questions per day for the last ${days} days. Peak of ${formatCount(max)} in one day.`}
    >
      {ticks.map((tick) => {
        const y = baseline - scale(tick);

        return (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
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
              fontSize={FONT}
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
        const answeredTop = baseline - answeredHeight;
        const unansweredTop = answeredTop - (hasAnswered ? GAP : 0) - unansweredHeight;
        const unansweredVisible = hasUnanswered
          ? Math.max(unansweredHeight - (hasAnswered ? GAP : 0), 1)
          : 0;

        return (
          <g
            key={row.day}
            data-day={row.day}
            data-testid="chart-bar"
            tabIndex={0}
            className="outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80"
          >
            <title>{describeDay(row)}</title>
            {/* Hit target: the whole slot, not only the painted bar. */}
            <rect
              x={MARGIN.left + slot * index}
              y={MARGIN.top}
              width={slot}
              height={plotHeight}
              fill="transparent"
            />
            {hasAnswered ? (
              hasUnanswered ? (
                <rect
                  x={x}
                  y={answeredTop}
                  width={barWidth}
                  height={answeredHeight}
                  className="fill-chart-2"
                />
              ) : (
                <path
                  d={roundedTop(x, answeredTop, barWidth, answeredHeight)}
                  className="fill-chart-2"
                />
              )
            ) : null}
            {hasUnanswered ? (
              <path
                d={roundedTop(x, unansweredTop, barWidth, unansweredVisible)}
                className="fill-chart-1"
              />
            ) : null}
            {labelled.has(index) ? (
              <text
                x={MARGIN.left + slot * index + slot / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={FONT}
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
        x2={width - MARGIN.right}
        y1={baseline}
        y2={baseline}
        className="stroke-border"
        strokeWidth={1}
        shapeRendering="crispEdges"
      />
    </svg>
  );
};

export type DailyChartProps = {
  rows: DailyRow[];
  days: number;
};

/**
 * One column per day, answered questions at the base and unanswered stacked on top with a
 * surface gap between them: the volume and the answer rate in one compact drawing. Plain SVG so
 * it renders on the server and scales with its container.
 */
export const DailyChart = ({ rows, days }: DailyChartProps) => {
  const max = rows.reduce((peak, row) => Math.max(peak, row.answered + row.unanswered), 0);
  const ticks = niceTicks(max);
  const empty = max === 0;

  return (
    <div className="flex flex-col gap-2" data-testid="daily-chart">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 className="text-muted-foreground text-xs font-medium">
          Questions per day, in UTC days
        </h3>
        {empty ? null : <Legend />}
      </div>
      {empty ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No answers in this period. Ask one in Chat or wait for widget traffic.
        </p>
      ) : (
        <>
          <Plot rows={rows} days={days} max={max} ticks={ticks} variant="wide" />
          <Plot rows={rows} days={days} max={max} ticks={ticks} variant="narrow" />
          <details className="text-muted-foreground text-xs">
            <summary className="hover:text-foreground w-fit cursor-pointer select-none">
              Show as a table
            </summary>
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
        </>
      )}
    </div>
  );
};
