import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO_TIMING, type DemoScene } from './demo-script';
import { ScriptedDemo } from './scripted-demo';

const SCENES: DemoScene[] = [
  {
    question: 'First?',
    answer: 'First answer [1].',
    citations: [{ index: 1, title: 'Page one', url: 'https://docs.example.com/one' }],
  },
  {
    question: 'Second?',
    answer: 'Second answer [1].',
    citations: [{ index: 1, title: 'Page two', url: 'https://docs.example.com/two' }],
  },
];

const { holdMs, keystrokeMs, beforeSendMs, thinkMs, wordMs } = DEMO_TIMING;

describe('ScriptedDemo', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the first scene complete before any script runs', () => {
    render(<ScriptedDemo scenes={SCENES} />);

    expect(screen.getByText('First?')).toBeInTheDocument();
    expect(screen.getByText('First answer', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1' })).toHaveAttribute(
      'href',
      'https://docs.example.com/one',
    );
    expect(screen.getByText('Demo')).toBeInTheDocument();
  });

  it('types the next question, streams its answer and loops back', async () => {
    render(<ScriptedDemo scenes={SCENES} />);

    let now = 0;
    const advanceTo = async (time: number) => {
      await act(() => vi.advanceTimersByTimeAsync(time - now));
      now = time;
    };

    // The first scene holds, then the second question is typed one character at a time.
    await advanceTo(holdMs + keystrokeMs * 3.5);
    expect(screen.getByText('Sec')).toBeInTheDocument();
    expect(screen.queryByText('Second answer', { exact: false })).not.toBeInTheDocument();

    const sent = holdMs + keystrokeMs * 'Second?'.length + beforeSendMs;

    await advanceTo(sent + thinkMs / 2);
    expect(screen.getByText('Second?')).toBeInTheDocument();
    expect(screen.getByLabelText('Thinking')).toBeInTheDocument();

    const streamed = sent + thinkMs;

    await advanceTo(streamed + wordMs * 0.5);
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '1' })).not.toBeInTheDocument();

    const done = streamed + wordMs * 'Second answer [1].'.split(' ').length;

    await advanceTo(done + 5);
    expect(screen.getByText('Second answer', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1' })).toHaveAttribute(
      'href',
      'https://docs.example.com/two',
    );

    // After the hold the loop wraps around to the first scene and types it again.
    await advanceTo(done + holdMs + keystrokeMs * 2.5);
    expect(screen.getByText('Fi')).toBeInTheDocument();
  });
});
