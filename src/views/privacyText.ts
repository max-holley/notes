import { brand } from '../brand/brand.config.ts';

/** Exactly what the backend (D1) stores. Must match migrations/0001_init.sql. */
export const BACKEND_STORES =
  'Only what is needed to sign you in: your Google account id, email, name and profile picture URL; an encrypted Google refresh token and the list of granted permissions; and one record per signed-in device (a hash of the session id, a coarse label like "Chrome on Windows", and created/last-seen/expiry times). Notes, tasks, calendar data and images never pass through or are stored on our server.';

export const PRIVACY_SECTIONS: { id: string; title: string; body: string[] }[] = [
  {
    id: 'summary',
    title: 'Summary',
    body: [
      `${brand.appName} stores your notes in a folder in your own Google Drive. Your browser talks to Google directly. There are no ads, no analytics and no tracking.`,
    ],
  },
  {
    id: 'server',
    title: 'What our server stores',
    body: [
      BACKEND_STORES,
      'Tables: users (id, Google account id, email, name, picture URL, created, last seen); grants (granted scopes, refresh token encrypted with AES-GCM, IV, updated time, revoked flag); sessions (SHA-256 hash of the session id, created, last seen, expiry, device label). Nothing else about you is stored.',
      'Short-lived Google access tokens are minted on request and cached only in server memory until shortly before they expire. They are never written to the database or logs.',
    ],
  },
  {
    id: 'google',
    title: 'Google permissions',
    body: [
      'Google Drive (drive.file): only files this app creates — the Notes folder, notes-file.json, images and Google Docs you send.',
      'Google Tasks (tasks): create and update tasks for checklist lines you mark as tasks, in a dedicated list.',
      'Google Calendar (calendar.events.readonly): read your events to show today’s agenda and create meeting notes. Never writes.',
      'You can untick Tasks or Calendar on the Google consent screen; the rest of the app keeps working.',
    ],
  },
  {
    id: 'device',
    title: 'What stays on your device',
    body: [
      'While you are signed in, the browser keeps a temporary copy of your notes and a queue of edits that have not reached Drive yet (IndexedDB). Both are deleted when Drive confirms, and everything is wiped when you sign out.',
      'localStorage holds only your theme, accent and font choices (so the page does not flash) and a "signed in before" hint.',
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: ['One session cookie (HttpOnly, Secure, SameSite=Lax) keeps you signed in for up to 60 days of inactivity, plus a short-lived cookie during Google sign-in.'],
  },
  {
    id: 'delete',
    title: 'Deleting your data',
    body: [
      'Settings → Disconnect & delete data revokes our access at Google, deletes every server record about you, optionally moves the Notes folder to your Drive trash, and wipes local data.',
      'You can also revoke access any time at myaccount.google.com/permissions.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    body: [brand.contactUrl ? `Questions or issues: ${brand.contactUrl}` : 'Contact the operator of this site.'],
  },
];
