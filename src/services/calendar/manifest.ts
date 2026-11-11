import type { ServiceManifest } from '../types.manifest.ts';

export const calendarManifest: ServiceManifest = {
  id: 'calendar',
  label: 'Google Calendar',
  description: "See today's events and start meeting notes from them (read-only).",
  scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
  apiOrigins: ['https://www.googleapis.com'],
};
