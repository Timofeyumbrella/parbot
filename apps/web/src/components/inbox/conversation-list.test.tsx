import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { ConversationRow } from './conversation-query';
import { applyChange, type ListData } from './conversation-list';

const row = (overrides: Partial<ConversationRow> = {}): ConversationRow => ({
  id: crypto.randomUUID(),
  title: 'How do I rotate keys?',
  channel: 'app',
  page_url: null,
  message_count: 2,
  unanswered_count: 0,
  last_message_at: '2026-09-23T10:00:00Z',
  created_at: '2026-09-23T09:59:00Z',
  ...overrides,
});

const list = (...pages: ConversationRow[][]): ListData => ({
  pages: pages.map((rows) => ({ rows, cursor: null })),
  pageParams: pages.map(() => null),
});

type Payload = RealtimePostgresChangesPayload<ConversationRow>;

const insert = (next: ConversationRow): Payload =>
  ({ eventType: 'INSERT', new: next, old: {}, schema: 'public', table: 'conversations', commit_timestamp: '', errors: [] }) as Payload;

const update = (next: ConversationRow): Payload =>
  ({ eventType: 'UPDATE', new: next, old: { id: next.id }, schema: 'public', table: 'conversations', commit_timestamp: '', errors: [] }) as Payload;

const remove = (id: string): Payload =>
  ({ eventType: 'DELETE', new: {}, old: { id }, schema: 'public', table: 'conversations', commit_timestamp: '', errors: [] }) as Payload;

const ids = (data: ListData) => data.pages.flatMap((page) => page.rows.map((item) => item.id));

describe('applyChange', () => {
  it('prepends an inserted row that fits the filter and reports it as new', () => {
    const existing = row({ id: 'old' });
    const fresh = row({ id: 'fresh', channel: 'widget', page_url: 'https://docs.example.com/a' });

    const all = applyChange(list([existing]), insert(fresh), 'all');
    expect(ids(all.data)).toEqual(['fresh', 'old']);
    expect(all.added).toBe('fresh');

    const widget = applyChange(list([existing]), insert(fresh), 'widget');
    expect(ids(widget.data)).toEqual(['fresh', 'old']);
  });

  it('ignores an inserted row that does not belong in the open filter', () => {
    const data = list([row({ id: 'old' })]);
    const result = applyChange(data, insert(row({ id: 'fresh', channel: 'app' })), 'widget');

    expect(result.data).toBe(data);
    expect(result.added).toBeNull();
  });

  it('updates a known row in place without marking it new', () => {
    const data = list([row({ id: 'a', message_count: 2 })], [row({ id: 'b', message_count: 4 })]);
    const result = applyChange(data, update(row({ id: 'b', message_count: 5, last_message_at: '2026-09-23T11:00:00Z' })), 'all');

    expect(result.added).toBeNull();
    expect(result.data.pages[1]?.rows[0]).toMatchObject({ id: 'b', message_count: 5, last_message_at: '2026-09-23T11:00:00Z' });
    expect(ids(result.data)).toEqual(['a', 'b']);
  });

  it('drops a known row once an update moves it out of the filter', () => {
    const data = list([row({ id: 'a', unanswered_count: 1 }), row({ id: 'b', unanswered_count: 2 })]);
    const result = applyChange(data, update(row({ id: 'a', unanswered_count: 0 })), 'unanswered');

    expect(ids(result.data)).toEqual(['b']);
  });

  it('adds a row the update makes eligible for the filter', () => {
    const data = list([row({ id: 'b', unanswered_count: 2 })]);
    const result = applyChange(data, update(row({ id: 'a', unanswered_count: 1 })), 'unanswered');

    expect(ids(result.data)).toEqual(['a', 'b']);
    expect(result.added).toBe('a');
  });

  it('removes a deleted row and leaves the data untouched when the row is unknown', () => {
    const data = list([row({ id: 'a' }), row({ id: 'b' })]);

    expect(ids(applyChange(data, remove('a'), 'all').data)).toEqual(['b']);
    expect(applyChange(data, remove('zzz'), 'all').data).toBe(data);
    expect(applyChange(data, remove(''), 'all').data).toBe(data);
  });
});
