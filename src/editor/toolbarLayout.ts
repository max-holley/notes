/** Toolbar layout model + reducer (pure; unit tested). Stored in synced prefs. */
export const TOOLBAR_GROUPS = {
  text: ['blockStyle'],
  inline: ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'clearFormatting'],
  lists: ['bulletList', 'orderedList', 'taskList', 'taskLine', 'outdent', 'indent'],
  insert: ['section', 'table', 'image', 'horizontalRule', 'codeBlock'],
  style: ['align', 'textColor', 'highlight'],
  history: ['undo', 'redo'],
} as const;

export type ToolbarControlId = (typeof TOOLBAR_GROUPS)[keyof typeof TOOLBAR_GROUPS][number];
export const ALL_CONTROLS: ToolbarControlId[] = Object.values(TOOLBAR_GROUPS).flat();

export type LayoutItem = { type: 'control'; id: ToolbarControlId; visible: boolean } | { type: 'separator'; id: string };
export interface ToolbarLayout {
  items: LayoutItem[];
}

export function defaultLayout(): ToolbarLayout {
  const items: LayoutItem[] = [];
  Object.values(TOOLBAR_GROUPS).forEach((ids, gi) => {
    if (gi > 0) items.push({ type: 'separator', id: `sep-${gi}` });
    for (const id of ids) items.push({ type: 'control', id, visible: true });
  });
  return { items };
}

/** Repair a stored layout: drop unknown/duplicate controls, append controls added in newer versions. */
export function normalizeLayout(layout: ToolbarLayout | null | undefined): ToolbarLayout {
  if (!layout || !Array.isArray(layout.items)) return defaultLayout();
  const seen = new Set<string>();
  const items: LayoutItem[] = [];
  for (const it of layout.items) {
    if (!it || typeof it !== 'object') continue;
    if (it.type === 'separator') {
      if (!seen.has(it.id)) items.push({ type: 'separator', id: it.id });
    } else if (it.type === 'control' && (ALL_CONTROLS as string[]).includes(it.id) && !seen.has(it.id)) {
      items.push({ type: 'control', id: it.id, visible: it.visible !== false });
    } else continue;
    seen.add(it.id);
  }
  for (const id of ALL_CONTROLS) if (!seen.has(id)) items.push({ type: 'control', id, visible: true });
  return { items };
}

export type LayoutAction =
  | { type: 'toggle'; id: ToolbarControlId }
  | { type: 'setVisible'; id: ToolbarControlId; visible: boolean }
  | { type: 'move'; from: number; to: number }
  | { type: 'addSeparator'; index: number }
  | { type: 'remove'; id: string }
  | { type: 'reset' };

export function layoutReducer(state: ToolbarLayout, action: LayoutAction): ToolbarLayout {
  const items = [...state.items];
  switch (action.type) {
    case 'toggle':
    case 'setVisible':
      return {
        items: items.map((it) =>
          it.type === 'control' && it.id === action.id ? { ...it, visible: action.type === 'toggle' ? !it.visible : action.visible } : it,
        ),
      };
    case 'move': {
      if (action.from < 0 || action.from >= items.length) return state;
      const to = Math.max(0, Math.min(items.length - 1, action.to));
      const [it] = items.splice(action.from, 1);
      items.splice(to, 0, it!);
      return { items };
    }
    case 'addSeparator':
      items.splice(Math.max(0, Math.min(items.length, action.index)), 0, {
        type: 'separator',
        id: `sep-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      });
      return { items };
    case 'remove': {
      const it = items.find((x) => x.id === action.id);
      if (!it) return state;
      // Controls are hidden rather than deleted so they can always be re-added.
      if (it.type === 'control') return layoutReducer(state, { type: 'setVisible', id: it.id, visible: false });
      return { items: items.filter((x) => x.id !== action.id) };
    }
    case 'reset':
      return defaultLayout();
  }
}

/** What actually renders: hidden controls removed, separators collapsed (no leading/trailing/double). */
export function visibleItems(layout: ToolbarLayout): LayoutItem[] {
  const out: LayoutItem[] = [];
  for (const it of layout.items) {
    if (it.type === 'control' && !it.visible) continue;
    if (it.type === 'separator' && (out.length === 0 || out[out.length - 1]!.type === 'separator')) continue;
    out.push(it);
  }
  while (out.length && out[out.length - 1]!.type === 'separator') out.pop();
  return out;
}

/** Split into the items that fit in `width` and the overflow ("more" menu). */
export function fitItems(items: LayoutItem[], width: number, widthOf: (it: LayoutItem) => number, moreWidth = 40) {
  const total = items.reduce((s, it) => s + widthOf(it), 0);
  if (total <= width) return { shown: items, overflow: [] as LayoutItem[] };
  const shown: LayoutItem[] = [];
  let used = moreWidth;
  let i = 0;
  for (; i < items.length; i++) {
    const w = widthOf(items[i]!);
    if (used + w > width) break;
    shown.push(items[i]!);
    used += w;
  }
  while (shown.length && shown[shown.length - 1]!.type === 'separator') shown.pop();
  return { shown, overflow: items.slice(i).filter((it) => it.type === 'control') };
}
