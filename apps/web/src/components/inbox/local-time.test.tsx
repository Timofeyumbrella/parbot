import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatDateTime } from '@/lib/format';

import { AbsoluteTime, LocalTime } from './local-time';

const NOW = new Date('2026-09-23T12:00:00Z').getTime();

describe('LocalTime', () => {
  it('reads relative to the request clock and carries the absolute moment as a tooltip', () => {
    render(<LocalTime value="2026-09-23T11:55:00Z" now={NOW} />);

    const time = screen.getByText('5 min ago');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-09-23T11:55:00Z');
    // jsdom renders on the client, so the viewer's zone is known and the tooltip is present.
    expect(time).toHaveAttribute('title', formatDateTime('2026-09-23T11:55:00Z'));
  });

  it('never runs ahead of the request clock', () => {
    render(<LocalTime value="2026-09-23T13:00:00Z" now={NOW} />);

    expect(screen.getByText('just now')).toBeInTheDocument();
  });
});

describe('AbsoluteTime', () => {
  it('formats in the viewer time zone once hydrated', () => {
    render(<AbsoluteTime value="2026-09-03T14:05:00Z" />);

    expect(screen.getByText(formatDateTime('2026-09-03T14:05:00Z'))).toBeInTheDocument();
  });
});
