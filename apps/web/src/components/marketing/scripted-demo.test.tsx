import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO_SCENES, DEMO_SOURCES, DEMO_TIMING, type DemoScene } from './demo-script';
import { ScriptedDemo } from './scripted-demo';

const SCENES: DemoScene[] = [
  {
    question: 'First?',
    answer: 'First answer [1].',
    citations: [{ index: 1, documentId: 'guide', title: 'guide.pdf', url: null }],
  },
  {
    question: 'Second?',
    answer: 'Second answer with a few more words in it [1].',
    citations: [
      {
        index: 1,
        documentId: 'changelog',
        title: 'Changelog',
        url: 'https://docs.example.com/changelog',
      },
    ],
  },
];

/** Stands in for the browser's observer; `show` delivers what it would on scroll. */
class FakeObserver {
  static last: FakeObserver | null = null;
  observed: Element[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.last = this;
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  unobserve() {}

  disconnect() {
    this.observed = [];
  }

  takeRecords() {
    return [];
  }

  show(visible: boolean) {
    act(() => {
      this.callback(
        [{ isIntersecting: visible } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    });
  }
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/** Steps the clock 10 ms at a time until `done` holds; the script's waits vary a little. */
const advanceUntil = (done: () => boolean, limit = 30_000) => {
  for (let elapsed = 0; elapsed < limit; elapsed += 10) {
    if (done()) {
      return;
    }

    advance(10);
  }

  throw new Error('The demo did not get there in time.');
};

const frame = () => screen.getByTestId('demo-frame');
const composer = () => screen.getByTestId('demo-composer');
const userMessages = () =>
  screen.queryAllByTestId('demo-user-message').map((node) => node.textContent);
const thinking = () => screen.queryByLabelText('Thinking') !== null;

describe('ScriptedDemo', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeObserver.last = null;
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the first exchange finished, with the indexed files and grouped sources', () => {
    render(<ScriptedDemo />);

    const figure = screen.getByRole('figure', { name: /example conversation/i });

    expect(figure).toContainElement(frame());
    expect(userMessages()).toEqual([DEMO_SCENES[0]!.question]);
    expect(screen.getByTestId('demo-code-block')).toHaveTextContent('curl');
    expect(screen.getByTestId('demo-code-block')).toHaveTextContent('bash');

    const strip = screen.getByTestId('demo-sources-strip');

    for (const source of DEMO_SOURCES) {
      expect(strip).toHaveTextContent(source.name);
    }

    expect(strip).toHaveTextContent(`${DEMO_SOURCES.length} sources ready`);
    expect(
      within(screen.getByTestId('demo-sources'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['1api-reference.pdf', '2auth-guide.docx']);
    expect(screen.getByText('Example')).toBeInTheDocument();
  });

  it('is a picture: inert, with nothing to type in, press or follow', () => {
    render(<ScriptedDemo />);

    expect(frame()).toHaveAttribute('inert');
    expect(frame().querySelectorAll('input, textarea, button, a, [tabindex]')).toHaveLength(0);
  });

  it('waits until it is on screen, then types, sends, streams and cites the next question', () => {
    render(<ScriptedDemo scenes={SCENES} />);

    advance(60_000);
    expect(userMessages()).toEqual(['First?']);

    FakeObserver.last!.show(true);
    advance(DEMO_TIMING.startMs + 60);
    expect(composer()).toHaveTextContent(/^S$/);

    advanceUntil(() => composer().textContent === 'Second?');
    expect(userMessages()).toEqual(['First?']);

    // Sent: the bubble and the thinking dots land together, and the composer empties.
    advanceUntil(thinking);
    expect(userMessages()).toEqual(['First?', 'Second?']);
    expect(composer()).toHaveTextContent('Ask a question about the docs');

    advance(DEMO_TIMING.thinkMs - 20);
    expect(thinking()).toBe(true);
    advance(20);
    expect(thinking()).toBe(false);
    expect(screen.getAllByTestId('demo-answer')[1]).toHaveTextContent(/^Second answer$/);
    expect(screen.getAllByTestId('demo-sources')).toHaveLength(1);

    advance(3_000);
    expect(screen.getAllByTestId('demo-answer')[1]).toHaveTextContent(
      'Second answer with a few more words in it 1.',
    );

    const sources = screen.getAllByTestId('demo-sources');

    expect(sources).toHaveLength(2);
    expect(sources[1]).toHaveTextContent('1Changelogdocs.example.com');
  });

  it('pauses while off screen and in a hidden tab, and picks up where it stopped', () => {
    render(<ScriptedDemo scenes={SCENES} />);

    FakeObserver.last!.show(true);
    advance(DEMO_TIMING.startMs + 60);
    expect(composer()).toHaveTextContent(/^S$/);

    FakeObserver.last!.show(false);
    advance(60_000);
    expect(composer()).toHaveTextContent(/^S$/);

    FakeObserver.last!.show(true);
    advance(200);
    expect(composer().textContent).toMatch(/^Se/);

    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const typed = composer().textContent;

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(60_000);
    expect(composer().textContent).toBe(typed);

    hidden.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advanceUntil(thinking);
    expect(userMessages()).toEqual(['First?', 'Second?']);
  });

  it('holds the first exchange still under reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('reduce'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    render(<ScriptedDemo scenes={SCENES} />);

    expect(FakeObserver.last).toBeNull();
    advance(120_000);
    expect(userMessages()).toEqual(['First?']);
    expect(screen.getByTestId('demo-answer')).toHaveTextContent('First answer 1.');
    expect(screen.getByTestId('demo-sources')).toHaveTextContent('1guide.pdf');
    expect(composer()).toHaveTextContent('Ask a question about the docs');
  });

  it('loops through the refusal and the email offer into a fresh conversation, without a request', () => {
    render(<ScriptedDemo />);

    FakeObserver.last!.show(true);

    const refusal = DEMO_SCENES.find((scene) => scene.lead)!;
    let sawLead = false;
    let sawThanks = false;
    let sawWelcome = false;
    let restarted = false;

    for (let elapsed = 0; elapsed < 90_000 && !restarted; elapsed += 250) {
      advance(250);
      sawLead ||= screen.queryByTestId('demo-lead') !== null;
      sawThanks ||=
        screen.queryByTestId('demo-lead-thanks')?.textContent ===
        `Thanks. The team will reply to ${refusal.lead!.email}.`;
      sawWelcome ||= screen.queryByTestId('demo-suggestions') !== null;
      restarted = sawWelcome && userMessages().join('|') === DEMO_SCENES[0]!.question && thinking();
    }

    expect(sawLead).toBe(true);
    expect(sawThanks).toBe(true);
    expect(sawWelcome).toBe(true);
    expect(restarted).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stops its timers when it unmounts', () => {
    const { unmount } = render(<ScriptedDemo scenes={SCENES} />);

    FakeObserver.last!.show(true);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
