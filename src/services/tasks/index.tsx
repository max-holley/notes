import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import type { GoogleService } from '../types.ts';
import { tasksManifest } from './manifest.ts';

const tasks: GoogleService = {
  ...tasksManifest,
  icon: TaskAltOutlined,
  apiClient: () => ({}),
};

export default tasks;
