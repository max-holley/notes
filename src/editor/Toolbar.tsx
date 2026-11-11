import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowDropDownOutlined from '@mui/icons-material/ArrowDropDownOutlined';
import FormatAlignCenterOutlined from '@mui/icons-material/FormatAlignCenterOutlined';
import FormatAlignJustifyOutlined from '@mui/icons-material/FormatAlignJustifyOutlined';
import FormatAlignLeftOutlined from '@mui/icons-material/FormatAlignLeftOutlined';
import FormatAlignRightOutlined from '@mui/icons-material/FormatAlignRightOutlined';
import FormatColorResetOutlined from '@mui/icons-material/FormatColorResetOutlined';
import MoreHorizOutlined from '@mui/icons-material/MoreHorizOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNotes } from '../store/notes.ts';
import { useUi } from '../store/ui.ts';
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '../theme/tokens.ts';
import { BLOCK_STYLES, CONTROLS, tooltipFor } from './controls.tsx';
import { SECTION_TYPES } from './extensions/section.tsx';
import { fitItems, normalizeLayout, visibleItems, type LayoutItem, type ToolbarControlId } from './toolbarLayout.ts';

export interface ToolbarContext {
  pickImage(): void;
  openLink(): void;
}

const ALIGNS = [
  { v: 'left', label: 'Align left', icon: FormatAlignLeftOutlined, shortcut: 'Ctrl+Shift+L' },
  { v: 'center', label: 'Align centre', icon: FormatAlignCenterOutlined, shortcut: 'Ctrl+Shift+E' },
  { v: 'right', label: 'Align right', icon: FormatAlignRightOutlined, shortcut: 'Ctrl+Shift+R' },
  { v: 'justify', label: 'Justify', icon: FormatAlignJustifyOutlined, shortcut: 'Ctrl+Shift+J' },
];

const widthOf = (it: LayoutItem) => (it.type === 'separator' ? 17 : it.id === 'blockStyle' ? 124 : 40);

function TableGrid({ onPick }: { onPick(rows: number, cols: number): void }) {
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  return (
    <Box sx={{ p: 1.5 }}>
      <Box role="grid" aria-label="Table size" sx={{ display: 'grid', gridTemplateColumns: 'repeat(10, 20px)', gap: 0.5 }} onMouseLeave={() => setHover([0, 0])}>
        {Array.from({ length: 80 }, (_, i) => {
          const r = Math.floor(i / 10) + 1;
          const c = (i % 10) + 1;
          const on = r <= hover[0] && c <= hover[1];
          return (
            <Box
              key={i}
              component="button"
              type="button"
              aria-label={`${c} × ${r} table`}
              data-testid={`grid-${c}x${r}`}
              onMouseEnter={() => setHover([r, c])}
              onFocus={() => setHover([r, c])}
              onClick={() => onPick(r, c)}
              sx={{ width: 20, height: 20, p: 0, border: 1, borderRadius: 0.5, cursor: 'pointer', borderColor: on ? 'primary.main' : 'divider', bgcolor: on ? 'm3.primaryContainer' : 'transparent' }}
            />
          );
        })}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
        {hover[0] ? `${hover[1]} × ${hover[0]}` : 'Choose a size'}
      </Typography>
    </Box>
  );
}

function Swatches({ colors, onPick, none }: { colors: readonly { label: string; value: string | null }[]; onPick(v: string | null): void; none: string }) {
  return (
    <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: 'repeat(5, 32px)', gap: 1 }}>
      <Tooltip title={none}>
        <IconButton size="small" aria-label={none} onClick={() => onPick(null)} sx={{ border: 1, borderColor: 'divider' }}>
          <FormatColorResetOutlined fontSize="small" />
        </IconButton>
      </Tooltip>
      {colors.filter((c) => c.value).map((c) => (
        <Tooltip key={c.label} title={c.label}>
          <Box component="button" type="button" aria-label={c.label} onClick={() => onPick(c.value)} sx={{ width: 32, height: 32, borderRadius: '50%', border: 1, borderColor: 'divider', bgcolor: c.value, cursor: 'pointer' }} />
        </Tooltip>
      ))}
    </Box>
  );
}

