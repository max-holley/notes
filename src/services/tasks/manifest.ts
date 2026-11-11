import type { ServiceManifest } from '../types.manifest.ts';

export const tasksManifest: ServiceManifest = {
  id: 'tasks',
  label: 'Google Tasks',
  description: 'Turn checklist lines into Google Tasks with due dates, synced both ways.',
  scopes: ['https://www.googleapis.com/auth/tasks'],
  apiOrigins: ['https://tasks.googleapis.com'],
};
