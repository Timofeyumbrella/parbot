import { describe, expect, it } from 'vitest';

import {
  applyServerRow,
  confirmConversation,
  conversationLabel,
  type ConversationRow,
  draftTitle,
  filterConversations,
  mergeConversationLists,
  removeConversationRow,
  renameConversationRow,
  sortConversations,
  upsertConversation,
} from './conversations';

const row = (id: string, at: string | null, extra: Partial<ConversationRow> = {}): ConversationRow => ({
  id,
  title: `Chat ${id}`,
  last_message_at: at,
  message_count: 2,
  unanswered_count: 0,
  ...extra,
});

describe('draftTitle', () => {
  it('collapses whitespace and keeps short questions whole', () => {
    expect(draftTitle('  How do   I\nrotate a key? ')).toBe('How do I rotate a key?');
  });

  it('cuts long questions at a word boundary within 60 characters', () => {
    const title = draftTitle('This is a fairly long question about how the billing cycle works when I change plans mid month');

    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith('…')).toBe(true);
    expect(title).toBe('This is a fairly long question about how the billing cycle…');
  });
});

describe('list transitions', () => {
  it('sorts newest first with never-used rows last', () => {
    const sorted = sortConversations([row('a', '2026-01-01T00:00:00Z'), row('b', null), row('c', '2026-02-01T00:00:00Z')]);

    expect(sorted.map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });

  it('upserts to the top when the row is the newest', () => {
    const list = [row('a', '2026-01-01T00:00:00Z')];
    const next = upsertConversation(list, row('b', '2026-03-01T00:00:00Z', { pending: true }));

    expect(next.map((item) => item.id)).toEqual(['b', 'a']);
    expect(upsertConversation(next, { ...row('a', '2026-04-01T00:00:00Z') }).map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('applies a server row while keeping an optimistic title the server lacks', () => {
    const list = [row('a', '2026-01-01T00:00:00Z', { pending: true, title: 'Optimistic' })];
    const next = applyServerRow(list, { ...row('a', '2026-01-02T00:00:00Z'), title: null });

    expect(next[0]).toMatchObject({ title: 'Optimistic', pending: false, last_message_at: '2026-01-02T00:00:00Z' });
    expect(applyServerRow(list, row('a', '2026-01-02T00:00:00Z', { title: 'Server' }))[0].title).toBe('Server');
  });

  it('renames, removes and confirms', () => {
    const list = [row('a', null, { pending: true }), row('b', null)];

    expect(renameConversationRow(list, 'b', 'Renamed')[1].title).toBe('Renamed');
    expect(removeConversationRow(list, 'a').map((item) => item.id)).toEqual(['b']);
    expect(confirmConversation(list, 'a')[0].pending).toBe(false);
  });

  it('keeps pending rows across a refetch that predates them', () => {
    const cached = [row('new', '2026-05-01T00:00:00Z', { pending: true }), row('old', '2026-01-01T00:00:00Z')];
    const merged = mergeConversationLists(cached, [row('old', '2026-01-01T00:00:00Z'), row('other', '2026-02-01T00:00:00Z')]);

    expect(merged.map((item) => item.id)).toEqual(['new', 'other', 'old']);
    expect(mergeConversationLists(undefined, [row('x', null)]).map((item) => item.id)).toEqual(['x']);
  });

  it('filters by title, treating untitled rows as "New chat"', () => {
    const list = [row('a', null, { title: 'Billing cycle' }), row('b', null, { title: null })];

    expect(filterConversations(list, 'BILL').map((item) => item.id)).toEqual(['a']);
    expect(filterConversations(list, 'new').map((item) => item.id)).toEqual(['b']);
    expect(filterConversations(list, '  ')).toBe(list);
    expect(conversationLabel({ title: '  ' })).toBe('New chat');
  });
});
