import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { Source } from '@/lib/db';

import { KnowledgeScreen, STUB_NOTICE } from './knowledge-screen';

const { actions, supabase, channel } = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };

  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  const supabase = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    from: vi.fn(),
  };

  return {
    channel,
    supabase,
    actions: {
      addSource: vi.fn(),
      reindexSource: vi.fn(),
      deleteSource: vi.fn(),
    },
  };
});

vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowserClient: () => supabase }));
vi.mock('@/actions/sources', () => actions);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ASSISTANT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

const source = (overrides: Partial<Source> = {}): Source => ({
  id: crypto.randomUUID(),
  assistant_id: ASSISTANT,
  owner_id: '00000000-0000-4000-8000-000000000001',
  kind: 'url',
  title: 'docs.example.com/guide',
  uri: 'https://docs.example.com/guide/',
  storage_path: null,
  mime_type: null,
  byte_size: null,
  status: 'ready',
  error: null,
  pages_found: 12,
  pages_done: 12,
  document_count: 12,
  chunk_count: 48,
  last_indexed_at: new Date().toISOString(),
  created_at: '2026-09-20T10:00:00Z',
  updated_at: '2026-09-20T10:05:00Z',
  ...overrides,
});

const renderScreen = (sources: Source[], props: Partial<React.ComponentProps<typeof KnowledgeScreen>> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>
        <KnowledgeScreen
          assistantId={ASSISTANT}
          initialSources={sources}
          initialPagesUsed={12}
          plan={{ name: 'Hobby', pages: 100 }}
          liveAi
          {...props}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
};

describe('KnowledgeScreen', () => {
  beforeEach(() => {
    supabase.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ order: async () => ({ data: [], error: null }) }),
        then: undefined,
      }),
    }));
  });

  it('shows the empty state with the four ways in, and opens the dialog on the chosen one', async () => {
    const user = userEvent.setup();

    renderScreen([]);

    expect(screen.getByRole('heading', { name: 'Point Parbot at your docs' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Paste text' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add source' });

    expect(within(dialog).getByRole('tab', { name: /Paste text|Text/, selected: true })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Title')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Text')).toBeInTheDocument();
  });

  it('subscribes to the assistant\'s source rows and lists them with status and counts', () => {
    renderScreen([
      source({ title: 'Guide', status: 'indexing', pages_found: 12, pages_done: 4 }),
      source({
        kind: 'upload',
        title: 'manual.pdf',
        uri: null,
        storage_path: 'u/a/x.pdf',
        mime_type: 'application/pdf',
        byte_size: 2048,
        status: 'failed',
        error: 'The uploaded file could not be read from storage.',
        document_count: 0,
        chunk_count: 0,
        last_indexed_at: null,
        created_at: '2026-09-19T10:00:00Z',
      }),
    ]);

    expect(supabase.channel).toHaveBeenCalledWith(`sources:${ASSISTANT}`);
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sources', filter: `assistant_id=eq.${ASSISTANT}` },
      expect.any(Function),
    );
    expect(channel.subscribe).toHaveBeenCalled();

    const rows = screen.getAllByTestId('source-row');

    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Guide')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Indexing 4 of 12 pages')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/12 pages · 48 passages/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText('manual.pdf')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('PDF file · 2.0 KB')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Failed')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/not indexed yet/)).toBeInTheDocument();
    // One meter for each breakpoint; both carry the same numbers.
    expect(screen.getAllByTestId('pages-meter')[0]).toHaveTextContent('12');
    expect(screen.queryByText(STUB_NOTICE)).not.toBeInTheDocument();
  });

  it('explains the stub provider quietly when no model key is set', () => {
    renderScreen([], { liveAi: false });

    expect(screen.getByRole('status')).toHaveTextContent(STUB_NOTICE);
  });

  it('shows the failure reason when asked and lets the row be re-indexed', async () => {
    const user = userEvent.setup();
    const failed = source({ status: 'failed', error: 'Could not fetch https://docs.example.com/guide/: HTTP 404.' });

    actions.reindexSource.mockResolvedValue({ source: { ...failed, status: 'queued', error: null } });

    renderScreen([failed]);

    await user.click(screen.getByRole('button', { name: 'Show what happened' }));
    expect(screen.getByText('Could not fetch https://docs.example.com/guide/: HTTP 404.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Actions for ${failed.title}` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Re-index' }));

    expect(actions.reindexSource).toHaveBeenCalledWith(failed.id);
    await waitFor(() => expect(screen.getByText('Queued')).toBeInTheDocument());
  });

  it('asks before deleting and removes the row once confirmed', async () => {
    const user = userEvent.setup();
    const row = source({ title: 'Old notes' });

    actions.deleteSource.mockResolvedValue({});

    renderScreen([row]);

    await user.click(screen.getByRole('button', { name: 'Actions for Old notes' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const confirm = await screen.findByRole('dialog', { name: 'Delete Old notes?' });

    expect(confirm).toHaveTextContent('This cannot be undone.');

    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    expect(actions.deleteSource).toHaveBeenCalledWith(row.id);
    await waitFor(() => expect(screen.queryByTestId('source-row')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Point Parbot at your docs' })).toBeInTheDocument();
  });
});
