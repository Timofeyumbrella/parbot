import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from '@/components/theme-toggle';

import { DemoWidget, WIDE_HERO_QUERY } from './demo-widget';

type WidgetApi = { setScheme: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
type WidgetWindow = Window & { Parbot?: WidgetApi };

/** The site's own provider settings: dark unless the visitor picks light, whatever the OS says. */
const renderLanding = () =>
  render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <ThemeToggle />
      <DemoWidget demoKey="pb_demo_key" />
    </ThemeProvider>,
  );

const widgetScripts = () => document.querySelectorAll<HTMLScriptElement>('script[data-parbot]');

/** jsdom never runs the script; this does what the browser does when it has. */
const runScript = (script: HTMLScriptElement) => {
  const api: WidgetApi = { setScheme: vi.fn(), destroy: vi.fn() };

  (window as WidgetWindow).Parbot = api;
  script.dispatchEvent(new Event('load'));

  return api;
};

describe('DemoWidget', () => {
  let wide = false;

  beforeEach(() => {
    wide = false;
    window.localStorage.clear();
    // A visitor whose OS prefers light: the case where the widget's own "auto" went white.
    vi.stubGlobal(
      'matchMedia',
      vi.fn((media: string) => ({
        media,
        matches: media === WIDE_HERO_QUERY && wide,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    delete (window as WidgetWindow).Parbot;
    vi.unstubAllGlobals();
  });

  it('loads the palette in the dark scheme the page shows rather than the light OS one', () => {
    renderLanding();

    expect(widgetScripts()).toHaveLength(1);

    const script = widgetScripts()[0]!;

    expect(script.getAttribute('src')).toBe('/widget.js');
    expect(script.dataset).toMatchObject({
      parbot: 'pb_demo_key',
      mode: 'palette',
      scheme: 'dark',
    });
  });

  it('keeps the pill off where the hero stacks, so it cannot cover the demo panel', () => {
    renderLanding().unmount();

    wide = true;
    renderLanding();
    expect(widgetScripts()[0]?.dataset.launcher).toBe('true');
  });

  it('shows no pill on a phone or a tablet', () => {
    renderLanding();
    expect(widgetScripts()[0]?.dataset.launcher).toBe('false');
  });

  it('follows the header toggle, whether or not the widget has started', async () => {
    const user = userEvent.setup();

    renderLanding();

    const toggle = screen.getByRole('button', { name: 'Toggle colour scheme' });
    const script = widgetScripts()[0]!;

    // Before the script has run, the attribute is what it will read.
    await user.click(toggle);
    expect(script.dataset.scheme).toBe('light');

    const api = runScript(script);

    await user.click(toggle);
    expect(script.dataset.scheme).toBe('dark');
    expect(api.setScheme).toHaveBeenLastCalledWith('dark');

    await user.click(toggle);
    expect(api.setScheme).toHaveBeenLastCalledWith('light');
    expect(widgetScripts()).toHaveLength(1);
  });

  it('takes the widget away when the visitor leaves the landing, and brings one back on return', () => {
    const view = renderLanding();
    const api = runScript(widgetScripts()[0]!);

    view.unmount();

    expect(api.destroy).toHaveBeenCalledTimes(1);
    expect(widgetScripts()).toHaveLength(0);

    renderLanding();
    expect(widgetScripts()).toHaveLength(1);
  });

  it('stops a copy that was still loading when the visitor left', () => {
    const view = renderLanding();
    const script = widgetScripts()[0]!;

    view.unmount();

    // The browser still runs a script removed mid-download; it must not mount on the next page.
    const api = runScript(script);

    expect(api.destroy).toHaveBeenCalledTimes(1);
  });
});
