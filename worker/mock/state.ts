/**
 * In-memory state of the fake Google used when MOCK_GOOGLE=1. Lives in the Worker isolate;
 * reset with POST /__mock/control/reset. Never used with real credentials.
 */
export interface MockUser { sub: string; email: string; name: string; consented: Set<string> }
export interface MockCode { sub: string; scopes: string[]; challenge: string; redirectUri: string; issueRefresh: boolean }
export interface MockFile {
  id: string; owner: string; name: string; mimeType: string; parents: string[];
  appProperties: Record<string, string>; trashed: boolean; modifiedTime: string; headRevisionId: string;
  content: Uint8Array; contentType: string;
}
export interface MockTask {
  id: string; title: string; notes?: string; status: 'needsAction' | 'completed'; due?: string;
  completed?: string; updated: string; deleted?: boolean; position: string;
}
export interface MockTaskList { id: string; title: string; updated: string; tasks: Map<string, MockTask> }
export interface MockEvent {
  id: string; summary: string; start: { dateTime: string }; end: { dateTime: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  hangoutLink?: string; htmlLink: string; description?: string; updated: string;
}

export const mock = {
  users: new Map<string, MockUser>(),
  codes: new Map<string, MockCode>(),
  refreshTokens: new Map<string, { sub: string; scopes: string[]; revoked: boolean }>(),
  accessTokens: new Map<string, { sub: string; scopes: string[]; exp: number }>(),
  files: new Map<string, MockFile>(),
  taskLists: new Map<string, Map<string, MockTaskList>>(),
  extraEvents: new Map<string, MockEvent[]>(),
  /** Simulate network failure for googleapis (offline tests). */
  apiDown: false,
  counter: 0,
};

export function resetMock() {
  mock.users.clear(); mock.codes.clear(); mock.refreshTokens.clear(); mock.accessTokens.clear();
  mock.files.clear(); mock.taskLists.clear(); mock.extraEvents.clear(); mock.apiDown = false;
}

export const mockId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(mock.counter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const subFor = (email: string) => 'mock-' + email.toLowerCase().replace(/[^a-z0-9]/g, '-');
