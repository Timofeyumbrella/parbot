import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationRow } from './conversations';
import {
  deletedProjects,
  MOVE_GRACE_MS,
  overlayProjectState,
  projectCreations,
  projectMoves,
  resetProjectState,
} from './project-state';
import {
  groupConversations,
  instructionsSummary,
  mergeProjectLists,
  mergeProjectSnapshot,
  moveConversationRow,
  projectFromRow,
  projectNameProblem,
  type ProjectRow,
  releaseProjectRows,
} from './projects';

const project = (id: string, patch: Partial<ProjectRow> = {}): ProjectRow => ({
  id,
  name: id,
  instructions: '',
  sources: [],
  created_at: '2026-09-20T10:00:00.000Z',
  updated_at: '2026-09-20T10:00:00.000Z',
  ...patch,
});

const row = (id: string, projectId: string | null = null): ConversationRow => ({
  id,
  title: id,
  last_message_at: '2026-09-23T10:00:00.000Z',
  message_count: 2,
  unanswered_count: 0,
  project_id: projectId,
});

describe('projectFromRow', () => {
  it("flattens the project's files in the order they were added, skipping deleted ones", () => {
    expect(
      projectFromRow({
        ...project('p1'),
        project_sources: [
          { position: 1, sources: { id: 's2', title: 'Pricing', kind: 'text' } },
          { position: 0, sources: { id: 's1', title: 'Refunds', kind: 'upload' } },
          { position: 2, sources: null },
        ],
      }).sources,
    ).toEqual([
      { id: 's1', title: 'Refunds', kind: 'upload' },
      { id: 's2', title: 'Pricing', kind: 'text' },
    ]);
  });
});

describe('projectNameProblem', () => {
  const projects = [project('p1', { name: 'Billing' })];

  it('needs a name that no other project of the assistant has, whatever the case', () => {
    expect(projectNameProblem('  ', projects)).toBe('Give the project a name.');
    expect(projectNameProblem('x'.repeat(61), projects)).toBe('Keep the name under 61 characters.');
    expect(projectNameProblem(' BILLING ', projects)).toBe(
      'There is already a project called “BILLING”.',
    );
    // Its own name is fine when it is the one being renamed.
    expect(projectNameProblem('billing', projects, 'p1')).toBeNull();
    expect(projectNameProblem('Onboarding', projects)).toBeNull();
  });
});

describe('merging projects', () => {
  it('lets a read win, except for a project created here and one with a change in flight', () => {
    const previous = [
      project('new', { pending: true, created_at: '2026-09-23T10:00:00.000Z' }),
      project('p1', { name: 'Renamed here' }),
      project('gone'),
    ];
    const fetched = [project('p1', { name: 'Old name' }), project('p2')];

    expect(mergeProjectLists(previous, fetched).map((item) => [item.id, item.name])).toEqual([
      ['new', 'new'],
      ['p1', 'Old name'],
      ['p2', 'p2'],
    ]);
    expect(
      mergeProjectLists(previous, fetched, new Set(['p1'])).find((item) => item.id === 'p1')?.name,
    ).toBe('Renamed here');
  });

  it('keeps a project deleted here gone from a read that left before the delete landed', () => {
    const fetched = [project('p1'), project('p2')];

    expect(
      mergeProjectLists([project('p2')], fetched, new Set(), new Set(['p1'])).map(
        (item) => item.id,
      ),
    ).toEqual(['p2']);
  });

  it('folds a snapshot in without dropping rows or reviving deleted ones', () => {
    const previous = [
      project('p1', { name: 'Newer here', updated_at: '2026-09-23T10:00:00.000Z' }),
      project('p2'),
    ];
    const snapshot = [
      project('p1', { name: 'Older', updated_at: '2026-09-22T10:00:00.000Z' }),
      project('p3'),
      project('deleted'),
    ];

    expect(
      mergeProjectSnapshot(previous, snapshot, new Set(['deleted'])).map((item) => [
        item.id,
        item.name,
      ]),
    ).toEqual([
      ['p1', 'Newer here'],
      ['p2', 'p2'],
      ['p3', 'p3'],
    ]);
  });
});

