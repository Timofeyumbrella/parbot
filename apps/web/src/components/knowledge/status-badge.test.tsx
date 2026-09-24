import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

import { StatusBadge } from './status-badge';

const base = { pages_found: 0, pages_done: 0, error: null };

describe('StatusBadge', () => {
  it('names each stage of the pipeline, with progress while indexing', () => {
    const { rerender } = render(<StatusBadge source={{ ...base, status: 'queued' }} />);
    expect(screen.getByText('Queued')).toBeInTheDocument();

    rerender(<StatusBadge source={{ ...base, status: 'crawling', pages_found: 7 }} />);
    expect(screen.getByText('Crawling · 7 pages')).toBeInTheDocument();

    rerender(<StatusBadge source={{ ...base, status: 'indexing', pages_found: 12, pages_done: 3 }} />);
    expect(screen.getByText('Indexing 3 of 12 pages')).toBeInTheDocument();

    rerender(<StatusBadge source={{ ...base, status: 'ready' }} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows the failure reason on hover', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider delayDuration={0}>
        <StatusBadge source={{ ...base, status: 'failed', error: 'Could not fetch https://x.test: HTTP 404.' }} />
      </TooltipProvider>,
    );

    const badge = screen.getByText('Failed');

    await user.hover(badge);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Could not fetch https://x.test: HTTP 404.');
  });
});
