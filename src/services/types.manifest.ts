/** Pure-data description of a Google service. Safe to import from the Worker (no React). */
export interface ServiceManifest {
  /** Stable id; also the folder name under src/services/. */
  id: string;
  label: string;
  description: string;
  /** OAuth scopes this service needs. The backend only ever grants scopes listed in the registry. */
  scopes: string[];
  /** API origins the browser calls directly (feeds CSP connect-src). */
  apiOrigins: string[];
  /** Required services cannot be disconnected; the app needs them to work. */
  required?: boolean;
}
