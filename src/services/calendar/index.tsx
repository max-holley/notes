import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import type { GoogleService } from '../types.ts';
import { calendarManifest } from './manifest.ts';

const calendar: GoogleService = {
  ...calendarManifest,
  icon: CalendarMonthOutlined,
  apiClient: () => ({}),
};

export default calendar;
