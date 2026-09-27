import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AddSourceState } from '@/actions/sources';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Source } from '@/lib/db';
import { indexingPausedError } from '@/lib/knowledge/indexing-paused';

import { parseAddSourceTab } from './add-source-tab';
import { KnowledgeScreen, STUB_NOTICE } from './knowledge-screen';
import { sourcesQueryKey } from './use-sources';

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

const meter = () => screen.getAllByTestId('pages-meter')[0]!;

const renderScreen = (
  sources: Source[],
  props: Partial<React.ComponentProps<typeof KnowledgeScreen>> = {},
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  serverRows = sources;

  const view = render(
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>
        <KnowledgeScreen
          assistantId={ASSISTANT}
          ownerId={OWNER}
          initialSources={sources}
          plan={{ name: 'Hobby', pages: 100 }}
          liveAi
          {...props}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );

  return { ...view, client };
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
    supabase.from.mockImplementation((table: string) => {
      // The meter is the rows' own count; a second request for it could only lag them.
      if (table !== 'sources') {
        throw new Error(`The Knowledge screen read ${table}.`);
      }

      return {
        select: () => ({
          eq: () => ({ order: () => Promise.resolve({ data: serverRows, error: null }) }),
        }),
      };
    });
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
    expect(meter()).toHaveTextContent(/^0 of 100 pages/);

    // Each page written bumps the row's count, and the meter goes with it.
    act(() =>
      push({
        eventType: 'UPDATE',
        new: { ...row, status: 'indexing', pages_done: 2, document_count: 2, chunk_count: 6 },
        old: { id: row.id },
      }),
    );
    await waitFor(() => expect(screen.getByText(/2 pages · 6 passages/)).toBeInTheDocument());
    expect(meter()).toHaveTextContent(/^2 of 100 pages/);

    const ready = {
      ...row,
      status: 'ready' as const,
      pages_found: 3,
      pages_done: 3,
      document_count: 3,
      chunk_count: 9,
    };

    serverRows = [ready];
    act(() => push({ eventType: 'UPDATE', new: ready, old: { id: row.id } }));
    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument());
    // The same render that shows the row ready shows its pages on the meter.
    expect(screen.getByText(/3 pages · 9 passages/)).toBeInTheDocument();
    expect(meter()).toHaveTextContent(/^3 of 100 pages/);
    expect(supabase.from).not.toHaveBeenCalledWith('documents');
  });

  it('moves the meter with the rows when the poll brings finished runs', async () => {
    const indexing = source({
      title: 'Guide',
      status: 'indexing',
      pages_found: 2,
      pages_done: 1,
      document_count: 1,
      chunk_count: 3,
    });
    const other = source({
      title: 'Handbook',
      status: 'indexing',
      pages_found: 6,
      pages_done: 0,
      document_count: 0,
      chunk_count: 0,
      created_at: '2026-09-19T12:00:00Z',
    });
    const first = source({ title: 'Notes', document_count: 1, created_at: '2026-09-19T10:00:00Z' });
    const { client } = renderScreen([indexing, other, first]);

    expect(meter()).toHaveTextContent(/^2 of 100 pages/);

    // Realtime stays silent and the poll brings both runs finished. The meter once read the count
    // in a request of its own and showed 2 pages beside three ready rows for a few seconds.
    serverRows = [
      { ...indexing, status: 'ready', pages_done: 2, document_count: 2 },
      { ...other, status: 'ready', pages_done: 6, document_count: 6, chunk_count: 18 },
      first,
    ];

    await act(() => client.refetchQueries({ queryKey: sourcesQueryKey(ASSISTANT) }));

    await waitFor(() => expect(screen.getAllByText('Ready')).toHaveLength(3));
    expect(meter()).toHaveTextContent(/^9 of 100 pages/);
    expect(supabase.from).not.toHaveBeenCalledWith('documents');
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

  it('shows a run the daily limit paused in the row, with when to re-index', () => {
    const paused = source({
      status: 'failed',
      error: indexingPausedError(new Date(Date.now() + 5 * 3_600_000)),
      document_count: 1,
      pages_done: 1,
    });

    renderScreen([paused]);

    const row = screen.getByTestId('source-row');

    expect(within(row).getByText('Paused')).toBeInTheDocument();
    expect(within(row).queryByText('Failed')).not.toBeInTheDocument();
    // In view at once, not behind "Show what happened": it says when to come back.
    expect(
      within(row).queryByRole('button', { name: 'Show what happened' }),
    ).not.toBeInTheDocument();
    expect(
      within(row).getByText(
        /^Indexing paused: the AI provider's daily limit for this deployment is used up\. It resets (tomorrow )?at \d{1,2}:\d{2}\s[AP]M your time; re-index after that\.$/,
      ),
    ).toBeInTheDocument();
  });

  it('asks before deleting, in plain words, and removes the row once confirmed', async () => {
    const user = userEvent.setup();
    const row = source({ title: 'Old notes', document_count: 1 });
    let finishDelete: () => void = () => {};

    actions.deleteSource.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDelete = () => {
            serverRows = [];
            resolve({});
          };
        }),
    );

    renderScreen([row]);

    expect(meter()).toHaveTextContent(/^1 of 100 pages/);

    await user.click(screen.getByRole('button', { name: 'Actions for Old notes' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const confirm = await screen.findByRole('dialog', { name: 'Delete Old notes?' });

    expect(confirm).toHaveTextContent(
      "The page it added, and its passages, are removed from the assistant's knowledge. This cannot be undone.",
    );

    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    // Gone from the list and the meter before the server has answered.
    await waitFor(() => expect(screen.queryByTestId('source-row')).not.toBeInTheDocument());
    expect(actions.deleteSource).toHaveBeenCalledWith(row.id);
    expect(meter()).toHaveTextContent(/^0 of 100 pages/);
    expect(screen.getByRole('heading', { name: 'Point Parbot at your docs' })).toBeInTheDocument();

    // Once it has, nothing is read again: the meter already says what the server counts.
    act(() => finishDelete());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Removed Old notes.'));
    expect(meter()).toHaveTextContent(/^0 of 100 pages/);
    expect(supabase.from).not.toHaveBeenCalledWith('documents');
  });

  it('puts the row and its pages back when the delete fails', async () => {
    const user = userEvent.setup();
    const row = source({ title: 'Old notes', document_count: 4 });

    actions.deleteSource.mockResolvedValue({ error: 'The source could not be deleted.' });
    renderScreen([row, source({ title: 'Guide', document_count: 8 })]);

    expect(meter()).toHaveTextContent(/^12 of 100 pages/);

    await user.click(screen.getByRole('button', { name: 'Actions for Old notes' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Delete Old notes?' })).getByRole('button', {
        name: 'Delete',
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('The source could not be deleted.'),
    );
    expect(screen.getAllByTestId('source-row')).toHaveLength(2);
    expect(screen.getByText('Old notes')).toBeInTheDocument();
    expect(meter()).toHaveTextContent(/^12 of 100 pages/);
  });

  it('opens an uploaded file or its text from the row', async () => {
    const user = userEvent.setup();
    const file = source({
      kind: 'upload',
      title: 'limits.pdf',
      uri: null,
      storage_path: `u/${ASSISTANT}/f.pdf`,
      mime_type: 'application/pdf',
      document_count: 1,
    });

    renderScreen([file]);

    // The title reads the file's text in the viewer.
    expect(screen.getByRole('link', { name: 'limits.pdf' })).toHaveAttribute(
      'href',
      `/a/${ASSISTANT}/knowledge/sources/${file.id}`,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for limits.pdf' }));

    expect(await screen.findByRole('menuitem', { name: 'View text' })).toHaveAttribute(
      'href',
      `/a/${ASSISTANT}/knowledge/sources/${file.id}`,
    );
    expect(screen.getByRole('menuitem', { name: 'Open file' })).toHaveAttribute(
      'href',
      `/api/sources/${file.id}/file`,
    );
    expect(screen.getByRole('menuitem', { name: 'Open file' })).toHaveAttribute('target', '_blank');
  });

  it('offers no file for a website, and no text before anything is indexed', async () => {
    const user = userEvent.setup();

    renderScreen([
      source({ title: 'Docs site', document_count: 0, status: 'crawling' }),
      source({
        kind: 'text',
        title: 'Draft note',
        uri: null,
        storage_path: `u/${ASSISTANT}/n.md`,
        document_count: 0,
        status: 'queued',
      }),
    ]);

    // Nothing to read yet, so the titles are plain text.
    expect(screen.queryByRole('link', { name: 'Docs site' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Draft note' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Actions for Docs site' }));
    expect(await screen.findByRole('menuitem', { name: 'View pages' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Open file' })).toBeNull();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for Draft note' }));
    expect(await screen.findByRole('menuitem', { name: 'View text' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Open original' })).toBeInTheDocument();
  });

  it('opens the Add source dialog on the tab the address asks for, and forgets it once closed', async () => {
    const user = userEvent.setup();

    window.history.replaceState(null, '', `/a/${ASSISTANT}/knowledge?add=url`);
    renderScreen([source()], { initialAddTab: 'url' });

    const dialog = await screen.findByRole('dialog', { name: 'Add source' });

    expect(within(dialog).getByRole('tab', { name: /Website/, selected: true })).toBeVisible();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // A reload after closing lands on the list, not on the dialog again.
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe(`/a/${ASSISTANT}/knowledge`);
  });
});

describe('parseAddSourceTab', () => {
  it('accepts the dialog tabs and nothing else', () => {
    expect(parseAddSourceTab('url')).toBe('url');
    expect(parseAddSourceTab(['text', 'url'])).toBe('text');
    expect(parseAddSourceTab('upload')).toBe('upload');
    expect(parseAddSourceTab('1')).toBeNull();
    expect(parseAddSourceTab(undefined)).toBeNull();
  });
});
