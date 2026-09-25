import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from '@/components/theme-toggle';

import { DemoWidget, WIDE_HERO_QUERY } from './demo-widget';

type WidgetWindow = Window & { Parbot?: { setScheme: (scheme: string) => void } };

/** The site's own provider settings: dark unless the visitor picks light, whatever the OS says. */
const renderLanding = () =>
  render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <ThemeToggle />
      <DemoWidget demoKey="pb_demo_key" />
    </ThemeProvider>,
  );

const widgetScripts = () => document.querySelectorAll<HTMLScriptElement>('script[data-parbot]');

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
    for (const script of widgetScripts()) {
      script.remove();
    }

    delete (window as WidgetWindow).Parbot;
    vi.unstubAllGlobals();
  });

  it('loads the palette once, in the dark scheme the page shows rather than the light OS one', () => {
    // Leaving the landing and coming back must not load a second widget.
    renderLanding().unmount();
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
    expect(widgetScripts()[0]?.dataset.launcher).toBe('false');

    widgetScripts()[0]?.remove();
    wide = true;
    renderLanding();
    expect(widgetScripts()[0]?.dataset.launcher).toBe('true');
  });

  it('follows the header toggle, whether or not the widget has started', async () => {
    const user = userEvent.setup();
    const setScheme = vi.fn();

    renderLanding();

    const toggle = screen.getByRole('button', { name: 'Toggle colour scheme' });

    // Before the script has run there is no window.Parbot; the attribute is what it will read.
    await user.click(toggle);
    expect(widgetScripts()[0]?.dataset.scheme).toBe('light');

    (window as WidgetWindow).Parbot = { setScheme };

    await user.click(toggle);
    expect(widgetScripts()[0]?.dataset.scheme).toBe('dark');
    expect(setScheme).toHaveBeenLastCalledWith('dark');

    await user.click(toggle);
    expect(setScheme).toHaveBeenLastCalledWith('light');
    expect(widgetScripts()).toHaveLength(1);
  });
});
