import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { connectService } from '../../app/session.ts';
import { openEditors } from '../../editor/openEditors.ts';
import { sanitizeHtml } from '../../lib/sanitize.ts';
import { useNotes } from '../../store/notes.ts';
import { toast, useUi } from '../../store/ui.ts';
import type { GoogleService } from '../types.ts';
import { addDays, calendarClient, startOfDay } from './client.ts';
import { calendarManifest } from './manifest.ts';
import { meetingNoteHtml, replaceMeetingDetails, type CalendarEvent } from './meeting.ts';

const connected = () => !!useUi.getState().me?.services.includes('calendar');
const timeOf = (e: CalendarEvent) => (e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'All day');

export function createMeetingNote(e: CalendarEvent) {
  const existing = Object.values(useNotes.getState().doc.notes).find((n) => n.eventId === e.id && !n.trashedAt);
  const ui = useUi.getState();
  if (existing) {
    ui.set({ view: 'notes', dialog: null, drawerOpen: false });
    ui.openNote(existing.id);
    toast('Opened the existing meeting note');
    return existing.id;
  }
  const id = useNotes.getState().createNote({ title: e.summary ?? 'Meeting', body: sanitizeHtml(meetingNoteHtml(e)), eventId: e.id });
  ui.set({ view: 'notes', dialog: null, drawerOpen: false, filterCategory: null, filterTags: [], search: '' });
  ui.openNote(id);
  return id;
}

export async function refreshMeetingDetails(noteId: string) {
  const n = useNotes.getState().doc.notes[noteId];
  if (!n?.eventId) return;
  try {
    const e = await calendarClient.get(n.eventId);
    const ed = openEditors.get(noteId);
    if (ed && !ed.isDestroyed) ed.commands.setContent(sanitizeHtml(replaceMeetingDetails(ed.getHTML(), e)), { emitUpdate: true });
    else useNotes.getState().updateNote(noteId, { body: sanitizeHtml(replaceMeetingDetails(n.body, e)) });
    toast('Meeting details refreshed');
  } catch {
    toast('Could not load the event');
  }
}

