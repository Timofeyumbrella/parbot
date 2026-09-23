import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { fieldErrorsOf, formValues, parseForm, publicValues, safeNextPath } from './form';

const schema = z.object({
  email: z.string().min(1, { error: 'Enter your email address.' }),
  password: z.string().min(8, { error: 'Use at least 8 characters.' }),
});

const form = (entries: Record<string, string>) => {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }

  return data;
};

describe('formValues', () => {
  it('reads the named fields as strings and fills in blanks', () => {
    expect(formValues(form({ email: 'a@b.co' }), ['email', 'password'])).toEqual({ email: 'a@b.co', password: '' });
  });
});

describe('parseForm', () => {
  it('returns the data when it validates', () => {
    const result = parseForm(schema, { email: 'a@b.co', password: 'longenough' });

    expect(result).toEqual({ ok: true, data: { email: 'a@b.co', password: 'longenough' } });
  });

  it('returns one message per field and keeps the non secret values', () => {
    const result = parseForm(schema, { email: '', password: 'short' }, ['password']);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.state.status).toBe('error');
      expect(result.state.fieldErrors).toEqual({
        email: 'Enter your email address.',
        password: 'Use at least 8 characters.',
      });
      expect(result.state.values).toEqual({ email: '' });
    }
  });
});

describe('fieldErrorsOf', () => {
  it('keeps the first message per field', () => {
    const parsed = z
      .object({ name: z.string().min(2, { error: 'first' }).max(1, { error: 'second' }) })
      .safeParse({ name: 'a' });

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      expect(fieldErrorsOf(parsed.error)).toEqual({ name: 'first' });
    }
  });
});

describe('publicValues', () => {
  it('drops secrets', () => {
    expect(publicValues({ email: 'a', password: 'b' }, ['password'])).toEqual({ email: 'a' });
  });
});

describe('safeNextPath', () => {
  it('accepts a relative path with query and hash', () => {
    expect(safeNextPath('/a/123/inbox?tab=leads#top')).toBe('/a/123/inbox?tab=leads#top');
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
  });

  it('rejects anything that could leave the site', () => {
    expect(safeNextPath('//evil.com')).toBeNull();
    expect(safeNextPath('/\\evil.com')).toBeNull();
    expect(safeNextPath('https://evil.com/dashboard')).toBeNull();
    expect(safeNextPath('javascript:alert(1)')).toBeNull();
    expect(safeNextPath('dashboard')).toBeNull();
    expect(safeNextPath('/dash\nboard')).toBeNull();
  });

  it('rejects a bounce back to the auth pages and non strings', () => {
    expect(safeNextPath('/login')).toBeNull();
    expect(safeNextPath('/signup?plan=starter')).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(['/dashboard'])).toBeNull();
  });
});
