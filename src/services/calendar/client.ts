import { authJson } from '../http.ts';
import { calendarManifest } from './manifest.ts';
import type { CalendarEvent } from './meeting.ts';

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const SCOPES = calendarManifest.scopes;

/** Read-only Calendar API client. */
export const calendarClient = {
  async list(from: Date, to: Date): Promise<CalendarEvent[]> {
    const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '50' });
    const r = await authJson<{ items?: CalendarEvent[] }>(`${API}?${q}`, { scopes: SCOPES });
    return (r.items ?? []).filter((e) => e.start && (e.start.dateTime || e.start.date));
  },
  get: (id: string) => authJson<CalendarEvent>(`${API}/${encodeURIComponent(id)}`, { scopes: SCOPES }),
};

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
