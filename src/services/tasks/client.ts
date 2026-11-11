import { authJson } from '../http.ts';
import { toGoogleDue } from './dates.ts';
import { tasksManifest } from './manifest.ts';
import type { RemoteTask } from './reconcile.ts';

const API = 'https://tasks.googleapis.com/tasks/v1';
const SCOPES = tasksManifest.scopes;
const json = { 'Content-Type': 'application/json' };

export interface TaskList {
  id: string;
  title: string;
}

export const tasksClient = {
  async lists(): Promise<TaskList[]> {
    return (await authJson<{ items?: TaskList[] }>(`${API}/users/@me/lists?maxResults=100`, { scopes: SCOPES })).items ?? [];
  },
  createList: (title: string) => authJson<TaskList>(`${API}/users/@me/lists`, { scopes: SCOPES, method: 'POST', headers: json, body: JSON.stringify({ title }) }),
  async tasks(listId: string): Promise<RemoteTask[]> {
    const out: RemoteTask[] = [];
    let page: string | undefined;
    do {
      const r = await authJson<{ items?: RemoteTask[]; nextPageToken?: string }>(
        `${API}/lists/${encodeURIComponent(listId)}/tasks?showCompleted=true&showHidden=true&maxResults=100${page ? `&pageToken=${page}` : ''}`,
        { scopes: SCOPES },
      );
      out.push(...(r.items ?? []));
      page = r.nextPageToken;
    } while (page);
    return out;
  },
  insert: (listId: string, t: { title: string; completed: boolean; due: string | null; notes: string }) =>
    authJson<RemoteTask>(`${API}/lists/${encodeURIComponent(listId)}/tasks`, {
      scopes: SCOPES,
      method: 'POST',
      headers: json,
      body: JSON.stringify({ title: t.title, notes: t.notes, status: t.completed ? 'completed' : 'needsAction', due: toGoogleDue(t.due) ?? undefined }),
    }),
  patch: (listId: string, id: string, t: { title: string; completed: boolean; due: string | null }) =>
    authJson<RemoteTask>(`${API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`, {
      scopes: SCOPES,
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ title: t.title, status: t.completed ? 'completed' : 'needsAction', due: toGoogleDue(t.due), ...(t.completed ? {} : { completed: null }) }),
    }),
  remove: (listId: string, id: string) =>
    authJson<void>(`${API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`, { scopes: SCOPES, method: 'DELETE' }),
};
