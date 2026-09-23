import { DEFAULT_WIDGET_THEME } from '@parbot/shared';
import { describe, expect, it } from 'vitest';

import { accentText, findScript, normalizeConfig, onAccent, readScriptOptions } from './config';

const script = (attributes: Record<string, string>) => {
  const node = document.createElement('script');

  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }

  return node;
};

describe('readScriptOptions', () => {
  it('needs a key', () => {
    expect(readScriptOptions(null)).toBeNull();
    expect(readScriptOptions(script({}))).toBeNull();
    expect(readScriptOptions(script({ 'data-parbot': '  ' }))).toBeNull();
  });

  it('defaults the api to the origin the script came from', () => {
    expect(readScriptOptions(script({ 'data-parbot': 'pb_1', src: 'https://app.parbot.dev/widget.js' }))).toEqual({
      key: 'pb_1',
      api: 'https://app.parbot.dev',
      mode: null,
      launcher: true,
    });
  });

  it('falls back to the page origin without a src and honours overrides', () => {
    expect(
      readScriptOptions(script({ 'data-parbot': 'pb_1', 'data-mode': 'Palette', 'data-launcher': 'false', 'data-api': 'http://localhost:3104/' })),
    ).toEqual({ key: 'pb_1', api: 'http://localhost:3104', mode: 'palette', launcher: false });

    expect(readScriptOptions(script({ 'data-parbot': 'pb_1', 'data-mode': 'weird' }))).toMatchObject({
      api: window.location.origin,
      mode: null,
    });
  });
});

describe('findScript', () => {
  it('finds a tagged script in the document', () => {
    const node = script({ 'data-parbot': 'pb_1' });
    document.head.append(node);

    expect(findScript()).toBe(node);

    node.remove();
    expect(findScript()).toBeNull();
  });
});

describe('normalizeConfig', () => {
  it('rejects shapes without an assistant', () => {
    expect(normalizeConfig(null)).toBeNull();
    expect(normalizeConfig({ name: 'x' })).toBeNull();
  });

  it('fills in safe defaults', () => {
    expect(normalizeConfig({ assistantId: 'a', name: 'Docs', theme: { accent: 'red' }, suggestedQuestions: ['q1', '', 3, 'q2', 'q3', 'q4', 'q5'] })).toEqual({
      assistantId: 'a',
      name: 'Docs',
      welcomeMessage: '',
      suggestedQuestions: ['q1', 'q2', 'q3', 'q4'],
      mode: 'bubble',
      theme: DEFAULT_WIDGET_THEME,
      hideBranding: false,
      leadCapture: false,
    });
  });
});

describe('colours', () => {
  it('picks dark text on light accents and light text on dark ones', () => {
    expect(onAccent('#f59e0b')).toBe('#111114');
    expect(onAccent('#2563eb')).toBe('#ffffff');
    expect(onAccent('#0f172a')).toBe('#ffffff');
  });

  it('keeps accent text readable against the scheme', () => {
    expect(accentText('#2563eb', 'light')).toBe('#2563eb');
    expect(accentText('#f59e0b', 'light')).not.toBe('#f59e0b');
    expect(accentText('#0f172a', 'dark')).not.toBe('#0f172a');
    expect(accentText('#0f172a', 'light')).toBe('#0f172a');
    expect(accentText('nope', 'light')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
