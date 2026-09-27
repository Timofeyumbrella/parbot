import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantProvider } from '@/components/assistant-context';
import { referenceSourcesKey } from '@/hooks/use-reference-sources';
import { resetDrafts } from '@/lib/chat/drafts';
import type { ProjectRow } from '@/lib/chat/projects';
import { projectsKey } from '@/lib/chat/queries';
import type { MessageReference, ReferenceOption } from '@/lib/chat/references';

import { ChatComposer } from './chat-composer';
import { Composer } from './composer';
import type { ComposerChip } from './reference-chips';

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
  option('s-pricing', 'Pricing sheet'),
  option('s-limits', 'limits.md', { kind: 'upload', detail: 'Markdown file' }),
];

const fixedChip = (id: string, title: string, status: ComposerChip['status'] = 'ready') => ({
  id,
  title,
  kind: 'text' as const,
  status,
});

/** The composer with its own chips in state, and the project's files fixed beside them. */
const Harness = ({
  fixed,
  onSend = vi.fn(),
}: {
  fixed: ComposerChip[];
  onSend?: (content: string, references: MessageReference[]) => void;
}) => {
  const [references, setReferences] = useState<MessageReference[]>([]);

  return (
    <Composer
      draftKey="c1"
      onSend={onSend}
      references={{
        chips: references.map((reference) => ({ ...reference, status: 'ready' })),
        fixed: { label: 'Billing', chips: fixed },
        onChange: setReferences,
        options: OPTIONS,
        onAttach: vi.fn(),
      }}
    />
  );
};

const box = () => screen.getByRole('textbox', { name: 'Message' });

beforeEach(() => {
  resetDrafts();
});

describe('the composer in a project', () => {
  it("shows the project's files as fixed chips, labelled with the project, with no way to remove them", () => {
    render(<Harness fixed={[fixedChip('s-refund', 'Refund policy', 'indexing')]} />);

    const group = screen.getByRole('group', { name: 'Files from the project Billing' });

    expect(group).toHaveTextContent('Billing');

    const chip = within(group).getByTestId('project-chip');

    expect(chip).toHaveTextContent('Refund policy');
    expect(chip).toHaveTextContent('from the project Billing');
    expect(chip).toHaveAttribute('data-status', 'indexing');
    expect(screen.queryByRole('button', { name: 'Remove Refund policy' })).toBeNull();
  });

  it('keeps the project files out of what a question sends, alongside its own references', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<Harness fixed={[fixedChip('s-refund', 'Refund policy')]} onSend={onSend} />);

    await user.type(box(), 'Compare @limits');
    await user.keyboard('{Enter}');

    expect(screen.getAllByTestId('reference-chip').map((chip) => chip.textContent)).toEqual([
      expect.stringContaining('limits.md'),
    ]);

    await user.type(box(), 'with the refunds{Enter}');

    expect(onSend).toHaveBeenCalledWith('Compare with the refunds', [
      { id: 's-limits', title: 'limits.md', kind: 'upload' },
    ]);
  });

  it('shows a project file as already added in the picker, and picking it adds nothing', async () => {
    const user = userEvent.setup();

    render(<Harness fixed={[fixedChip('s-refund', 'Refund policy')]} />);

    await user.type(box(), '@Refu');

    const listbox = screen.getByRole('listbox');

    expect(within(listbox).getByLabelText('Already added')).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(screen.queryAllByTestId('reference-chip')).toHaveLength(0);
    expect(screen.getAllByTestId('project-chip')).toHaveLength(1);
  });

  it('folds a long list of project files behind a count, and opens it', async () => {
    const user = userEvent.setup();

    render(
      <Harness
        fixed={['a', 'b', 'c', 'd', 'e'].map((id) => fixedChip(id, `File ${id.toUpperCase()}`))}
      />,
    );

    expect(screen.getAllByTestId('project-chip')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: '2 more files' }));
    expect(screen.getAllByTestId('project-chip')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('ChatComposer in a project', () => {
  const assistant = {
    id: 'asst',
    name: 'Acme Docs',
    welcome_message: 'Ask me anything.',
    suggested_questions: [],
  };
  const project = (sources: MessageReference[]): ProjectRow => ({
    id: 'p1',
    name: 'Billing',
    instructions: '',
    sources,
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-20T10:00:00Z',
  });

  const renderComposer = (projectId: string | null, projects: ProjectRow[]) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });

    queryClient.setQueryData(projectsKey('asst'), projects);
    queryClient.setQueryData(referenceSourcesKey('asst'), OPTIONS);

    const view = (id: string | null) => (
      <QueryClientProvider client={queryClient}>
        <AssistantProvider assistant={assistant as never}>
          <ChatComposer draftKey="c1" conversationReferences={[]} projectId={id} onSend={vi.fn()} />
        </AssistantProvider>
      </QueryClientProvider>
    );
    const rendered = render(view(projectId));

    return { ...rendered, queryClient, move: (id: string | null) => rendered.rerender(view(id)) };
  };

  it("reads the project's files from the cache, with their status, and follows a move", async () => {
    const { move, queryClient } = renderComposer('p1', [
      project([{ id: 's-refund', title: 'Refund policy', kind: 'text' }]),
    ]);

    expect(screen.getByTestId('project-chip')).toHaveTextContent('Refund policy');
    expect(screen.getByTestId('project-chip')).toHaveAttribute('data-status', 'ready');

    // The project gains a file in another pane: the chips follow the cache.
    act(() => {
      queryClient.setQueryData(projectsKey('asst'), [
        project([
          { id: 's-refund', title: 'Refund policy', kind: 'text' },
          { id: 's-pricing', title: 'Pricing sheet', kind: 'text' },
        ]),
      ]);
    });
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('project-chip')).toHaveLength(2);
    });

    // Moved out of the project: no fixed chips, no project label.
    move(null);
    expect(screen.queryAllByTestId('project-chip')).toHaveLength(0);
    expect(screen.queryByTestId('project-context')).toBeNull();
  });
});
