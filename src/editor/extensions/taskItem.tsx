import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined';
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { InputRule } from '@tiptap/core';
import TaskItem from '@tiptap/extension-task-item';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { uid } from '../../data/model.ts';
import { dueStatus, formatDue } from '../../services/tasks/dates.ts';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    taskLine: {
      /** Turn the current checklist line into a Google Task line (or back). Creates a checklist if needed. */
      toggleTaskLine: () => ReturnType;
      setTaskDue: (due: string | null) => ReturnType;
    };
  }
}

function DueChip({ due, onChange, onUnlink }: { due: string | null; onChange(d: string | null): void; onUnlink(): void }) {
  const [cal, setCal] = useState<HTMLElement | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const status = due ? dueStatus(due) : null;
  const color = status === 'overdue' ? 'error' : status === 'today' ? 'primary' : 'default';
  const set = (d: dayjs.Dayjs | null) => {
    onChange(d ? d.format('YYYY-MM-DD') : null);
    setCal(null);
    setMenu(null);
  };
  return (
    <Box contentEditable={false} sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
      <Tooltip title="Google Task">
        <TaskAltOutlined fontSize="small" color="primary" aria-label="Google Task" data-testid="task-line-icon" />
      </Tooltip>
      <Chip
        size="small"
        variant={due ? 'filled' : 'outlined'}
        color={color}
        icon={<CalendarTodayOutlined />}
        label={due ? formatDue(due) : 'Add date'}
        onClick={(e) => setCal(e.currentTarget)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(e.currentTarget);
        }}
        aria-label={due ? `Due ${formatDue(due)}. Change due date` : 'Set due date'}
        data-testid="due-chip"
        data-due={due ?? ''}
      />
      <Popover open={!!cal} anchorEl={cal} onClose={() => setCal(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <DateCalendar value={due ? dayjs(due) : null} onChange={(d) => set(d)} />
      </Popover>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => set(dayjs())}>Today</MenuItem>
        <MenuItem onClick={() => set(dayjs().add(1, 'day'))}>Tomorrow</MenuItem>
        <MenuItem onClick={() => set(dayjs().add(1, 'week'))}>Next week</MenuItem>
        <MenuItem onClick={() => { setCal(menu); setMenu(null); }}>
          <ListItemIcon><CalendarTodayOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Pick date…</ListItemText>
        </MenuItem>
        {due && (
          <MenuItem onClick={() => set(null)}>
            <ListItemIcon><EventBusyOutlined fontSize="small" /></ListItemIcon>
            <ListItemText>Clear due date</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { setMenu(null); onUnlink(); }}>
          <ListItemIcon><LinkOffOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Stop syncing with Google Tasks</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}

function TaskItemView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const checked = !!node.attrs.checked;
  const isTask = !!node.attrs.taskLine;
  return (
    <NodeViewWrapper as="div" style={{ display: 'flex', alignItems: 'flex-start' }}>
      <Box component="label" contentEditable={false} sx={{ flexShrink: 0, mt: -0.75, ml: -1 }}>
        <Checkbox
          size="small"
          checked={checked}
          disabled={!editor.isEditable}
          onChange={(e) => updateAttributes({ checked: e.target.checked })}
          slotProps={{ input: { 'aria-label': checked ? 'Mark not done' : 'Mark done' } }}
        />
      </Box>
      <NodeViewContent as="div" style={{ flex: 1, minWidth: 0, textDecoration: checked ? 'line-through' : undefined, opacity: checked ? 0.7 : 1 }} />
      {isTask && (
        <DueChip
          due={(node.attrs.due as string | null) ?? null}
          onChange={(due) => updateAttributes({ due })}
          onUnlink={() => updateAttributes({ taskLine: false, taskId: null, due: null })}
        />
      )}
    </NodeViewWrapper>
  );
}

const lineIdKey = new PluginKey('taskLineIds');

/** Checklist item with Google Tasks link attributes. */
export const NotesTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      taskLine: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-task-line') === 'true',
        renderHTML: (a) => (a.taskLine ? { 'data-task-line': 'true' } : {}),
      },
      taskId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-task-id'),
        renderHTML: (a) => (a.taskId ? { 'data-task-id': a.taskId as string } : {}),
      },
      due: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-due'),
        renderHTML: (a) => (a.due ? { 'data-due': a.due as string } : {}),
      },
      lineId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-line-id'),
        renderHTML: (a) => (a.lineId ? { 'data-line-id': a.lineId as string } : {}),
      },
    };
  },
  addNodeView() {
    // The outer <li> carries the data attributes (selectors, Tasks view scroll target).
    return ReactNodeViewRenderer(TaskItemView, {
      as: 'li',
      attrs: ({ node }) => ({
        'data-type': 'taskItem',
        'data-checked': String(!!node.attrs.checked),
        ...(node.attrs.lineId ? { 'data-line-id': node.attrs.lineId as string } : {}),
        ...(node.attrs.taskLine ? { 'data-task-line': 'true' } : {}),
      }),
    });
  },
  addCommands() {
    return {
      ...this.parent?.(),
      toggleTaskLine:
        () =>
        ({ editor, chain }) => {
          if (!editor.isActive('taskItem')) return chain().toggleTaskList().updateAttributes('taskItem', { taskLine: true }).run();
          const on = !!editor.getAttributes('taskItem').taskLine;
          return chain().updateAttributes('taskItem', on ? { taskLine: false, taskId: null, due: null } : { taskLine: true }).run();
        },
      setTaskDue:
        (due) =>
        ({ commands }) =>
          commands.updateAttributes('taskItem', { due }),
    };
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^\/task\s$/,
        handler: ({ state, range, chain }) => {
          const $from = state.doc.resolve(range.from);
          chain().deleteRange(range).run();
          if ($from.depth >= 2 && $from.node($from.depth - 1).type.name === 'taskItem') chain().updateAttributes('taskItem', { taskLine: true }).run();
          else chain().toggleTaskList().updateAttributes('taskItem', { taskLine: true }).run();
        },
      }),
    ];
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      // Every checklist line gets a stable id (survives cut/paste between notes); duplicates (copy) get a fresh id and lose the task link.
      new Plugin({
        key: lineIdKey,
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((t) => t.docChanged)) return null;
          const seen = new Set<string>();
          let tr = null as ReturnType<typeof state.tr.setNodeMarkup> | null;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'taskItem') return;
            const id = node.attrs.lineId as string | null;
            if (!id || seen.has(id)) {
              tr ??= state.tr;
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineId: uid(), taskId: id && seen.has(id) ? null : node.attrs.taskId });
            } else seen.add(id);
          });
          return tr;
        },
      }),
    ];
  },
});
