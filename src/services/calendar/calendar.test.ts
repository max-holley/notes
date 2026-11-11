import { describe, expect, it } from 'vitest';
import { conferenceLink, meetingDetailsHtml, meetingNoteHtml, replaceMeetingDetails, type CalendarEvent } from './meeting.ts';

const ev: CalendarEvent = {
  id: 'e1',
  summary: 'Planning <sync>',
  start: { dateTime: '2026-03-02T10:00:00Z' },
  end: { dateTime: '2026-03-02T10:30:00Z' },
  attendees: [{ email: 'sam@example.com', displayName: 'Sam' }, { email: 'room@example.com', resource: true }, { email: 'kim@example.com' }],
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
};

describe('calendar → meeting note template', () => {
  it('fills details and the Agenda / Actions / Decisions sections', () => {
    const html = meetingNoteHtml(ev, 'en-GB');
    const d = new DOMParser().parseFromString(html, 'text/html');
    const details = d.querySelector('[data-role="meeting-details"]')!;
    expect(details.getAttribute('data-section')).toBe('info');
    expect(details.textContent).toContain('Sam, kim@example.com');
    expect(details.textContent).not.toContain('room@example.com');
    expect(details.querySelector('a')!.getAttribute('href')).toBe('https://meet.google.com/abc-defg-hij');
    expect([...d.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Agenda', 'Actions', 'Decisions']);
    const action = d.querySelector('ul[data-type="taskList"] li')!;
    expect(action.getAttribute('data-task-line')).toBe('true');
    expect(action.getAttribute('data-line-id')).toBeTruthy();
  });

  it('escapes event text and rejects non-https conference links', () => {
    expect(meetingDetailsHtml({ ...ev, attendees: [{ email: '<b>x</b>' }] })).toContain('&lt;b&gt;');
    expect(meetingDetailsHtml({ ...ev, hangoutLink: 'javascript:alert(1)' })).not.toContain('javascript:');
    expect(conferenceLink({ ...ev, hangoutLink: undefined, conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://zoom.example/1' }] } })).toBe('https://zoom.example/1');
  });

  it('refresh replaces only the details block', () => {
    const body = meetingNoteHtml(ev) + '<p>my notes</p>';
    const updated = replaceMeetingDetails(body, { ...ev, attendees: [{ email: 'new@example.com', displayName: 'New Person' }] });
    expect(updated).toContain('New Person');
    expect(updated).not.toContain('Sam');
    expect(updated).toContain('my notes');
    expect(replaceMeetingDetails('<p>x</p>', ev)).toMatch(/^<div data-section="info" data-role="meeting-details">/);
  });
});
