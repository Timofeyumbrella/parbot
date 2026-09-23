import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FormState } from '@/lib/form';

import { LoginForm, SignupForm } from './auth-form';

const { signIn, signUp } = vi.hoisted(() => ({
  signIn: vi.fn<(state: FormState, data: FormData) => Promise<FormState>>(),
  signUp: vi.fn<(state: FormState, data: FormData) => Promise<FormState>>(),
}));

vi.mock('@/actions/auth', () => ({ signIn, signUp }));

describe('LoginForm', () => {
  it('sends the fields and the safe next path, then shows the server message and keeps the email', async () => {
    signIn.mockResolvedValue({
      status: 'error',
      error: 'Wrong email or password.',
      values: { email: 'ada@example.com', next: '/a/1/inbox' },
    });
    const user = userEvent.setup();

    render(<LoginForm next="/a/1/inbox" />);

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');

    const formData = signIn.mock.calls[0]?.[1];

    expect(formData?.get('email')).toBe('ada@example.com');
    expect(formData?.get('password')).toBe('wrong-password');
    expect(formData?.get('next')).toBe('/a/1/inbox');
  });

  it('shows field level messages next to the field', async () => {
    signIn.mockResolvedValue({
      status: 'error',
      error: 'Check the highlighted fields.',
      fieldErrors: { email: 'Enter a valid email address.' },
      values: { email: 'nope' },
    });
    const user = userEvent.setup();

    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Check the highlighted fields.')).not.toBeInTheDocument();
  });
});

describe('SignupForm', () => {
  it('carries the plan and interval through hidden fields', async () => {
    signUp.mockResolvedValue({ status: 'success', message: 'We sent a confirmation link to ada@example.com. Open it, then sign in.' });
    const user = userEvent.setup();

    render(<SignupForm plan="starter" interval="yearly" />);

    await user.type(screen.getByLabelText('Full name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('status')).toHaveTextContent('We sent a confirmation link');

    const formData = signUp.mock.calls[0]?.[1];

    expect(formData?.get('plan')).toBe('starter');
    expect(formData?.get('interval')).toBe('yearly');
    expect(formData?.get('fullName')).toBe('Ada Lovelace');
  });

  it('omits the plan fields when there is no plan', () => {
    const { container } = render(<SignupForm />);

    expect(container.querySelector('input[name="plan"]')).toBeNull();
    expect(container.querySelector('input[name="interval"]')).toBeNull();
    expect(screen.getByText('At least 8 characters.')).toBeInTheDocument();
  });
});
