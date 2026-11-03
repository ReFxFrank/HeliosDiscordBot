import { describe, expect, it } from 'vitest';
import { MODULES } from '@refx/shared';
import { MODULE_META, MODULE_META_BY_KEY, groupedModuleMeta, moduleBySlug } from './modules';

describe('MODULE_META', () => {
  it('has exactly one entry per module', () => {
    const keys = MODULE_META.map((meta) => meta.module);
    expect(new Set(keys).size).toBe(keys.length);
    for (const module of MODULES) expect(MODULE_META_BY_KEY[module]).toBeDefined();
    expect(keys.length).toBe(MODULES.length);
  });

  it('puts the FiveM page first in the sidebar', () => {
    const [first] = groupedModuleMeta();
    expect(first?.group).toBe('ReFx City');
    expect(first?.modules.map((meta) => meta.module)).toEqual(['FIVEM']);
    expect(moduleBySlug('fivem')).toBe('FIVEM');
  });
});
