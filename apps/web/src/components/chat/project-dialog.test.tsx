import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { referenceSourcesKey } from '@/hooks/use-reference-sources';
import { resetProjectState } from '@/lib/chat/project-state';
import { MAX_PROJECT_INSTRUCTIONS, type ProjectRow } from '@/lib/chat/projects';
import { projectsKey } from '@/lib/chat/queries';
import type { ReferenceOption } from '@/lib/chat/references';
import { composerUploads } from '@/lib/chat/uploads';

import { ProjectDialog } from './project-dialog';

const actions = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  moveConversation: vi.fn(),
}));

vi.mock('@/actions/projects', () => actions);
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({}),
  realtimeReadyClient: () => new Promise(() => {}),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const option = (id: string, title: string, patch: Partial<ReferenceOption> = {}) =>
  ({
    id,
    title,
    kind: 'text',
    status: 'ready',
    detail: 'Pasted text',
    createdAt: '2026-09-20T10:00:00Z',
    ...patch,
  }) satisfies ReferenceOption;

const OPTIONS = [
  option('s-refund', 'Refund policy'),
  option('s-pricing', 'Pricing sheet', { createdAt: '2026-09-21T10:00:00Z' }),
  option('s-site', 'Acme docs', { kind: 'url', detail: 'https://docs.acme.test/' }),
];

const BILLING: ProjectRow = {
  id: 'p1',
  name: 'Billing',
  instructions: 'Answer for the billing team.',
  sources: [{ id: 's-refund', title: 'Refund policy', kind: 'text' }],
  created_at: '2026-09-20T10:00:00Z',
  updated_at: '2026-09-20T10:00:00Z',
};

let queryClient: QueryClient;
const onClose = vi.fn();

const renderDialog = () => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(projectsKey('asst'), [
    BILLING,
    { ...BILLING, id: 'p2', name: 'Onboarding', instructions: '', sources: [] },
  ]);
  queryClient.setQueryData(referenceSourcesKey('asst'), OPTIONS);

  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectDialog assistantId="asst" project={BILLING} open onClose={onClose} />
    </QueryClientProvider>,
  );
};

const cached = () =>
  queryClient.getQueryData<ProjectRow[]>(projectsKey('asst'))!.find((row) => row.id === 'p1')!;

beforeEach(() => {
  resetProjectState();
  composerUploads.reset();
  // The server echoes what it saved.
  actions.updateProject.mockImplementation(
    async (input: { id: string; name?: string; instructions?: string; sourceIds?: string[] }) => ({
      ok: true,
      project: {
        ...BILLING,
        id: input.id,
        name: input.name ?? BILLING.name,
        instructions: input.instructions ?? BILLING.instructions,
        sources: input.sourceIds
          ? input.sourceIds.map((id) => {
              const known = OPTIONS.find((candidate) => candidate.id === id);

              return { id, title: known?.title ?? 'plans.md', kind: known?.kind ?? 'upload' };
            })
          : BILLING.sources,
      },
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProjectDialog', () => {
  it("starts from the project's name, instructions and files", () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Edit project' });

    expect(within(dialog).getByLabelText('Name')).toHaveValue('Billing');
    expect(within(dialog).getByLabelText('Instructions')).toHaveValue(
      'Answer for the billing team.',
    );
    expect(
      within(dialog)
        .getAllByTestId('reference-chip')
        .map((chip) => chip.textContent),
    ).toEqual([expect.stringContaining('Refund policy')]);
    expect(within(dialog).getByText('1 of 20')).toBeInTheDocument();
    // The list the @ picker shows, with the project's file marked as added.
    expect(within(dialog).getByRole('button', { name: /^Refund policy/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getByRole('button', { name: /^Pricing sheet/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('picks files from Knowledge with the same filter as @, and saves instructions and files at once', async () => {
    const user = userEvent.setup();

    renderDialog();

    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText('Find a file or source in Knowledge'), 'pric');
    expect(within(dialog).getAllByRole('button', { name: /Pasted text|docs\.acme/ })).toHaveLength(
      1,
    );
    await user.click(within(dialog).getByRole('button', { name: /^Pricing sheet/ }));
    // A file is taken off with its chip.
    await user.click(within(dialog).getByRole('button', { name: 'Remove Refund policy' }));

    const instructions = within(dialog).getByLabelText('Instructions');

    await user.clear(instructions);
    await user.type(instructions, 'Lead with the plan name.');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    // Closed and in the cache straight away; the server hears about it once.
    expect(onClose).toHaveBeenCalled();
    expect(cached().instructions).toBe('Lead with the plan name.');
    expect(cached().sources.map((source) => source.id)).toEqual(['s-pricing']);
    await vi.waitFor(() => {
      expect(actions.updateProject).toHaveBeenCalledWith({
        id: 'p1',
        name: undefined,
        instructions: 'Lead with the plan name.',
        sourceIds: ['s-pricing'],
      });
    });
  });

  it('caps the instructions and says how long they are', () => {
    renderDialog();

    const instructions = screen.getByLabelText('Instructions');

    expect(instructions).toHaveAttribute('maxLength', String(MAX_PROJECT_INSTRUCTIONS));
    expect(screen.getByText(/28 of 4,000 characters\./)).toBeInTheDocument();
  });

  it('refuses a name another project has', async () => {
    const user = userEvent.setup();

    renderDialog();

    const name = screen.getByLabelText('Name');

    await user.clear(name);
    await user.type(name, 'onboarding');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'There is already a project called “onboarding”.',
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(actions.updateProject).not.toHaveBeenCalled();
  });

  it('sends nothing when nothing changed', async () => {
    const user = userEvent.setup();

    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClose).toHaveBeenCalled();
    expect(actions.updateProject).not.toHaveBeenCalled();
  });

  it('attaches a new file through the upload route, shows its status, and saves it once it lands', async () => {
    const user = userEvent.setup();
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );

    vi.stubGlobal('fetch', fetchMock);
    renderDialog();

    const file = new File(['# Plans\n\nThe team plan costs twelve dollars.'], 'plans.md', {
      type: 'text/markdown',
    });

    await user.upload(screen.getByLabelText('Choose files to add to the project'), file);

    const chip = screen
      .getAllByTestId('reference-chip')
      .find((candidate) => candidate.textContent?.includes('plans.md'))!;

    expect(chip).toHaveAttribute('data-status', 'uploading');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sources',
      expect.objectContaining({ method: 'POST' }),
    );

    const body = (fetchMock.mock.calls[0] as unknown as [string, { body: FormData }])[1].body;
    const uploadId = body.get('id') as string;

    expect(body.get('assistantId')).toBe('asst');

    // Saved while the file is still uploading: the dialog closes, and the server hears once the
    // file is in Knowledge.
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(cached().sources.map((source) => source.title)).toEqual(['Refund policy', 'plans.md']);
    expect(actions.updateProject).not.toHaveBeenCalled();

    await act(async () => {
      finish(
        new Response(
          JSON.stringify({
            source: {
              id: uploadId,
              kind: 'upload',
              title: 'plans.md',
              status: 'queued',
              uri: null,
              storage_path: 'x/plans.md',
              mime_type: 'text/markdown',
              byte_size: 40,
              created_at: '2026-09-23T10:00:00Z',
            },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    await vi.waitFor(() => {
      expect(actions.updateProject).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', sourceIds: ['s-refund', uploadId] }),
      );
    });
  });
});
