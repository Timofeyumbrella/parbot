import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AddSourceState } from '@/actions/sources';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Source } from '@/lib/db';

import { KnowledgeScreen, STUB_NOTICE } from './knowledge-screen';

type ChangeHandler = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Partial<Source>;
  old: Partial<Source>;
}) => void;

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
      addSource: vi.fn<(state: AddSourceState, data: FormData) => Promise<AddSourceState>>(),
      reindexSource: vi.fn(),
      deleteSource: vi.fn(),
    },
  };
});

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => supabase,
  realtimeReadyClient: () => Promise.resolve(supabase),
}));
vi.mock('@/actions/sources', () => actions);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ASSISTANT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const OWNER = '00000000-0000-4000-8000-000000000001';

const source = (overrides: Partial<Source> = {}): Source => ({
  id: crypto.randomUUID(),
  assistant_id: ASSISTANT,
  owner_id: OWNER,
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

/** What the database would answer a refetch with. Tests move it as the server would. */
let serverRows: Source[] = [];

const renderScreen = (
  sources: Source[],
  props: Partial<React.ComponentProps<typeof KnowledgeScreen>> = {},
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  serverRows = sources;

  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>
        <KnowledgeScreen
          assistantId={ASSISTANT}
          ownerId={OWNER}
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

/** The postgres_changes handler the screen registered, once the session-aware client resolved. */
const changeHandler = async (): Promise<ChangeHandler> => {
  await waitFor(() => expect(channel.on).toHaveBeenCalled());

  return channel.on.mock.calls[0]![2] as ChangeHandler;
};

describe('KnowledgeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    supabase.from.mockImplementation((table: string) =>
      table === 'documents'
        ? {
            select: () =>
              Promise.resolve({
                count: serverRows.reduce((sum, row) => sum + row.document_count, 0),
                error: null,
              }),
          }
        : {
            select: () => ({
              eq: () => ({ order: () => Promise.resolve({ data: serverRows, error: null }) }),
            }),
          },
    );
  });

  it('shows the empty state with the four ways in, and opens the dialog on the chosen one', async () => {
    const user = userEvent.setup();

    renderScreen([]);

    expect(screen.getByRole('heading', { name: 'Point Parbot at your docs' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Paste text' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add source' });

    expect(
      within(dialog).getByRole('tab', { name: /Paste text|Text/, selected: true }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Title')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Text')).toBeInTheDocument();
  });

  it("subscribes to the assistant's source rows with the session-aware client and lists them", async () => {
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

    await waitFor(() =>
      expect(supabase.channel).toHaveBeenCalledWith(`knowledge:sources:${ASSISTANT}`),
    );
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sources', filter: `assistant_id=eq.${ASSISTANT}` },
      expect.any(Function),
    );
    expect(channel.subscribe).toHaveBeenCalledWith(expect.any(Function));

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

  it('moves a row along as realtime delivers its progress', async () => {
    const row = source({
      title: 'Guide',
      status: 'crawling',
      pages_found: 3,
      pages_done: 0,
      document_count: 0,
      chunk_count: 0,
    });

    renderScreen([row]);

    const push = await changeHandler();

    expect(screen.getByText('Crawling · 3 pages')).toBeInTheDocument();

    act(() =>
      push({
        eventType: 'UPDATE',
        new: { ...row, status: 'indexing', pages_done: 2 },
        old: { id: row.id },
      }),
    );
    await waitFor(() => expect(screen.getByText('Indexing 2 of 3 pages')).toBeInTheDocument());

    const ready = {
      ...row,
      status: 'ready' as const,
      pages_found: 3,
      pages_done: 3,
      document_count: 3,
      chunk_count: 9,
    };

    // A finished run makes the screen ask the database again; it answers with the finished row.
    serverRows = [ready];
    act(() => push({ eventType: 'UPDATE', new: ready, old: { id: row.id } }));
    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument());
    expect(screen.getByText(/3 pages · 9 passages/)).toBeInTheDocument();
  });

  it('shows a finished run that left pages out', () => {
    renderScreen([
      source({
        error:
          "Stopped at your plan's page limit after 100 pages. Upgrade on the Billing page or remove a source to index the rest.",
      }),
    ]);

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(
      screen.getByText(/Stopped at your plan's page limit after 100 pages/),
    ).toBeInTheDocument();
  });

  it('explains the stub provider quietly when no model key is set', () => {
    renderScreen([], { liveAi: false });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Answers are placeholders until an AI model is connected. Sources are indexed as usual.',
    );
    // Product copy: no environment variables, config files or provider internals.
    expect(STUB_NOTICE).not.toMatch(/[A-Z]+_[A-Z_]+|\.env|stub/);
  });

  it('adds a source the moment the form is sent and swaps in the saved row afterwards', async () => {
    const user = userEvent.setup();
    let release: (state: AddSourceState) => void = () => {};

    actions.addSource.mockReturnValue(new Promise((resolve) => (release = resolve)));

    renderScreen([]);

    await user.click(screen.getByRole('button', { name: 'Add source' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add source' });

    await user.type(within(dialog).getByLabelText('Start page'), 'https://docs.example.com/guide/');
    await user.click(within(dialog).getByRole('button', { name: 'Add website' }));

    // Drawn before the server has answered, and the dialog is out of the way.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const row = screen.getByTestId('source-row');

    expect(within(row).getByText('docs.example.com/guide')).toBeInTheDocument();
    expect(within(row).getByText('Queued')).toBeInTheDocument();

    const form = actions.addSource.mock.calls[0]![1];
    const id = form.get('id') as string;

    release({
      source: source({
        id,
        title: 'Guide',
        status: 'crawling',
        pages_found: 1,
        document_count: 0,
        chunk_count: 0,
      }),
    });

    await waitFor(() => expect(screen.getByText('Guide')).toBeInTheDocument());
    expect(screen.getAllByTestId('source-row')).toHaveLength(1);
    expect(screen.getByText('Crawling · 1 page')).toBeInTheDocument();
  });

  it('takes the row back and reopens the dialog with the reason when the server refuses', async () => {
    const user = userEvent.setup();

    actions.addSource.mockResolvedValue({
      error: "Your plan's page limit is reached. Upgrade on the Billing page or remove a source.",
    });

    renderScreen([source({ title: 'Existing' })]);

    await user.click(screen.getByRole('button', { name: 'Add source' }));
    await user.type(
      within(await screen.findByRole('dialog')).getByLabelText('Start page'),
      'https://docs.example.com/guide/',
    );
    await user.click(screen.getByRole('button', { name: 'Add website' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add source' });

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Your plan's page limit is reached.",
    );
    expect(within(dialog).getByLabelText('Start page')).toHaveValue(
      'https://docs.example.com/guide/',
    );
    expect(screen.getAllByTestId('source-row')).toHaveLength(1);
    expect(screen.getByText('Existing')).toBeInTheDocument();
  });

  it('shows the failure reason when asked and lets the row be re-indexed', async () => {
    const user = userEvent.setup();
    const failed = source({
      status: 'failed',
      error: 'Could not fetch https://docs.example.com/guide/: HTTP 404.',
    });

    actions.reindexSource.mockResolvedValue({
      source: { ...failed, status: 'queued', error: null },
    });

    renderScreen([failed]);

    await user.click(screen.getByRole('button', { name: 'Show what happened' }));
    expect(
      screen.getByText('Could not fetch https://docs.example.com/guide/: HTTP 404.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Actions for ${failed.title}` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Re-index' }));

    expect(actions.reindexSource).toHaveBeenCalledWith(failed.id);
    await waitFor(() => expect(screen.getByText('Queued')).toBeInTheDocument());
  });

  it('asks before deleting, in plain words, and removes the row once confirmed', async () => {
    const user = userEvent.setup();
    const row = source({ title: 'Old notes', document_count: 1 });

    actions.deleteSource.mockImplementation(async () => {
      serverRows = [];

      return {};
    });

    renderScreen([row]);

    await user.click(screen.getByRole('button', { name: 'Actions for Old notes' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const confirm = await screen.findByRole('dialog', { name: 'Delete Old notes?' });

    expect(confirm).toHaveTextContent(
      "The 1 page it added, and their passages, are removed from the assistant's knowledge. This cannot be undone.",
    );

    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    expect(actions.deleteSource).toHaveBeenCalledWith(row.id);
    await waitFor(() => expect(screen.queryByTestId('source-row')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Point Parbot at your docs' })).toBeInTheDocument();
  });
});
