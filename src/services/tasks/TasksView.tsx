import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { connectService } from '../../app/session.ts';
import { useNotes } from '../../store/notes.ts';
import { useUi } from '../../store/ui.ts';
import { dueStatus, formatDue } from './dates.ts';
import { patchNoteLines } from './apply.ts';
import { reconcileTasks, scheduleTasksReconcile } from './engine.ts';
import { allTaskLines, type TaskLine } from './lines.ts';

/** Groups by originating note; groups ordered by their most urgent task; dated before undated within a group. */
export function groupTasks(lines: TaskLine[], noteTitle: (id: string) => string, showCompleted: boolean) {
  const shown = lines.filter((l) => showCompleted || !l.completed);
  const groups = new Map<string, TaskLine[]>();
  for (const l of shown) groups.set(l.noteId, [...(groups.get(l.noteId) ?? []), l]);
  const urgency = (l: TaskLine) => (l.completed ? '3' : l.due ? '0' + l.due : '2');
  return [...groups.entries()]
    .map(([noteId, items]) => ({ noteId, title: noteTitle(noteId), items: [...items].sort((a, b) => urgency(a).localeCompare(urgency(b))) }))
    .sort((a, b) => urgency(a.items[0]!).localeCompare(urgency(b.items[0]!)) || a.title.localeCompare(b.title));
}

function setLine(noteId: string, lineId: string, patch: { completed?: boolean; due?: string | null }) {
  patchNoteLines(noteId, new Map([[lineId, patch]]));
  scheduleTasksReconcile(300);
}

export function TasksView() {
  const notes = useNotes((s) => s.doc.notes);
  const me = useUi((s) => s.me);
  const ui = useUi();
  const [showCompleted, setShowCompleted] = useState(false);
  const [picker, setPicker] = useState<{ el: HTMLElement; line: TaskLine } | null>(null);
  const connected = !!me?.services.includes('tasks');
  const live = useMemo(() => Object.fromEntries(Object.entries(notes).filter(([, n]) => !n.trashedAt)), [notes]);
  const groups = useMemo(() => groupTasks(allTaskLines(live), (id) => live[id]?.title || 'Untitled note', showCompleted), [live, showCompleted]);

  if (!connected) {
    return (
      <Box sx={{ p: 3 }} data-testid="tasks-view">
        <Typography variant="h5" component="h2" gutterBottom>Tasks</Typography>
        <Card variant="outlined" sx={{ p: 2, bgcolor: 'm3.surfaceContainer' }}>
          <Typography gutterBottom>Google Tasks isn’t connected. Connect it to turn checklist lines into tasks with due dates.</Typography>
          <Button variant="contained" onClick={() => void connectService('tasks')} data-testid="connect-tasks-view">Connect Google Tasks</Button>
        </Card>
      </Box>
    );
  }
  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, overflowY: 'auto', height: '100%' }} data-testid="tasks-view">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" component="h2" sx={{ flex: 1 }}>Tasks</Typography>
        <Button onClick={() => setShowCompleted((v) => !v)} aria-pressed={showCompleted}>{showCompleted ? 'Hide completed' : 'Show completed'}</Button>
        <Button onClick={() => void reconcileTasks()}>Refresh</Button>
      </Stack>
      {!groups.length && (
        <Typography color="text.secondary">No tasks yet. In a note, make a checklist line a task with the Google Task button or by typing /task.</Typography>
      )}
      <Stack spacing={2}>
        {groups.map((g) => (
          <Card key={g.noteId} variant="outlined" data-testid="task-group">
            <Typography variant="subtitle1" component="h3" sx={{ px: 2, pt: 1.5 }}>{g.title}</Typography>
            <List dense>
              {g.items.map((l) => {
                const st = l.due ? dueStatus(l.due) : null;
                return (
                  <ListItem
                    key={l.lineId}
                    disablePadding
                    data-testid="task-row"
                    secondaryAction={
                      <Chip
                        size="small"
                        icon={<CalendarTodayOutlined />}
                        label={l.due ? formatDue(l.due) : 'Add date'}
                        color={l.completed ? 'default' : st === 'overdue' ? 'error' : st === 'today' ? 'primary' : 'default'}
                        variant={l.due ? 'filled' : 'outlined'}
                        onClick={(e) => setPicker({ el: e.currentTarget, line: l })}
                        aria-label={l.due ? `Due ${formatDue(l.due)}${st === 'overdue' ? ', overdue' : ''}. Change due date` : 'Set due date'}
                        data-status={st ?? 'none'}
                      />
                    }
                  >
                    <Checkbox
                      edge="start"
                      checked={l.completed}
                      onChange={(e) => setLine(l.noteId, l.lineId, { completed: e.target.checked })}
                      slotProps={{ input: { 'aria-label': `${l.completed ? 'Mark not done' : 'Mark done'}: ${l.title}` } }}
                      sx={{ ml: 1 }}
                    />
                    <ListItemButton
                      onClick={() => {
                        ui.set({ view: 'notes' });
                        ui.openNote(l.noteId, l.lineId);
                      }}
                      sx={{ borderRadius: 2, pr: 16 }}
                    >
                      <ListItemText primary={l.title || 'Untitled task'} slotProps={{ primary: { sx: { textDecoration: l.completed ? 'line-through' : undefined } } }} />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Card>
        ))}
      </Stack>
      <Popover open={!!picker} anchorEl={picker?.el} onClose={() => setPicker(null)}>
        <DateCalendar
          value={picker?.line.due ? dayjs(picker.line.due) : null}
          onChange={(d) => {
            if (picker) setLine(picker.line.noteId, picker.line.lineId, { due: d ? d.format('YYYY-MM-DD') : null });
            setPicker(null);
          }}
        />
        {picker?.line.due && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Button onClick={() => { setLine(picker.line.noteId, picker.line.lineId, { due: null }); setPicker(null); }}>Clear due date</Button>
          </Box>
        )}
      </Popover>
    </Box>
  );
}

export function TasksSettings() {
  const name = useNotes((s) => s.doc.prefs.tasksListName);
  const setPrefs = useNotes((s) => s.setPrefs);
  const [v, setV] = useState(name);
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <TextField size="small" label="Task list name" placeholder="Default: app name" value={v} onChange={(e) => setV(e.target.value)} />
      <Button
        disabled={v === name}
        onClick={() => {
          setPrefs({ tasksListName: v.trim() });
          useNotes.getState().setTaskListId(null);
          void reconcileTasks();
        }}
      >
        Save
      </Button>
    </Stack>
  );
}
