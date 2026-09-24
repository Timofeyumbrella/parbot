import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/lib/db';

import {
  activityStamp,
  conversationListKey,
  conversationPage,
  type ConversationRow,
  cursorFilter,
  inboxCountsKey,
  inboxKey,
  matchesFilter,
  PAGE_SIZE,
  pageOf,
} from './conversation-query';

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

/** A client that records every builder call instead of talking to PostgREST. */
const recordingClient = () => {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get:
        (_target, method: string) =>
        (...args: unknown[]) => {
          calls.push([method, ...args]);

          return builder;
        },
    },
  );
  const client = {
    from: (table: string) => {
      calls.push(['from', table]);

      return builder;
    },
  } as unknown as SupabaseClient<Database>;

  return { client, calls };
};

describe('matchesFilter', () => {
  it('keeps rows that belong in the open filter', () => {
    const widget = row({ channel: 'widget', page_url: 'https://docs.example.com/x' });
    const unanswered = row({ unanswered_count: 2 });

    expect(matchesFilter(widget, 'all')).toBe(true);
    expect(matchesFilter(widget, 'widget')).toBe(true);
    expect(matchesFilter(widget, 'app')).toBe(false);
    expect(matchesFilter(widget, 'unanswered')).toBe(false);
    expect(matchesFilter(unanswered, 'unanswered')).toBe(true);
    expect(matchesFilter(unanswered, 'app')).toBe(true);
  });
});

describe('pageOf', () => {
  it('trims the extra row and points the cursor at the last row shown', () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
      row({ id: `id-${String(index).padStart(2, '0')}`, last_message_at: '2026-09-23T10:00:00Z' }),
    );
    const page = pageOf(rows);

    expect(page.rows).toHaveLength(PAGE_SIZE);
    expect(page.rows.at(-1)?.id).toBe(`id-${PAGE_SIZE - 1}`);
    expect(page.cursor).toEqual({ at: '2026-09-23T10:00:00Z', id: `id-${PAGE_SIZE - 1}` });
  });

  it('ends paging when no extra row came back, even for a full page', () => {
    const exactly = Array.from({ length: PAGE_SIZE }, () => row());

    expect(pageOf(exactly).cursor).toBeNull();
    expect(pageOf(exactly).rows).toHaveLength(PAGE_SIZE);
    expect(pageOf(exactly.slice(0, 5)).cursor).toBeNull();
    expect(pageOf([])).toEqual({ rows: [], cursor: null });
  });

  it('keeps a cursor for rows that never had a message', () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
      row({ id: `id-${String(index).padStart(2, '0')}`, last_message_at: null }),
    );

    expect(pageOf(rows).cursor).toEqual({ at: null, id: `id-${PAGE_SIZE - 1}` });
  });
});

describe('cursorFilter', () => {
  it('breaks ties on the timestamp by id and reaches rows without a message', () => {
    expect(cursorFilter({ at: '2026-09-20T00:00:00+00:00', id: 'abc' })).toBe(
      'last_message_at.lt.2026-09-20T00:00:00+00:00,and(last_message_at.eq.2026-09-20T00:00:00+00:00,id.lt.abc),last_message_at.is.null',
    );
    expect(cursorFilter({ at: null, id: 'abc' })).toBe('and(last_message_at.is.null,id.lt.abc)');
  });
});

describe('activityStamp and keys', () => {
  it('falls back to the start time and namespaces every key under inbox', () => {
    expect(activityStamp(row())).toBe('2026-09-23T10:00:00Z');
    expect(activityStamp(row({ last_message_at: null }))).toBe('2026-09-23T09:59:00Z');
    expect(inboxKey('a1')).toEqual(['inbox', 'a1']);
    expect(conversationListKey('a1', 'widget')).toEqual(['inbox', 'a1', 'conversations', 'widget']);
    expect(inboxCountsKey('a1')).toEqual(['inbox', 'a1', 'counts']);
  });
});

describe('conversationPage', () => {
  it('scopes to the assistant, orders by activity then id and asks for one row over the page', () => {
    const { client, calls } = recordingClient();

    conversationPage(client, 'assistant-1', 'all');

    expect(calls).toEqual([
      ['from', 'conversations'],
      ['select', 'id, title, channel, page_url, message_count, unanswered_count, last_message_at, created_at'],
      ['eq', 'assistant_id', 'assistant-1'],
      ['order', 'last_message_at', { ascending: false, nullsFirst: false }],
      ['order', 'id', { ascending: false }],
      ['limit', PAGE_SIZE + 1],
    ]);
  });

  it('adds the channel, unanswered and keyset clauses when asked', () => {
    const widget = recordingClient();
    conversationPage(widget.client, 'assistant-1', 'widget', { at: '2026-09-20T00:00:00Z', id: 'c1' });
    expect(widget.calls).toContainEqual(['eq', 'channel', 'widget']);
    expect(widget.calls).toContainEqual([
      'or',
      'last_message_at.lt.2026-09-20T00:00:00Z,and(last_message_at.eq.2026-09-20T00:00:00Z,id.lt.c1),last_message_at.is.null',
    ]);
    expect(widget.calls.find((call) => call[0] === 'gt')).toBeUndefined();

    const unanswered = recordingClient();
    conversationPage(unanswered.client, 'assistant-1', 'unanswered');
    expect(unanswered.calls).toContainEqual(['gt', 'unanswered_count', 0]);
    expect(unanswered.calls.find((call) => call[0] === 'or')).toBeUndefined();
    expect(unanswered.calls.find((call) => call[0] === 'eq' && call[1] === 'channel')).toBeUndefined();
  });
});
