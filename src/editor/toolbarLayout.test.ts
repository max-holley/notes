import { describe, expect, it } from 'vitest';
import { ALL_CONTROLS, defaultLayout, fitItems, layoutReducer, normalizeLayout, visibleItems } from './toolbarLayout.ts';

describe('toolbar layout reducer', () => {
  it('default has every control in groups separated by separators', () => {
    const d = defaultLayout();
    expect(d.items.filter((i) => i.type === 'control').map((i) => i.id)).toEqual(ALL_CONTROLS);
    expect(d.items.filter((i) => i.type === 'separator')).toHaveLength(5);
  });

  it('toggles, hides via remove, reorders and resets', () => {
    let s = defaultLayout();
    s = layoutReducer(s, { type: 'toggle', id: 'bold' });
    expect(s.items.find((i) => i.id === 'bold')).toMatchObject({ visible: false });
    s = layoutReducer(s, { type: 'move', from: 0, to: 3 });
    expect(s.items[3]!.id).toBe('blockStyle');
    s = layoutReducer(s, { type: 'remove', id: 'italic' });
    expect(s.items.find((i) => i.id === 'italic')).toMatchObject({ visible: false });
    const sep = s.items.find((i) => i.type === 'separator')!;
    s = layoutReducer(s, { type: 'remove', id: sep.id });
    expect(s.items.find((i) => i.id === sep.id)).toBeUndefined();
    s = layoutReducer(s, { type: 'addSeparator', index: 1 });
    expect(s.items[1]!.type).toBe('separator');
    expect(layoutReducer(s, { type: 'reset' })).toEqual(defaultLayout());
  });

  it('collapses separators when controls are hidden', () => {
    let s = defaultLayout();
    s = layoutReducer(s, { type: 'toggle', id: 'blockStyle' });
    const v = visibleItems(s);
    expect(v[0]!.type).toBe('control');
    for (let i = 1; i < v.length; i++) expect(v[i]!.type === 'separator' && v[i - 1]!.type === 'separator').toBe(false);
    for (const id of ALL_CONTROLS) s = layoutReducer(s, { type: 'setVisible', id, visible: false });
    expect(visibleItems(s)).toEqual([]);
  });

  it('normalizes stored layouts (unknown, duplicate and new controls)', () => {
    const n = normalizeLayout({
      items: [
        { type: 'control', id: 'bold', visible: false },
        { type: 'control', id: 'bold', visible: true },
        { type: 'control', id: 'nope' as 'bold', visible: true },
      ],
    });
    expect(n.items[0]).toEqual({ type: 'control', id: 'bold', visible: false });
    expect(n.items.filter((i) => i.type === 'control')).toHaveLength(ALL_CONTROLS.length);
    expect(normalizeLayout(null)).toEqual(defaultLayout());
  });

  it('fits items into the available width with overflow', () => {
    const items = visibleItems(defaultLayout());
    expect(fitItems(items, 10_000, () => 40).overflow).toEqual([]);
    const some = fitItems(items, 200, (i) => (i.type === 'separator' ? 9 : 40));
    expect(some.shown.length).toBeGreaterThan(0);
    expect(some.shown.length + some.overflow.length).toBeLessThanOrEqual(items.length);
    expect(some.overflow.every((i) => i.type === 'control')).toBe(true);
  });
});
