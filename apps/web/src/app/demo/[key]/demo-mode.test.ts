import { describe, expect, it } from 'vitest';

import { resolveDemoMode, resolveDemoPreview } from './demo-mode';

describe('resolveDemoMode', () => {
  it('offers only the modes the plan allows and ignores an override outside them', () => {
    const hobby = resolveDemoMode('palette', { mode: 'bubble', modes: ['bubble'] });

    expect(hobby).toEqual({ allowed: ['bubble'], override: null, active: 'bubble' });
  });

  it('passes an allowed override through and falls back to the saved mode', () => {
    const config = { mode: 'palette' as const, modes: ['bubble' as const, 'palette' as const] };

    expect(resolveDemoMode('bubble', config)).toEqual({ allowed: config.modes, override: 'bubble', active: 'bubble' });
    expect(resolveDemoMode(undefined, config)).toEqual({ allowed: config.modes, override: null, active: 'palette' });
    expect(resolveDemoMode('sidebar', config).override).toBeNull();
  });

  it('allows both modes when an older config carries no list', () => {
    expect(resolveDemoMode('palette', { mode: 'bubble' })).toMatchObject({ override: 'palette', active: 'palette' });
  });
});

describe('resolveDemoPreview', () => {
  it('reads the save counter and the open flag the settings preview adds', () => {
    expect(resolveDemoPreview({ v: '3', open: '1' })).toEqual({ version: '3', open: true });
    expect(resolveDemoPreview({ v: 'abc_-9', open: 'true' })).toEqual({ version: 'abc_-9', open: true });
  });

  it('drops anything that is not a plain token', () => {
    expect(resolveDemoPreview({})).toEqual({ version: null, open: false });
    expect(resolveDemoPreview({ v: 'not ok!', open: 'yes' })).toEqual({ version: null, open: false });
    expect(resolveDemoPreview({ v: ['1', '2'], open: ['1'] })).toEqual({ version: null, open: false });
    expect(resolveDemoPreview({ v: 'x'.repeat(33) })).toEqual({ version: null, open: false });
  });
});
