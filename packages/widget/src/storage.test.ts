import { UUID_PATTERN, VISITOR_ID_PATTERN } from '@parbot/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getConversationId,
  getVisitorId,
  loadMessages,
  MAX_STORED_MESSAGES,
  resetConversation,
  saveMessages,
  uuid,
} from './storage';

describe('storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('creates a visitor id that matches the protocol pattern and keeps it', () => {
    const first = getVisitorId('pb_a');

    expect(first).toMatch(VISITOR_ID_PATTERN);
    expect(getVisitorId('pb_a')).toBe(first);
    expect(getVisitorId('pb_b')).not.toBe(first);
  });

  it('replaces a corrupted visitor id', () => {
    window.localStorage.setItem('parbot:pb_a:visitor', 'no spaces allowed');

    expect(getVisitorId('pb_a')).toMatch(VISITOR_ID_PATTERN);
  });

  it('keeps one conversation id per key until it is reset', () => {
    const first = getConversationId('pb_a');

    expect(first).toMatch(UUID_PATTERN);
    expect(getConversationId('pb_a')).toBe(first);

    const next = resetConversation('pb_a');

    expect(next).not.toBe(first);
    expect(next).toMatch(UUID_PATTERN);
    expect(getConversationId('pb_a')).toBe(next);
  });

  it('generates version 4 uuids', () => {
    expect(uuid()).toMatch(UUID_PATTERN);
    expect(uuid()).not.toBe(uuid());
  });

  it('stores the transcript, caps it and clears it on reset', () => {
    const messages = Array.from({ length: MAX_STORED_MESSAGES + 5 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `m${index}`,
      citations: [],
    }));

    saveMessages('pb_a', messages);

    const loaded = loadMessages('pb_a');

    expect(loaded).toHaveLength(MAX_STORED_MESSAGES);
    expect(loaded.at(-1)?.text).toBe(`m${MAX_STORED_MESSAGES + 4}`);

    resetConversation('pb_a');

    expect(loadMessages('pb_a')).toEqual([]);
  });

  it('ignores garbage in storage', () => {
    window.localStorage.setItem('parbot:pb_a:messages', '{not json');
    expect(loadMessages('pb_a')).toEqual([]);

    window.localStorage.setItem('parbot:pb_a:messages', JSON.stringify([{ role: 'x' }, 5, { role: 'user', text: 'ok', citations: [] }]));
    expect(loadMessages('pb_a')).toEqual([{ role: 'user', text: 'ok', citations: [] }]);
  });
});
