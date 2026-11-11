import { uid } from '../../data/model.ts';

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string; self?: boolean; resource?: boolean }[];
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
  htmlLink?: string;
  location?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function eventWhen(e: CalendarEvent, locale?: string): string {
  if (e.start.date) return new Date(e.start.date + 'T00:00:00').toLocaleDateString(locale, { dateStyle: 'full' }) + ' (all day)';
  const s = new Date(e.start.dateTime!);
  const end = e.end.dateTime ? new Date(e.end.dateTime) : null;
  const day = s.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${t(s)}${end ? `–${t(end)}` : ''}`;
}

export function conferenceLink(e: CalendarEvent): string | null {
  return e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ?? null;
}

/** The "details" block at the top of a meeting note (replaced by Refresh details). */
export function meetingDetailsHtml(e: CalendarEvent, locale?: string): string {
  const people = (e.attendees ?? []).filter((a) => !a.resource).map((a) => esc(a.displayName ?? a.email));
  const link = conferenceLink(e);
  const parts = [
    `<p><strong>When:</strong> ${esc(eventWhen(e, locale))}</p>`,
    people.length ? `<p><strong>Attendees:</strong> ${people.join(', ')}</p>` : '',
    link && /^https:\/\//.test(link) ? `<p><strong>Join:</strong> <a href="${esc(link)}">${esc(link)}</a></p>` : '',
    e.location ? `<p><strong>Where:</strong> ${esc(e.location)}</p>` : '',
  ];
  return `<div data-section="info" data-role="meeting-details">${parts.join('')}</div>`;
}

/** Meeting-note template: details, Agenda, Actions (as Google Task lines), Decisions. */
export function meetingNoteHtml(e: CalendarEvent, locale?: string): string {
  return [
    meetingDetailsHtml(e, locale),
    '<h2>Agenda</h2><ul><li><p></p></li></ul>',
    `<h2>Actions</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false" data-task-line="true" data-line-id="${uid()}"><p></p></li></ul>`,
    '<h2>Decisions</h2><ul><li><p></p></li></ul>',
  ].join('');
}

/** Replace the details block in an existing note body (or prepend it if the user removed it). */
export function replaceMeetingDetails(body: string, e: CalendarEvent, locale?: string): string {
  const d = new DOMParser().parseFromString(`<body>${body}</body>`, 'text/html');
  const fresh = new DOMParser().parseFromString(`<body>${meetingDetailsHtml(e, locale)}</body>`, 'text/html').body.firstElementChild!;
  const old = d.querySelector('[data-role="meeting-details"]');
  if (old) old.replaceWith(fresh);
  else d.body.prepend(fresh);
  return d.body.innerHTML;
}
