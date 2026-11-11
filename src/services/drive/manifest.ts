import type { ServiceManifest } from '../types.manifest.ts';

export const driveManifest: ServiceManifest = {
  id: 'drive',
  label: 'Google Drive',
  description: 'Stores your notes and images in a folder in your own Drive.',
  scopes: ['https://www.googleapis.com/auth/drive.file'],
  apiOrigins: ['https://www.googleapis.com'],
  required: true,
};
