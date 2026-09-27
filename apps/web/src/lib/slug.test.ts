import { describe, expect, it } from 'vitest';

import { isSlug, SLUG_MAX_LENGTH, slugify } from './slug';

describe('slugify', () => {
  it('lowercases and joins words with single hyphens', () => {
    expect(slugify('Acme Docs')).toBe('acme-docs');
    expect(slugify('  Acme   API   Reference ')).toBe('acme-api-reference');
  });

  it('strips accents and anything that is not a letter or digit', () => {
    expect(slugify('Café Français')).toBe('cafe-francais');
    expect(slugify('Payments (v2) / EU')).toBe('payments-v2-eu');
    expect(slugify('__init__')).toBe('init');
  });

  it('never produces leading, trailing or doubled hyphens', () => {
    expect(slugify('--hello--world--')).toBe('hello-world');
    expect(slugify('a - b')).toBe('a-b');
  });

  it('falls back when nothing usable is left', () => {
    expect(slugify('⌘K')).toBe('k-assistant');
    expect(slugify('✨✨')).toBe('assistant');
    expect(slugify('X')).toBe('x-assistant');
  });

  it('fits the column and does not end on a hyphen after cutting', () => {
    const long = slugify(`${'word '.repeat(20)}tail`);

    expect(long.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(long.endsWith('-')).toBe(false);
    expect(isSlug(long)).toBe(true);
  });
});

describe('isSlug', () => {
  it('accepts what the database accepts', () => {
    expect(isSlug('ab')).toBe(true);
    expect(isSlug('acme-docs-2')).toBe(true);
  });

  it('rejects what the database rejects', () => {
    expect(isSlug('a')).toBe(false);
    expect(isSlug('Acme')).toBe(false);
    expect(isSlug('acme--docs')).toBe(false);
    expect(isSlug('-acme')).toBe(false);
    expect(isSlug('acme_docs')).toBe(false);
    expect(isSlug('a'.repeat(SLUG_MAX_LENGTH + 1))).toBe(false);
  });
});
