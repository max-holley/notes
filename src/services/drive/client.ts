import { brand } from '../../brand/brand.config.ts';
import type { NotesDoc } from '../../data/model.ts';
import { HttpError } from '../../lib/api.ts';
import { normalizeDoc } from '../../sync/merge.ts';
import { ConflictError, TransientError, type Transport } from '../../sync/engine.ts';
import { authFetch, authJson } from '../http.ts';
import { driveManifest } from './manifest.ts';

const SCOPES = driveManifest.scopes;
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
/** appProperties key used to find our files even if the user renames them. */
const PROP = 'notesApp';
export const DATA_FILE_NAME = 'notes-file.json';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,mimeType,modifiedTime,headRevisionId,appProperties,parents,trashed,webViewLink';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  headRevisionId?: string;
  appProperties?: Record<string, string>;
  webViewLink?: string;
}

const ids: { root?: string; images?: string; data?: string } = {};
export function resetDriveCache() {
  delete ids.root;
  delete ids.images;
  delete ids.data;
}

async function findByProp(value: string): Promise<DriveFile | null> {
  const q = `appProperties has { key='${PROP}' and value='${value}' } and trashed = false`;
  const res = await authJson<{ files: DriveFile[] }>(`${API}/files?q=${encodeURIComponent(q)}&fields=files(${FIELDS})&spaces=drive`, { scopes: SCOPES });
  return res.files[0] ?? null;
}

async function createFolder(name: string, value: string, parent?: string): Promise<string> {
  const f = await authJson<DriveFile>(`${API}/files?fields=${FIELDS}`, {
    scopes: SCOPES,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, appProperties: { [PROP]: value }, parents: parent ? [parent] : undefined }),
  });
  return f.id;
}

async function rootFolder(): Promise<string> {
  if (ids.root) return ids.root;
  ids.root = (await findByProp('root'))?.id ?? (await createFolder(brand.appName, 'root'));
  return ids.root;
}

async function imagesFolder(): Promise<string> {
  if (ids.images) return ids.images;
  ids.images = (await findByProp('images'))?.id ?? (await createFolder('images', 'images', await rootFolder()));
  return ids.images;
}