function useEvents(from: Date, to: Date, enabled: boolean) {
  const [state, setState] = useState<{ events: CalendarEvent[] | null; error: boolean }>({ events: null, error: false });
  const key = `${from.toISOString()}|${to.toISOString()}`;
  const load = useCallback(() => {
    if (!enabled) return;
    setState({ events: null, error: false });
    calendarClient.list(from, to).then(
      (events) => setState({ events, error: false }),
      () => setState({ events: [], error: true }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

function EventList({ events, dense }: { events: CalendarEvent[]; dense?: boolean }) {
  return (
    <List dense={dense} disablePadding>
      {events.map((e) => (
        <ListItem
          key={e.id}
          disablePadding
          data-testid="calendar-event"
          secondaryAction={
            <Tooltip title="Create meeting note">
              <IconButton edge="end" size="small" aria-label={`Create meeting note for ${e.summary ?? 'event'}`} onClick={() => createMeetingNote(e)}>
                <EventNoteOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          }
        >
          <ListItemButton onClick={() => createMeetingNote(e)} sx={{ borderRadius: 2, pr: 6 }}>
            <ListItemText primary={e.summary ?? '(No title)'} secondary={timeOf(e)} slotProps={{ primary: { noWrap: true, variant: 'body2' } }} />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}

function TodayPanel() {
  const isConnected = useUi((s) => !!s.me?.services.includes('calendar'));
  const set = useUi((s) => s.set);
  const [today] = useState(() => startOfDay(new Date()));
  const { events, error, reload } = useEvents(today, addDays(today, 1), isConnected);
  if (!isConnected) {
    return (
      <Box sx={{ px: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Connect Google Calendar to see today’s events.</Typography>
        <Button size="small" variant="outlined" onClick={() => void connectService('calendar')} data-testid="connect-calendar-panel">Connect</Button>
      </Box>
    );
  }
  return (
    <Box data-testid="today-panel">
      {!events && [0, 1].map((i) => <Skeleton key={i} height={40} sx={{ mx: 1 }} />)}
      {error && <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>Couldn’t load events. <Button size="small" onClick={reload}>Retry</Button></Typography>}
      {events && !error && !events.length && <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>No events today.</Typography>}
      {events && <EventList events={events} dense />}
      <Button size="small" startIcon={<CalendarMonthOutlined />} onClick={() => set({ dialog: 'meetingNote' })} sx={{ mt: 0.5 }} data-testid="new-meeting-note">
        New meeting note…
      </Button>
    </Box>
  );
}

function MeetingNoteDialog() {
  const open = useUi((s) => s.dialog === 'meetingNote');
  const set = useUi((s) => s.set);
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const { events } = useEvents(day, addDays(day, 1), open && connected());
  const [week] = useState(() => startOfDay(new Date()));
  const upcoming = useEvents(addDays(week, 1), addDays(week, 8), open && connected());
  return (
    <Dialog open={open} onClose={() => set({ dialog: null })} fullWidth maxWidth="md" aria-labelledby="meeting-title">
      <DialogTitle id="meeting-title">New meeting note</DialogTitle>
      <DialogContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <DateCalendar value={dayjs(day)} onChange={(d) => d && setDay(startOfDay(d.toDate()))} />
        <Box sx={{ flex: 1, minWidth: 260 }}>
          <ListSubheader component="h3" disableSticky sx={{ bgcolor: 'transparent', px: 0 }}>{day.toLocaleDateString(undefined, { dateStyle: 'full' })}</ListSubheader>
          {!events && <Skeleton height={40} />}
          {events && !events.length && <Typography variant="body2" color="text.secondary">No events.</Typography>}
          {events && <EventList events={events} />}
          <ListSubheader component="h3" disableSticky sx={{ bgcolor: 'transparent', px: 0, mt: 2 }}>Next 7 days</ListSubheader>
          {upcoming.events?.map((e) => (
            <ListItemButton key={e.id} onClick={() => createMeetingNote(e)} sx={{ borderRadius: 2 }} data-testid="upcoming-event">
              <ListItemText primary={e.summary ?? '(No title)'} secondary={`${new Date(e.start.dateTime ?? e.start.date!).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${timeOf(e)}`} />
            </ListItemButton>
          ))}
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={() => set({ dialog: null })}>Cancel</Button></DialogActions>
    </Dialog>
  );
}

function NoteMenuItems({ noteId, close }: { noteId: string; close(): void }) {
  const eventId = useNotes((s) => s.doc.notes[noteId]?.eventId);
  if (!eventId) return null;
  return (
    <>
      <MenuItem
        onClick={() => {
          close();
          const win = window.open('', '_blank');
          calendarClient.get(eventId).then(
            (e) => (win ? (win.location.href = e.htmlLink ?? 'https://calendar.google.com') : undefined),
            () => {
              win?.close();
              toast('Could not load the event');
            },
          );
        }}
      >
        <ListItemIcon><OpenInNewOutlined /></ListItemIcon>
        <ListItemText>Open event</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => { close(); void refreshMeetingDetails(noteId); }} data-testid="refresh-details">
        <ListItemIcon><RefreshOutlined /></ListItemIcon>
        <ListItemText>Refresh details</ListItemText>
      </MenuItem>
    </>
  );
}

const calendar: GoogleService<typeof calendarClient> = {
  ...calendarManifest,
  icon: CalendarMonthOutlined,
  apiClient: () => calendarClient,
  sidebarPanels: [{ id: 'today', label: 'Today', component: TodayPanel }],
  dialogs: MeetingNoteDialog,
  noteMenuItems: NoteMenuItems,
  onboarding: 'Start meeting notes from your calendar with attendees and links filled in.',
};

export default calendar;
