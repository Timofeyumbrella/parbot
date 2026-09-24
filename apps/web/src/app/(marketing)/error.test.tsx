import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MarketingError from './error';

describe('marketing error boundary', () => {
  afterEach(cleanup);

  it('says what happened and retries on request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const user = userEvent.setup();
    const retry = vi.fn();
    const reset = vi.fn();
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });

    render(<MarketingError error={error} retry={retry} reset={reset} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This page could not be loaded.');
    expect(screen.getByText(/reference abc123/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it('falls back to reset where retry is not provided', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const user = userEvent.setup();
    const reset = vi.fn();

    render(<MarketingError error={new Error('boom')} reset={reset} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
