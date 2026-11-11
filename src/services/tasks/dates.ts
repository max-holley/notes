/** Due-date helpers. Dates are calendar days (YYYY-MM-DD); Google Tasks stores them as RFC 3339 midnight UTC. */
export const todayYmd = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function dueStatus(due: string, now = new Date()): 'overdue' | 'today' | 'upcoming' {
  const t = todayYmd(now);
  return due < t ? 'overdue' : due === t ? 'today' : 'upcoming';
}

export function formatDue(due: string, now = new Date()): string {
  const s = dueStatus(due, now);
  if (s === 'today') return 'Today';
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (due === todayYmd(tomorrow)) return 'Tomorrow';
  const [y, m, d] = due.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(y !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

/** YYYY-MM-DD → Google Tasks `due` (RFC 3339, time portion ignored by Google). */
export const toGoogleDue = (due: string | null) => (due ? `${due}T00:00:00.000Z` : null);
export const fromGoogleDue = (due: string | null | undefined) => (due ? due.slice(0, 10) : null);
