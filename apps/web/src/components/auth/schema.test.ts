import { describe, expect, it } from 'vitest';

import { authErrorMessage } from './auth-errors';
import { onboardingPath, signInSchema, signUpSchema, signupPath } from './schema';

describe('signInSchema', () => {
  it('normalises the email and keeps the password as typed', () => {
    const parsed = signInSchema.safeParse({ email: '  Ada@Example.COM ', password: ' pw ' });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data).toEqual({ email: 'ada@example.com', password: ' pw ' });
    }
  });

  it('asks for both fields in plain words', () => {
    const parsed = signInSchema.safeParse({ email: 'not-an-email', password: '' });

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toEqual([
        'Enter a valid email address.',
        'Enter your password.',
      ]);
    }
  });
});

describe('signUpSchema', () => {
  it('requires a name and at least 8 characters of password', () => {
    const parsed = signUpSchema.safeParse({ fullName: ' ', email: 'ada@example.com', password: '1234567' });

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
        ['fullName', 'Enter your name.'],
        ['password', 'Use at least 8 characters.'],
      ]);
    }
  });

  it('accepts a complete sign up and passes the plan through untouched', () => {
    const parsed = signUpSchema.safeParse({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'correct horse',
      plan: 'starter',
      interval: 'yearly',
    });

    expect(parsed.success).toBe(true);
  });
});

describe('onboardingPath', () => {
  it('keeps a real plan and interval', () => {
    expect(onboardingPath('starter', 'yearly')).toBe('/onboarding?plan=starter&interval=yearly');
  });

  it('drops an interval without a plan and anything it does not recognise', () => {
    expect(onboardingPath(undefined, 'yearly')).toBe('/onboarding');
    expect(onboardingPath('enterprise', 'monthly')).toBe('/onboarding');
    expect(onboardingPath('growth', 'weekly')).toBe('/onboarding?plan=growth');
    expect(signupPath('growth', 'monthly')).toBe('/signup?plan=growth&interval=monthly');
    expect(signupPath(null, null)).toBe('/signup');
  });
});

describe('authErrorMessage', () => {
  it('turns known codes into plain words', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'Wrong email or password.',
    );
    expect(authErrorMessage({ code: 'user_already_exists', message: 'User already registered' })).toMatch(
      /already exists/,
    );
    expect(authErrorMessage({ code: 'weak_password', message: 'x' })).toMatch(/at least 8/);
  });

  it('falls back to the message, then to a generic line', () => {
    expect(authErrorMessage({ code: 'something_new', message: 'Custom text' })).toBe('Custom text');
    expect(authErrorMessage({ message: 'User already registered' })).toMatch(/already exists/);
    expect(authErrorMessage({ message: '' })).toBe('Something went wrong. Try again.');
  });
});