describe('conversations and projects', () => {
  it('groups conversations by project, and treats an unknown project as none', () => {
    const { byProject, loose } = groupConversations(
      [row('c1', 'p1'), row('c2'), row('c3', 'p1'), row('c4', 'deleted-elsewhere')],
      [project('p1')],
    );

    expect(byProject.get('p1')?.map((item) => item.id)).toEqual(['c1', 'c3']);
    expect(loose.map((item) => item.id)).toEqual(['c2', 'c4']);
  });

  it('moves a conversation in and out, and releases every chat of a deleted project', () => {
    const rows = [row('c1', 'p1'), row('c2'), row('c3', 'p1')];

    expect(moveConversationRow(rows, 'c2', 'p1').map((item) => item.project_id)).toEqual([
      'p1',
      'p1',
      'p1',
    ]);
    expect(moveConversationRow(rows, 'c1', null)[0]!.project_id).toBeNull();
    expect(releaseProjectRows(rows, 'p1').map((item) => item.project_id)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('summarises long instructions at a word', () => {
    expect(instructionsSummary('  Answer   for\nthe billing team.  ')).toBe(
      'Answer for the billing team.',
    );
    expect(instructionsSummary(`${'word '.repeat(80)}end`, 50)).toMatch(/^(word ){8,9}word…$/);
  });
});

describe('moves in flight', () => {
  beforeEach(() => {
    resetProjectState();
    vi.useFakeTimers({ now: 0, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the reader’s move over server rows that predate it, until one agrees', () => {
    projectMoves.begin('c1', 'p1');

    // A realtime event from before the move still says no project.
    expect(projectMoves.overlay([row('c1')])[0]!.project_id).toBe('p1');

    projectMoves.settle('c1');
    expect(projectMoves.overlay([row('c1')])[0]!.project_id).toBe('p1');

    // The move's own row arrives; from then on the server speaks for itself again.
    expect(projectMoves.overlay([row('c1', 'p1')])[0]!.project_id).toBe('p1');
    expect(projectMoves.overlay([row('c1', 'p2')])[0]!.project_id).toBe('p2');
  });

  it('lets the server win again a little after a move settled', () => {
    projectMoves.begin('c1', 'p1');
    projectMoves.settle('c1');
    vi.setSystemTime(MOVE_GRACE_MS + 1);

    expect(projectMoves.overlay([row('c1')])[0]!.project_id).toBeNull();
  });

  it('drops a cancelled move at once', () => {
    projectMoves.begin('c1', 'p1');
    projectMoves.cancel('c1');

    expect(projectMoves.overlay([row('c1')])[0]!.project_id).toBeNull();
  });

  it('tells a send whether a project created here made it to the server', async () => {
    projectCreations.track('p-ok', Promise.resolve(true));
    projectCreations.track('p-failed', Promise.resolve(false));

    await expect(projectCreations.ready('p-ok')).resolves.toBe(true);
    await expect(projectCreations.ready('p-failed')).resolves.toBe(false);
    // Nothing in flight: an existing project is ready.
    await expect(projectCreations.ready('p-old')).resolves.toBe(true);
  });
});

describe('deleted projects', () => {
  beforeEach(() => {
    resetProjectState();
  });

  it('keeps the chats of a project deleted here out of it, whatever a server row says', () => {
    const rows = [row('c1', 'p1'), row('c2'), row('c3', 'p2')];

    expect(deletedProjects.release(rows)).toBe(rows);

    deletedProjects.add('p1');
    expect(overlayProjectState(rows).map((item) => item.project_id)).toEqual([null, null, 'p2']);

    // A delete the server refused puts them back.
    deletedProjects.restore('p1');
    expect(overlayProjectState(rows)).toBe(rows);
  });

  it('applies moves in flight too', () => {
    deletedProjects.add('p1');
    projectMoves.begin('c2', 'p2');

    expect(
      overlayProjectState([row('c1', 'p1'), row('c2')]).map((item) => item.project_id),
    ).toEqual([null, 'p2']);
  });
});
