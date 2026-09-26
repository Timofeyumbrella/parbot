import { randomUuid, UUID_PATTERN } from '@parbot/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('randomUuid', () => {
  it('makes version 4 ids the widget API accepts', () => {
    const ids = new Set(Array.from({ length: 50 }, randomUuid));

    expect(ids.size).toBe(50);

    for (const id of ids) {
      expect(id).toMatch(UUID_PATTERN);
      expect(id[14]).toBe('4');
    }
  });

  it('still works on a plain http page, where crypto.randomUUID does not exist', () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);

    vi.stubGlobal('crypto', { getRandomValues });

    const id = randomUuid();

    expect(id).toMatch(UUID_PATTERN);
    expect(id[14]).toBe('4');
    expect('89ab').toContain(id[19]!);
  });
});
