import { describe, expect, it } from 'vitest';

import { demoNames, resolveDemoMode, resolveDemoPreview } from './demo-mode';

describe('resolveDemoMode', () => {
  it('offers only the modes the plan allows and ignores an override outside them', () => {
    const hobby = resolveDemoMode('palette', { mode: 'bubble', modes: ['bubble'] });

    expect(hobby).toEqual({ allowed: ['bubble'], override: null, active: 'bubble' });
  });

  it('passes an allowed override through and falls back to the saved mode', () => {
    const config = { mode: 'palette' as const, modes: ['bubble' as const, 'palette' as const] };

    expect(resolveDemoMode('bubble', config)).toEqual({
      allowed: config.modes,
      override: 'bubble',
      active: 'bubble',
    });
    expect(resolveDemoMode(undefined, config)).toEqual({
      allowed: config.modes,
      override: null,
      active: 'palette',
    });
    expect(resolveDemoMode('sidebar', config).override).toBeNull();
  });

  it('allows both modes when an older config carries no list', () => {
    expect(resolveDemoMode('palette', { mode: 'bubble' })).toMatchObject({
      override: 'palette',
      active: 'palette',
    });
  });
});

describe('resolveDemoPreview', () => {
  it('reads the open flag the settings preview adds', () => {
    expect(resolveDemoPreview({ open: '1' })).toEqual({ open: true });
    expect(resolveDemoPreview({ open: 'true' })).toEqual({ open: true });
  });

  it('stays closed for anything else', () => {
    expect(resolveDemoPreview({})).toEqual({ open: false });
    expect(resolveDemoPreview({ open: 'yes' })).toEqual({ open: false });
    expect(resolveDemoPreview({ open: ['1'] })).toEqual({ open: false });
  });
});

describe('demoNames', () => {
  it('says docs once, whether or not the assistant is already named after its docs', () => {
    expect(demoNames('Parbot Docs')).toEqual({ product: 'Parbot', site: 'Parbot Docs' });
    expect(demoNames('Northwind docs')).toEqual({ product: 'Northwind', site: 'Northwind docs' });
    expect(demoNames('Acme Documentation')).toEqual({
      product: 'Acme',
      site: 'Acme Documentation',
    });
    expect(demoNames('Acme')).toEqual({ product: 'Acme', site: 'Acme docs' });
  });

  it('leaves names that only contain the word, or are nothing but it, readable', () => {
    expect(demoNames('Hotdocs')).toEqual({ product: 'Hotdocs', site: 'Hotdocs docs' });
    expect(demoNames('Docs')).toEqual({ product: 'Docs', site: 'Docs' });
    expect(demoNames('Docs for Acme')).toEqual({
      product: 'Docs for Acme',
      site: 'Docs for Acme docs',
    });
  });
});