function multipart(meta: object, body: string, type: string) {
  const boundary = 'notes' + Math.random().toString(36).slice(2);
  const payload = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n${body}\r\n--${boundary}--`;
  return { body: payload, contentType: `multipart/related; boundary=${boundary}` };
}

/** Drive transport for the sync engine: Notes/notes-file.json. */
export const driveTransport: Transport = {
  async pull() {
    // Only a 404 or a trashed file means "no data file". Anything else (rate limit, 5xx, network) must not
    // be mistaken for an empty Drive, or a second notes-file.json would be created.
    const f = ids.data
      ? await authJson<DriveFile>(`${API}/files/${ids.data}?fields=${FIELDS}`, { scopes: SCOPES }).catch((e: unknown) => {
          if (e instanceof HttpError && e.status === 404) return null;
          throw e instanceof HttpError && e.status !== 403 ? e : new TransientError(String(e));
        })
      : await findByProp('data');
    if (!f || (f as DriveFile & { trashed?: boolean }).trashed) {
      delete ids.data;
      return { doc: null, rev: null };
    }
    ids.data = f.id;
    const res = await authFetch(`${API}/files/${f.id}?alt=media`, { scopes: SCOPES });
    if (!res.ok) throw new HttpError(res.status, await res.text());
    const text = await res.text();
    return { doc: text ? normalizeDoc(JSON.parse(text) as Partial<NotesDoc>) : null, rev: f.headRevisionId ?? f.modifiedTime };
  },
  async push(doc, baseRev) {
    const json = JSON.stringify(doc);
    let f: DriveFile;
    if (ids.data) {
      // Read-merge-write guard: if another device wrote since our pull, re-run the merge instead of overwriting.
      const head = await authJson<DriveFile>(`${API}/files/${ids.data}?fields=${FIELDS}`, { scopes: SCOPES });
      if (baseRev && (head.headRevisionId ?? head.modifiedTime) !== baseRev) throw new ConflictError('Drive file changed since pull');
      f = await authJson<DriveFile>(`${UPLOAD}/files/${ids.data}?uploadType=media&fields=${FIELDS}`, {
        scopes: SCOPES,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: json,
      });
    } else {
      const m = multipart({ name: DATA_FILE_NAME, mimeType: 'application/json', parents: [await rootFolder()], appProperties: { [PROP]: 'data' } }, json, 'application/json');
      f = await authJson<DriveFile>(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
        scopes: SCOPES,
        method: 'POST',
        headers: { 'Content-Type': m.contentType },
        body: m.body,
      });
      ids.data = f.id;
    }
    return { rev: f.headRevisionId ?? f.modifiedTime };
  },
};

/** Upload an image as its own Drive file in Notes/images. Returns the Drive file id. */
export async function uploadImage(blob: Blob, name: string): Promise<string> {
  const meta = await authJson<DriveFile>(`${API}/files?fields=${FIELDS}`, {
    scopes: SCOPES,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: blob.type, parents: [await imagesFolder()], appProperties: { [PROP]: 'image' } }),
  });
  await authJson<DriveFile>(`${UPLOAD}/files/${meta.id}?uploadType=media&fields=id`, {
    scopes: SCOPES,
    method: 'PATCH',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
  return meta.id;
}

const blobUrls = new Map<string, Promise<string>>();
/** Authenticated blob URL for an image (cached for the session). */
export function imageUrl(fileId: string): Promise<string> {
  let p = blobUrls.get(fileId);
  if (!p) {
    p = authFetch(`${API}/files/${fileId}?alt=media`, { scopes: SCOPES }).then(async (r) => {
      if (!r.ok) throw new HttpError(r.status, 'image');
      return URL.createObjectURL(await r.blob());
    });
    p.catch(() => blobUrls.delete(fileId));
    blobUrls.set(fileId, p);
  }
  return p;
}

/** Trash image files no longer referenced by any note (including Recently deleted). */
export async function collectImageGarbage(doc: NotesDoc, minAgeMs = 24 * 3600 * 1000): Promise<number> {
  const used = new Set<string>();
  for (const n of Object.values(doc.notes)) for (const m of n.body.matchAll(/data-drive-id="([^"]+)"/g)) used.add(m[1]!);
  const q = `appProperties has { key='${PROP}' and value='image' } and trashed = false`;
  const all: DriveFile[] = [];
  let page: string | undefined;
  do {
    const res = await authJson<{ files: DriveFile[]; nextPageToken?: string }>(
      `${API}/files?q=${encodeURIComponent(q)}&pageSize=1000&fields=nextPageToken,files(${FIELDS})${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`,
      { scopes: SCOPES },
    );
    all.push(...res.files);
    page = res.nextPageToken;
  } while (page);
  let n = 0;
  for (const f of all) {
    if (!used.has(f.id) && Date.now() - Date.parse(f.modifiedTime) > minAgeMs) {
      await authJson(`${API}/files/${f.id}`, { scopes: SCOPES, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      n++;
    }
  }
  return n;
}

/** Convert HTML to a Google Doc in the Notes folder (drive.file upload-convert). */
export async function createGoogleDoc(title: string, html: string): Promise<{ id: string; webViewLink: string }> {
  const m = multipart(
    { name: title || 'Untitled note', mimeType: 'application/vnd.google-apps.document', parents: [await rootFolder()] },
    `<!doctype html><html><head><meta charset="utf-8"><title></title></head><body>${html}</body></html>`,
    'text/html',
  );
  const f = await authJson<DriveFile>(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
    scopes: SCOPES,
    method: 'POST',
    headers: { 'Content-Type': m.contentType },
    body: m.body,
  });
  return { id: f.id, webViewLink: f.webViewLink ?? `https://docs.google.com/document/d/${f.id}/edit` };
}

/** Move the whole Notes folder to Drive trash (used by "Disconnect & delete data"). */
export async function trashNotesFolder(): Promise<void> {
  const root = ids.root ?? (await findByProp('root'))?.id;
  if (!root) return;
  await authJson(`${API}/files/${root}`, { scopes: SCOPES, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  resetDriveCache();
}
