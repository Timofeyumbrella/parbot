import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatTiles } from './stat-tiles';

describe('StatTiles', () => {
  it('shows the four headline numbers with formatted values and captions', () => {
    render(<StatTiles days={30} conversations={1234} questions={5678} answered={40} unanswered={10} leads={7} />);

    const tiles = screen.getAllByTestId('stat-tile');
    expect(tiles).toHaveLength(4);

    expect(within(tiles[0]!).getByText('Conversations')).toBeInTheDocument();
    expect(within(tiles[0]!).getByText('1,234')).toBeInTheDocument();
    expect(within(tiles[0]!).getByText('Started in the last 30 days')).toBeInTheDocument();

    expect(within(tiles[1]!).getByText('Questions')).toBeInTheDocument();
    expect(within(tiles[1]!).getByText('5,678')).toBeInTheDocument();

    expect(within(tiles[2]!).getByText('Answer rate')).toBeInTheDocument();
    expect(within(tiles[2]!).getByText('80%')).toBeInTheDocument();
    expect(within(tiles[2]!).getByText('40 of 50 answers found in the docs')).toBeInTheDocument();

    expect(within(tiles[3]!).getByText('Leads')).toBeInTheDocument();
    expect(within(tiles[3]!).getByText('7')).toBeInTheDocument();
    expect(within(tiles[3]!).getByText('Captured in the last 30 days')).toBeInTheDocument();
  });

  it('reads 0% and says so when nothing was answered yet', () => {
    render(<StatTiles days={7} conversations={0} questions={0} answered={0} unanswered={0} leads={0} />);

    const rate = screen.getAllByTestId('stat-tile')[2]!;
    expect(within(rate).getByText('0%')).toBeInTheDocument();
    expect(within(rate).getByText('No answers yet')).toBeInTheDocument();
    expect(screen.getByText('Started in the last 7 days')).toBeInTheDocument();
  });
});
