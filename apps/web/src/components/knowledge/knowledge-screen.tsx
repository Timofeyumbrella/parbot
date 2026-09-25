'use client';

import { BookOpen, Info, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import type { Source } from '@/lib/db';

import { ADD_SOURCE_TABS, AddSourceDialog, type AddSourceTab } from './add-source-dialog';
import { type MeterPlan, PagesMeter } from './pages-meter';
import { SourceRow } from './source-row';
import { useSources } from './use-sources';

export type KnowledgeScreenProps = {
  assistantId: string;
  /** The signed-in account, stamped on rows the screen draws before the server has answered. */
  ownerId: string;
  initialSources: Source[];
  initialPagesUsed: number;
  plan: MeterPlan;
  /** False when answers come from the deterministic stub rather than a model. */
  liveAi: boolean;
};

/** Written for the account, not the operator: how to connect a model lives in the README. */
export const STUB_NOTICE = 'Answers are placeholders until an AI model is connected. Sources are indexed as usual.';

const EmptyState = ({ onPick }: { onPick: (tab: AddSourceTab) => void }) => (
  <section className="flex flex-col items-center gap-5 rounded-xl border border-dashed px-6 py-12 text-center">
    <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
      <BookOpen className="size-5" aria-hidden="true" />
    </span>
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-semibold">Point Parbot at your docs</h2>
      <p className="text-muted-foreground max-w-md text-sm">
        Add a website, a sitemap, a file or some text. Parbot indexes it and answers from it, with citations.
      </p>
    </div>
    <div className="grid w-full max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
      {ADD_SOURCE_TABS.map((tab) => (
        <Button key={tab.id} variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => onPick(tab.id)}>
          <tab.icon className="text-muted-foreground" aria-hidden="true" />
          {tab.label}
        </Button>
      ))}
    </div>
  </section>
);

export const KnowledgeScreen = ({ assistantId, ownerId, initialSources, initialPagesUsed, plan, liveAi }: KnowledgeScreenProps) => {
  const [dialog, setDialog] = useState<{ open: boolean; tab: AddSourceTab }>({ open: false, tab: 'url' });
  const { sources, pagesUsed, error, refetch, addPending, settleAdd, reindex, remove } = useSources({
    assistantId,
    initialSources,
    initialPagesUsed,
  });

  const openDialog = (tab: AddSourceTab) => setDialog({ open: true, tab });

  const handleSettled = useCallback(
    (id: string, source: Source | null) => {
      settleAdd(id, source);

      if (source) {
        toast.success(`Added ${source.title}. Indexing has started.`);
      }
    },
    [settleAdd],
  );

  return (
    <>
      <PageHeader
        title="Knowledge"
        description="Everything the assistant answers from."
        actions={
          <>
            <PagesMeter used={pagesUsed} plan={plan} className="hidden sm:flex" />
            <Button onClick={() => openDialog('url')}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              Add source
            </Button>
          </>
        }
      />

      <PagesMeter used={pagesUsed} plan={plan} className="w-full sm:hidden" />

      {liveAi ? null : (
        <div role="status" className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p>{STUB_NOTICE}</p>
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <span>The list could not be refreshed. Check your connection; the rows shown may be out of date.</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {sources.length === 0 ? (
        <EmptyState onPick={openDialog} />
      ) : (
        <ul className="divide-border bg-card divide-y rounded-xl border" aria-label="Sources">
          {sources.map((source) => (
            <SourceRow key={source.id} source={source} onReindex={reindex} onDelete={remove} />
          ))}
        </ul>
      )}

      <AddSourceDialog
        assistantId={assistantId}
        ownerId={ownerId}
        open={dialog.open}
        tab={dialog.tab}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        onTabChange={(tab) => setDialog((current) => ({ ...current, tab }))}
        onPending={addPending}
        onSettled={handleSettled}
      />
    </>
  );
};
