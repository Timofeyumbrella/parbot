import { Card } from '@/components/ui/card';
import { formatCount, formatPercent } from '@/lib/format';

export type StatTileProps = {
  label: string;
  value: string;
  caption: string;
};

export const StatTile = ({ label, value, caption }: StatTileProps) => (
  <Card size="sm" className="gap-1" data-testid="stat-tile">
    <div className="text-muted-foreground px-(--card-spacing) text-xs font-medium">{label}</div>
    <div className="px-(--card-spacing) text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    <div className="text-muted-foreground px-(--card-spacing) text-xs">{caption}</div>
  </Card>
);

export type StatTilesProps = {
  days: number;
  conversations: number;
  questions: number;
  answered: number;
  unanswered: number;
  leads: number;
};

/** The four headline numbers of the Overview for the selected period. */
export const StatTiles = ({ days, conversations, questions, answered, unanswered, leads }: StatTilesProps) => {
  const answers = answered + unanswered;
  const period = `in the last ${days} days`;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="stat-tiles">
      <StatTile label="Conversations" value={formatCount(conversations)} caption={`Started ${period}`} />
      <StatTile label="Questions" value={formatCount(questions)} caption={`Asked ${period}`} />
      <StatTile
        label="Answer rate"
        value={formatPercent(answered, answers)}
        caption={
          answers === 0
            ? 'No answers yet'
            : `${formatCount(answered)} of ${formatCount(answers)} answers found in the docs`
        }
      />
      <StatTile label="Leads" value={formatCount(leads)} caption={`Captured ${period}`} />
    </div>
  );
};
