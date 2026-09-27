import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PLANS } from '@/lib/plans';

const { createAssistant, getAccountAssistant, getAccountPlan, redirect, requireUser } = vi.hoisted(
  () => ({
    createAssistant: vi.fn(),
    getAccountAssistant: vi.fn(),
    getAccountPlan: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT ${url}`);
    }),
    requireUser: vi.fn(),
  }),
);

vi.mock('@/actions/assistants', () => ({ createAssistant }));
vi.mock('@/lib/account', () => ({ getAccountPlan }));
vi.mock('@/lib/assistants', () => ({ getAccountAssistant }));
vi.mock('@/lib/session', () => ({ requireUser }));
vi.mock('next/navigation', () => ({ redirect }));

import OnboardingPage from './page';

const open = (searchParams: Record<string, string> = {}) =>
  OnboardingPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(searchParams),
  } as PageProps<'/onboarding'>);

afterEach(cleanup);

describe('/onboarding', () => {
  beforeEach(() => {
    requireUser.mockResolvedValue({ user: { id: 'user' } });
    getAccountPlan.mockResolvedValue({ plan: PLANS.hobby });
  });

  it('creates the first and only assistant', async () => {
    getAccountAssistant.mockResolvedValue(null);

    render(await open());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Create your assistant');
    expect(screen.getByText(/Each account has one assistant/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create assistant' })).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sends an account that already has its assistant there instead of offering a second', async () => {
    getAccountAssistant.mockResolvedValue({ id: 'asst', name: 'Acme Docs', slug: 'acme-docs' });

    await expect(open({ plan: 'starter' })).rejects.toThrow('REDIRECT /a/asst');
  });

  it('carries a plan picked on the pricing page to billing', async () => {
    getAccountAssistant.mockResolvedValue(null);

    render(await open({ plan: 'growth', interval: 'yearly' }));

    expect(screen.getByRole('link', { name: 'billing page' })).toHaveAttribute(
      'href',
      '/billing?plan=growth&interval=yearly',
    );
  });
});
