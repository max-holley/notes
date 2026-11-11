/**
 * THE service registry. Adding a Google service = create `src/services/<id>/` (manifest.ts + index.tsx)
 * and add its manifest to `serviceManifests` below. Everything else (sign-in scopes, backend
 * scope allow-list, CSP connect-src, nav, settings, onboarding) is derived from this list.
 * See docs/ADDING_A_GOOGLE_SERVICE.md.
 */
import type { ServiceManifest } from './types.manifest.ts';
import { driveManifest } from './drive/manifest.ts';
import { tasksManifest } from './tasks/manifest.ts';
import { calendarManifest } from './calendar/manifest.ts';

export const serviceManifests: readonly ServiceManifest[] = [driveManifest, tasksManifest, calendarManifest];

/** Identity scopes always requested at sign-in. */
export const IDENTITY_SCOPES = ['openid', 'email', 'profile'] as const;

/** Every scope the app may request (identity + all services). Used as the backend allow-list. */
export function allowedScopes(list: readonly ServiceManifest[] = serviceManifests): string[] {
  return [...new Set([...IDENTITY_SCOPES, ...list.flatMap((s) => s.scopes)])];
}

/** Scopes requested at sign-in: all services (user may untick optional ones on the consent screen). */
export const signInScopes = allowedScopes;

/** Ids of services whose scopes are all present in `granted`. */
export function grantedServiceIds(granted: readonly string[], list: readonly ServiceManifest[] = serviceManifests): string[] {
  const set = new Set(granted);
  return list.filter((s) => s.scopes.every((sc) => set.has(sc))).map((s) => s.id);
}

/** Filter requested scopes down to those in the registry (defence in depth on the backend). */
export function filterAllowedScopes(requested: readonly string[], list: readonly ServiceManifest[] = serviceManifests): string[] {
  const allowed = new Set(allowedScopes(list));
  return requested.filter((s) => allowed.has(s));
}

/** Network destinations for CSP connect-src. */
export function connectSrc(list: readonly ServiceManifest[] = serviceManifests): string[] {
  return ["'self'", ...new Set(list.flatMap((s) => s.apiOrigins))];
}

/** Full Content-Security-Policy for the app shell. */
export function buildCsp(list: readonly ServiceManifest[] = serviceManifests): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self' data:",
    `connect-src ${connectSrc(list).join(' ')}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
  ].join('; ');
}
