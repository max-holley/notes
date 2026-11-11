import CloudOutlined from '@mui/icons-material/CloudOutlined';
import type { GoogleService } from '../types.ts';
import { collectImageGarbage, createGoogleDoc, driveTransport, imageUrl, trashNotesFolder, uploadImage } from './client.ts';
import { driveManifest } from './manifest.ts';

const api = { transport: driveTransport, uploadImage, imageUrl, createGoogleDoc, collectImageGarbage, trashNotesFolder };

const drive: GoogleService<typeof api> = {
  ...driveManifest,
  icon: CloudOutlined,
  apiClient: () => api,
  onboarding: 'Your notes are saved to a Notes folder in your Google Drive.',
};

export default drive;
