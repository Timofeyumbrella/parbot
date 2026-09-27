import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAppliedSnapshots } from '@/hooks/use-conversations';
import { resetAppliedProjectSnapshots } from '@/hooks/use-projects';
import { type ConversationRow } from '@/lib/chat/conversations';
import { resetProjectState } from '@/lib/chat/project-state';
import type { ProjectRow } from '@/lib/chat/projects';
import { conversationsKey, projectsKey } from '@/lib/chat/queries';

import { ConversationList } from './conversation-list';
import { CONVERSATION_DRAG_TYPE } from './conversation-row';
import { resetFolderChoices } from './project-list';

const navigation = vi.hoisted(() => ({
  params: {
    assistantId: 'asst',
    conversationId: undefined as string | undefined,
    projectId: undefined as string | undefined,
  },
  push: vi.fn(),
}));

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const actions = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  moveConversation: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => navigation.params,
  useRouter: () => ({ push: navigation.push, prefetch: vi.fn() }),
}));

vi.mock('@/actions/projects', () => actions);
vi.mock('@/actions/conversations', () => ({
  renameConversation: vi.fn(async () => ({ ok: true })),
  deleteConversation: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({}),
  realtimeReadyClient: () => new Promise(() => {}),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const NOW = Date.parse('2026-09-23T12:00:00.000Z');

const project = (id: string, name: string, patch: Partial<ProjectRow> = {}): ProjectRow => ({
  id,
  name,
  instructions: '',
  sources: [],
  created_at: '2026-09-20T10:00:00.000Z',
  updated_at: '2026-09-20T10:00:00.000Z',
  ...patch,
});

const rows: ConversationRow[] = [
  {
    id: 'c1',
    title: 'Refunds for annual plans',
    last_message_at: '2026-09-23T11:55:00.000Z',
    message_count: 2,
    unanswered_count: 0,
    project_id: 'p1',
  },
  {
    id: 'c2',
    title: 'Rotate an API key',
    last_message_at: '2026-09-23T09:00:00.000Z',
    message_count: 2,
    unanswered_count: 0,
    project_id: null,
  },
  {
    id: 'c3',
    title: 'Invoices for the team',
    last_message_at: '2026-09-22T09:00:00.000Z',
    message_count: 2,
    unanswered_count: 0,
    project_id: 'p1',
  },
];

const projects = [project('p1', 'Billing'), project('p2', 'Onboarding')];

let queryClient: QueryClient;

const renderList = (initialRows = rows, initialProjects = projects) => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ConversationList
        assistantId="asst"
        snapshot={{ rows: initialRows, fetchedAt: NOW }}
        projectSnapshot={{ rows: initialProjects, fetchedAt: NOW }}
      />
    </QueryClientProvider>,
  );
};

const cachedRows = () => queryClient.getQueryData<ConversationRow[]>(conversationsKey('asst'));
const cachedProjects = () => queryClient.getQueryData<ProjectRow[]>(projectsKey('asst'));
const folder = (name: string) =>
  screen.getAllByTestId('project-folder').find((item) => item.textContent?.includes(name))!;
const chatsSection = () =>
  screen.getByRole('heading', { name: 'Chats' }).closest('section') as HTMLElement;

/**
 * Picks an item in the open submenu. A pointer moving from the submenu's trigger to its item
 * closes the submenu in jsdom, which has no layout for Radix to aim the pointer through.
 */
const pick = async (name: string) => {
  fireEvent.click(await screen.findByRole('menuitem', { name }));
};

/** A promise the test settles by hand, to look at the screen while an action is in flight. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  navigation.params.conversationId = undefined;
  navigation.params.projectId = undefined;
  resetAppliedSnapshots();
  resetAppliedProjectSnapshots();
  resetProjectState();
  resetFolderChoices();
  window.localStorage.clear();
  actions.createProject.mockImplementation(
    async (input: { id: string; name: string }): Promise<Result<{ project: ProjectRow }>> => ({
      ok: true,
      project: project(input.id, input.name, { created_at: '2026-09-23T12:00:00.000Z' }),
    }),
  );
  actions.updateProject.mockImplementation(
    async (input: { id: string; name?: string }): Promise<Result<{ project: ProjectRow }>> => ({
      ok: true,
      project: project(input.id, input.name ?? 'Billing'),
    }),
  );
  actions.deleteProject.mockResolvedValue({ ok: true });
  actions.moveConversation.mockResolvedValue({ ok: true });
});

describe('projects in the chat sidebar', () => {
  it('lists each project as a folder with a count, and opens it to show its chats', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderList();

    const billing = folder('Billing');

    expect(within(billing).getByLabelText('2 chats')).toBeInTheDocument();
    expect(within(billing).getByRole('link', { name: /Billing/ })).toHaveAttribute(
      'href',
      '/a/asst/chat/projects/p1',
    );
    // Closed until opened, since nothing in it is on screen.
    expect(within(billing).queryByRole('link', { name: /Refunds/ })).toBeNull();

    await user.click(within(billing).getByRole('button', { name: 'Open the folder Billing' }));

    expect(
      within(folder('Billing'))
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Billing2',
      expect.stringContaining('Refunds'),
      expect.stringContaining('Invoices'),
    ]);
    // Chats in a project are not listed again under Chats.
    expect(within(chatsSection()).getAllByRole('link')).toHaveLength(1);
    expect(within(chatsSection()).getByRole('link')).toHaveTextContent('Rotate an API key');
  });

  it('opens the folder that holds the open conversation', () => {
    navigation.params.conversationId = 'c3';
    renderList();

    expect(
      within(folder('Billing')).getByRole('link', { name: /Invoices for the team/ }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('creates a project in place, shows it at once and opens its home', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const pending = deferred<Result<{ project: ProjectRow }>>();

    actions.createProject.mockReturnValueOnce(pending.promise);
    renderList();

    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.type(screen.getByRole('textbox', { name: 'New project name' }), 'Security{Enter}');

    // On screen and in the cache before the server has answered.
    expect(folder('Security')).toBeInTheDocument();

    const created = cachedProjects()!.find((row) => row.name === 'Security')!;

    expect(created.pending).toBe(true);
    expect(actions.createProject).toHaveBeenCalledWith({
      id: created.id,
      assistantId: 'asst',
      name: 'Security',
    });
    expect(navigation.push).toHaveBeenCalledWith(`/a/asst/chat/projects/${created.id}`);

    await act(async () => {
      pending.resolve({ ok: true, project: project(created.id, 'Security') });
    });

    expect(cachedProjects()!.find((row) => row.id === created.id)?.pending).toBe(false);
  });

  it('refuses a name another project has, whatever the case', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderList();

    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.type(screen.getByRole('textbox', { name: 'New project name' }), 'billing{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'There is already a project called “billing”.',
    );
    expect(actions.createProject).not.toHaveBeenCalled();
  });

  it('takes a new project away again and says why when the server refuses it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    actions.createProject.mockResolvedValueOnce({
      ok: false,
      error: 'The project could not be created. Try again.',
    });
    renderList();

    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.type(screen.getByRole('textbox', { name: 'New project name' }), 'Security{Enter}');

    await vi.waitFor(() => {
      expect(cachedProjects()!.map((row) => row.name)).toEqual(['Billing', 'Onboarding']);
    });
    expect(toast.error).toHaveBeenCalledWith('The project could not be created. Try again.');
  });

  it('renames a project in place, and rolls the name back when the server refuses', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderList();

    await user.click(screen.getByRole('button', { name: 'Actions for the project Onboarding' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByRole('textbox', { name: 'Project name' });

    await user.clear(input);
    await user.type(input, 'Getting started{Enter}');

    expect(folder('Getting started')).toBeInTheDocument();
    expect(actions.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p2', name: 'Getting started' }),
    );

    actions.updateProject.mockResolvedValueOnce({ ok: false, error: 'No.' });
    await user.click(
      screen.getByRole('button', { name: 'Actions for the project Getting started' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), ' v2{Enter}');

    await vi.waitFor(() => {
      expect(cachedProjects()!.find((row) => row.id === 'p2')?.name).toBe('Getting started');
    });
    expect(toast.error).toHaveBeenCalledWith('No.');
  });

  it('deletes a project after saying its chats stay, and moves them to Chats at once', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const pending = deferred<Result>();

    actions.deleteProject.mockReturnValueOnce(pending.promise);
    renderList();

    await user.click(screen.getByRole('button', { name: 'Actions for the project Billing' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete project' });

    expect(dialog).toHaveTextContent('Its 2 chats are kept and move to Chats.');
    expect(dialog).toHaveTextContent('Its files stay in Knowledge.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    // Before the server answers: the folder is gone and its chats are under Chats, not deleted.
    expect(screen.queryAllByTestId('project-folder').map((item) => item.dataset.project)).toEqual([
      'p2',
    ]);
    expect(cachedRows()!.map((row) => [row.id, row.project_id])).toEqual([
      ['c1', null],
      ['c2', null],
      ['c3', null],
    ]);
    expect(within(chatsSection()).getAllByRole('link')).toHaveLength(3);
    expect(actions.deleteProject).toHaveBeenCalledWith({ id: 'p1' });

    await act(async () => {
      pending.resolve({ ok: true });
    });

    expect(cachedProjects()!.map((row) => row.id)).toEqual(['p2']);
  });

  it('puts a project and its chats back when the delete fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    actions.deleteProject.mockResolvedValueOnce({
      ok: false,
      error: 'The project could not be deleted. Try again.',
    });
    renderList();

    await user.click(screen.getByRole('button', { name: 'Actions for the project Billing' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete project' }),
    );

    await vi.waitFor(() => {
      expect(cachedProjects()!.map((row) => row.id)).toEqual(['p1', 'p2']);
    });
    expect(cachedRows()!.map((row) => row.project_id)).toEqual(['p1', null, 'p1']);
    expect(toast.error).toHaveBeenCalledWith('The project could not be deleted. Try again.');
  });

  it('leaves the home of a project that is deleted while it is open', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    navigation.params.projectId = 'p2';
    renderList();

    await user.click(screen.getByRole('button', { name: 'Actions for the project Onboarding' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');

    expect(dialog).toHaveTextContent('It has no chats.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    expect(navigation.push).toHaveBeenCalledWith('/a/asst/chat');
  });

  it('moves a chat into a project from its menu, and out again', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const pending = deferred<Result>();

    actions.moveConversation.mockReturnValueOnce(pending.promise);
    renderList();

    await user.click(screen.getByRole('button', { name: 'Actions for Rotate an API key' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to project' }));
    await pick('Onboarding');

    // In the folder, and the folder open, before the server has answered.
    expect(cachedRows()!.find((row) => row.id === 'c2')?.project_id).toBe('p2');
    expect(
      await within(folder('Onboarding')).findByRole('link', { name: /Rotate an API key/ }),
    ).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(actions.moveConversation).toHaveBeenCalledWith({
        conversationId: 'c2',
        projectId: 'p2',
      });
    });

    await act(async () => {
      pending.resolve({ ok: true });
    });

    await user.click(screen.getByRole('button', { name: 'Actions for Rotate an API key' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to project' }));
    await pick('Remove from project');

    expect(cachedRows()!.find((row) => row.id === 'c2')?.project_id).toBeNull();
    expect(
      await within(chatsSection()).findByRole('link', { name: /Rotate an API key/ }),
    ).toBeVisible();
    await vi.waitFor(() => {
      expect(actions.moveConversation).toHaveBeenLastCalledWith({
        conversationId: 'c2',
        projectId: null,
      });
    });
  });

  it('puts a moved chat back and says why when the move fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    actions.moveConversation.mockResolvedValueOnce({
      ok: false,
      error: 'That project no longer exists. Pick another one.',
    });
    renderList();

    await user.click(screen.getByRole('button', { name: 'Actions for Rotate an API key' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to project' }));
    await pick('Billing');

    await vi.waitFor(() => {
      expect(cachedRows()!.find((row) => row.id === 'c2')?.project_id).toBeNull();
    });
    expect(toast.error).toHaveBeenCalledWith('That project no longer exists. Pick another one.');
  });

  it('marks the current project in the move menu and offers nothing to move into without projects', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    navigation.params.conversationId = 'c1';
    renderList();

    await user.click(screen.getByRole('button', { name: 'Actions for Refunds for annual plans' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to project' }));

    expect(await screen.findByRole('menuitem', { name: /Billing/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByLabelText('Current project')).toBeInTheDocument();
  });

  it('says what to do when there are no projects to move into', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderList(
      rows.map((row) => ({ ...row, project_id: null })),
      [],
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Rotate an API key' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to project' }));

    expect(
      await screen.findByRole('menuitem', {
        name: 'No projects yet. Create one with New project.',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('moves a chat dropped on a folder, and out when dropped on Chats', async () => {
    renderList();

    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
      get types() {
        return [...data.keys()];
      },
      effectAllowed: 'all',
      dropEffect: 'none',
    };
    const row = within(chatsSection()).getByRole('link', { name: /Rotate an API key/ });

    fireEvent.dragStart(row, { dataTransfer });
    expect(data.get(CONVERSATION_DRAG_TYPE)).toBe('c2');

    const target = within(folder('Onboarding')).getByRole('link', {
      name: /Onboarding/,
    }).parentElement!;

    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(cachedRows()!.find((candidate) => candidate.id === 'c2')?.project_id).toBe('p2');
    await vi.waitFor(() => {
      expect(actions.moveConversation).toHaveBeenCalledWith({
        conversationId: 'c2',
        projectId: 'p2',
      });
    });

    const moved = within(folder('Onboarding')).getByRole('link', { name: /Rotate an API key/ });

    data.clear();
    fireEvent.dragStart(moved, { dataTransfer });
    fireEvent.dragOver(screen.getByRole('heading', { name: 'Chats' }), { dataTransfer });
    fireEvent.drop(screen.getByRole('heading', { name: 'Chats' }), { dataTransfer });

    expect(cachedRows()!.find((candidate) => candidate.id === 'c2')?.project_id).toBeNull();
  });

  it('shows the folders that match a filter, open, with only the matching chats', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderList();

    await user.type(screen.getByRole('searchbox', { name: 'Filter conversations' }), 'invoices');

    expect(screen.getAllByTestId('project-folder')).toHaveLength(1);
    expect(
      within(folder('Billing'))
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Billing1', expect.stringContaining('Invoices')]);
  });
});
