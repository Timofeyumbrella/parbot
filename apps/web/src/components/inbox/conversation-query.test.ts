import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/lib/db';

import {
  activityStamp,
  conversationListKey,
  conversationPage,
  type ConversationRow,
  matchesFilter,
  nextCursor,
  PAGE_SIZE,
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

describe('nextCursor', () => {
  it('only pages on when a full page came back and the last row has a timestamp', () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, index) =>
      row({ last_message_at: `2026-09-${String(23 - (index % 20)).padStart(2, '0')}T10:00:00Z` }),
    );

    expect(nextCursor(full)).toBe(full[PAGE_SIZE - 1]!.last_message_at);
    expect(nextCursor(full.slice(0, 5))).toBeNull();
    expect(nextCursor([...full.slice(0, PAGE_SIZE - 1), row({ last_message_at: null })])).toBeNull();
    expect(nextCursor([])).toBeNull();
  });
});

describe('activityStamp and keys', () => {
  it('falls back to the start time and builds prefix keys', () => {
    expect(activityStamp(row())).toBe('2026-09-23T10:00:00Z');
    expect(activityStamp(row({ last_message_at: null }))).toBe('2026-09-23T09:59:00Z');
    expect(conversationListKey('a1')).toEqual(['conversations', 'a1']);
    expect(conversationListKey('a1', 'widget')).toEqual(['conversations', 'a1', 'widget']);
  });
});

describe('conversationPage', () => {
  it('scopes to the assistant, orders newest first and limits to one page', () => {
    const { client, calls } = recordingClient();

    conversationPage(client, 'assistant-1', 'all');

    expect(calls).toEqual([
      ['from', 'conversations'],
      ['select', 'id, title, channel, page_url, message_count, unanswered_count, last_message_at, created_at'],
      ['eq', 'assistant_id', 'assistant-1'],
      ['order', 'last_message_at', { ascending: false, nullsFirst: false }],
      ['order', 'created_at', { ascending: false }],
      ['limit', PAGE_SIZE],
    ]);
  });

  it('adds the channel, unanswered and keyset clauses when asked', () => {
    const widget = recordingClient();
    conversationPage(widget.client, 'assistant-1', 'widget', '2026-09-20T00:00:00Z');
    expect(widget.calls).toContainEqual(['eq', 'channel', 'widget']);
    expect(widget.calls).toContainEqual(['lt', 'last_message_at', '2026-09-20T00:00:00Z']);
    expect(widget.calls.find((call) => call[0] === 'gt')).toBeUndefined();

    const unanswered = recordingClient();
    conversationPage(unanswered.client, 'assistant-1', 'unanswered');
    expect(unanswered.calls).toContainEqual(['gt', 'unanswered_count', 0]);
    expect(unanswered.calls.find((call) => call[0] === 'lt')).toBeUndefined();
    expect(unanswered.calls.find((call) => call[0] === 'eq' && call[1] === 'channel')).toBeUndefined();
  });
});
