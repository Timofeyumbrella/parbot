import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { checkCapacity } from '@/lib/plans';

import { NewAssistantButton } from './new-assistant-button';

// Radix measures the tooltip with ResizeObserver, which jsdom does not ship.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(cleanup);

describe('NewAssistantButton', () => {
  it('links to onboarding while the plan has room', () => {
    render(
      <TooltipProvider>
        <NewAssistantButton
          capacity={checkCapacity('starter', 1, 'assistants')}
          planName="Starter"
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('link', { name: 'New assistant' })).toHaveAttribute(
      'href',
      '/onboarding',
    );
    expect(screen.queryByRole('link', { name: 'Upgrade' })).not.toBeInTheDocument();
  });

  it('disables itself at the limit, explains why on hover and offers billing', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider delayDuration={0}>
        <NewAssistantButton capacity={checkCapacity('hobby', 1, 'assistants')} planName="Hobby" />
      </TooltipProvider>,
    );

    const button = screen.getByRole('button', { name: 'New assistant' });

    expect(button).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/billing');

    await user.hover(button.parentElement!);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'The Hobby plan includes 1 assistant. Upgrade to add more.',
    );
  });
});
