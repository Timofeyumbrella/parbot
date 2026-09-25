import { describe, expect, it } from 'vitest';

import { emailSchema, passwordSchema, profileSchema } from './schema';

describe('account schemas', () => {
  it('trims the name and rejects an empty one', () => {
    expect(profileSchema.safeParse({ fullName: '  Ada ' })).toMatchObject({
      success: true,
      data: { fullName: 'Ada' },
    });
    expect(profileSchema.safeParse({ fullName: '   ' }).success).toBe(false);
  });

  it('normalises the email', () => {
    expect(emailSchema.safeParse({ email: ' Ada@Example.com ' })).toMatchObject({
      success: true,
      data: { email: 'ada@example.com' },
    });
    expect(emailSchema.safeParse({ email: 'ada' }).success).toBe(false);
  });

  it('requires the two passwords to match and to be long enough', () => {
    expect(
      passwordSchema.safeParse({ password: 'longenough', confirmPassword: 'longenough' }).success,
    ).toBe(true);

    const mismatch = passwordSchema.safeParse({
      password: 'longenough',
      confirmPassword: 'different',
    });

    expect(mismatch.success).toBe(false);

    if (!mismatch.success) {
      expect(mismatch.error.issues[0]).toMatchObject({
        path: ['confirmPassword'],
        message: 'The two passwords differ.',
      });
    }

    expect(passwordSchema.safeParse({ password: 'short', confirmPassword: 'short' }).success).toBe(
      false,
    );
  });
});