export function Toolbar({ editor, ctx, compact }: { editor: Editor; ctx: ToolbarContext; compact: boolean }) {
  const stored = useNotes((s) => s.doc.prefs.toolbar);
  const setUi = useUi((s) => s.set);
  const layout = useMemo(() => normalizeLayout(stored), [stored]);
  const items = useMemo(() => visibleItems(layout), [layout]);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(2000);
  const [menu, setMenu] = useState<{ id: ToolbarControlId; anchor: HTMLElement } | null>(null);
  const [more, setMore] = useState<HTMLElement | null>(null);
  // Re-render on selection/doc changes so active states stay current.
  useEditorState({ editor, selector: ({ editor: e }) => ({ sel: e.state.selection.toJSON(), doc: e.state.doc.content.size, undo: e.can().undo() }) });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width - 48));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { shown, overflow } = fitItems(items, width, widthOf);

  const activate = (id: ToolbarControlId, anchor: HTMLElement) => {
    const c = CONTROLS[id];
    if (id === 'image') return ctx.pickImage();
    if (id === 'link') return ctx.openLink();
    if (c.kind === 'menu') setMenu({ id, anchor });
    else c.run?.(editor);
  };
  const close = () => setMenu(null);
  const blockLabel = BLOCK_STYLES.find((b) => b.active(editor))?.label ?? 'Body';

  const renderItem = (it: LayoutItem) => {
    if (it.type === 'separator') return <Divider key={it.id} orientation="vertical" flexItem sx={{ mx: 1, my: 1 }} />;
    const c = CONTROLS[it.id];
    const active = c.isActive?.(editor) ?? false;
    const disabled = c.isDisabled?.(editor) ?? false;
    if (it.id === 'blockStyle') {
      return (
        <Tooltip key={it.id} title={c.label}>
          <Button
            size="small"
            color="inherit"
            endIcon={<ArrowDropDownOutlined />}
            onClick={(e) => activate(it.id, e.currentTarget)}
            aria-haspopup="menu"
            aria-label={`${c.label}: ${blockLabel}`}
            sx={{ width: 116, justifyContent: 'space-between', borderRadius: 2, px: 1.5, flexShrink: 0 }}
            data-testid="tb-blockStyle"
          >
            {blockLabel}
          </Button>
        </Tooltip>
      );
    }
    return (
      <Tooltip key={it.id} title={tooltipFor(c)}>
        <span>
          <IconButton
            size="small"
            aria-label={c.label}
            aria-pressed={c.kind === 'button' && c.isActive ? active : undefined}
            aria-haspopup={c.kind === 'menu' ? 'true' : undefined}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => activate(it.id, e.currentTarget)}
            data-testid={`tb-${it.id}`}
            sx={{ width: 36, height: 36, mx: 0.25, borderRadius: 2, ...(active ? { bgcolor: 'm3.secondaryContainer', color: 'm3.onSecondaryContainer', '&:hover': { bgcolor: 'm3.secondaryContainer' } } : {}) }}
          >
            <c.icon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    );
  };

  return (
    <Box
      ref={ref}
      role="toolbar"
      aria-label="Formatting"
      onContextMenu={(e) => {
        e.preventDefault();
        setUi({ dialog: 'toolbar' });
      }}
      data-testid="editor-toolbar"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        minHeight: compact ? 48 : 52,
        px: 1,
        bgcolor: 'm3.surfaceContainer',
        borderRadius: compact ? 0 : 7,
        mx: compact ? 0 : 2,
        overflow: 'hidden',
      }}
    >
      {shown.map(renderItem)}
      <Box sx={{ flex: 1 }} />
      {overflow.length > 0 && (
        <Tooltip title="More formatting">
          <IconButton size="small" aria-label="More formatting" aria-haspopup="menu" onClick={(e) => setMore(e.currentTarget)} data-testid="tb-more">
            <MoreHorizOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="Customise toolbar">
        <IconButton size="small" aria-label="Customise toolbar" onClick={() => setUi({ dialog: 'toolbar' })} data-testid="tb-customise">
          <TuneOutlined fontSize="small" />
        </IconButton>
      </Tooltip>

      <Menu anchorEl={more} open={!!more} onClose={() => setMore(null)}>
        {overflow.map((it) => {
          if (it.type !== 'control') return null;
          const c = CONTROLS[it.id];
          return (
            <MenuItem
              key={it.id}
              data-testid={`tbm-${it.id}`}
              selected={c.isActive?.(editor)}
              disabled={c.isDisabled?.(editor)}
              onClick={() => {
                const anchor = more!;
                setMore(null);
                activate(it.id, anchor);
              }}
            >
              <ListItemIcon><c.icon fontSize="small" /></ListItemIcon>
              <ListItemText secondary={c.shortcut}>{c.label}</ListItemText>
            </MenuItem>
          );
        })}
      </Menu>

      <Menu anchorEl={menu?.anchor} open={menu?.id === 'blockStyle'} onClose={close}>
        {BLOCK_STYLES.map((b) => (
          <MenuItem key={b.id} selected={b.active(editor)} onClick={() => { close(); b.run(editor); }}>
            <ListItemText secondary={b.shortcut}>{b.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
      <Menu anchorEl={menu?.anchor} open={menu?.id === 'section'} onClose={close}>
        {SECTION_TYPES.map((s) => (
          <MenuItem key={s.type} onClick={() => { close(); editor.chain().focus().insertSection(s.type).run(); }} data-testid={`section-${s.type}`}>
            <ListItemIcon sx={{ color: `sections.${s.type}.main` }}><s.icon fontSize="small" /></ListItemIcon>
            <ListItemText>{s.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
      <Menu anchorEl={menu?.anchor} open={menu?.id === 'align'} onClose={close}>
        {ALIGNS.map((a) => (
          <MenuItem key={a.v} selected={editor.isActive({ textAlign: a.v })} onClick={() => { close(); editor.chain().focus().setTextAlign(a.v).run(); }} data-testid={`align-${a.v}`}>
            <ListItemIcon><a.icon fontSize="small" /></ListItemIcon>
            <ListItemText secondary={a.shortcut}>{a.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
      <Popover open={menu?.id === 'table'} anchorEl={menu?.anchor} onClose={close}>
        <TableGrid onPick={(rows, cols) => { close(); editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run(); }} />
      </Popover>
      <Popover open={menu?.id === 'textColor'} anchorEl={menu?.anchor} onClose={close}>
        <Swatches colors={TEXT_COLORS} none="Default colour" onPick={(v) => { close(); if (v) editor.chain().focus().setColor(v).run(); else editor.chain().focus().unsetColor().run(); }} />
      </Popover>
      <Popover open={menu?.id === 'highlight'} anchorEl={menu?.anchor} onClose={close}>
        <Swatches colors={HIGHLIGHT_COLORS} none="No highlight" onPick={(v) => { close(); if (v) editor.chain().focus().setHighlight({ color: v }).run(); else editor.chain().focus().unsetHighlight().run(); }} />
      </Popover>
    </Box>
  );
}
