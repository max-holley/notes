import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import type { GoogleService } from '../types.ts';
import { tasksClient } from './client.ts';
import { reconcileTasks, scheduleTasksReconcile } from './engine.ts';
import { tasksManifest } from './manifest.ts';
import { TasksSettings, TasksView } from './TasksView.tsx';

const tasks: GoogleService<typeof tasksClient> = {
  ...tasksManifest,
  icon: TaskAltOutlined,
  apiClient: () => tasksClient,
  navDestinations: [{ id: 'tasks', label: 'Tasks', icon: TaskAltOutlined, component: TasksView }],
  settingsPanel: TasksSettings,
  syncHooks: {
    onStart: () => void reconcileTasks(),
    onFocus: () => void reconcileTasks(),
    onInterval: () => void reconcileTasks(),
  },
  onNoteChange: () => scheduleTasksReconcile(),
  onboarding: 'Checklist lines can become Google Tasks with due dates, synced both ways.',
};

export default tasks;
