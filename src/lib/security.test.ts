import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitizeHtml } from './sanitize.ts';
import { authFetch, clearTokens, configureGoogle, getToken, ScopeNotGrantedError } from '../services/http.ts';
import { ReconnectRequiredError, TransientError } from '../sync/engine.ts';

describe('sanitizer', () => {
  it.each([
    ['<img src=x onerror=alert(1)>', /onerror/],
    ['<script>alert(1)</script>', /script/],
    ['<a href="javascript:alert(1)">x</a>', /javascript:/],
    ['<a href="data:text/html,<script>">x</a>', /data:text/],
    ['<iframe src="https://evil"></iframe>', /iframe/],
    ['<svg><script>1</script></svg>', /svg|script/],
    ['<form action="https://evil"><input></form>', /form/],
    ['<p style="background:url(javascript:alert(1))">x</p>', /javascript/],
    ['<img src="https://ok.example/a.png" srcset="javascript:1">', /srcset/],
  ])('neutralises %s', (input, bad) => {
    expect(sanitizeHtml(input)).not.toMatch(bad);
  });
  it('keeps the editor’s own markup', () => {
    const html = '<div data-section="info" data-role="meeting-details"><p>x</p></div><ul data-type="taskList"><li data-type="taskItem" data-checked="true" data-task-id="t" data-line-id="l" data-due="2026-01-01"><p>y</p></li></ul><img data-drive-id="f1" alt="a"><mark data-color="#fdd663" style="background-color: #fdd663">h</mark><p style="text-align: center">c</p>';
    const out = sanitizeHtml(html);
    for (const s of ['data-section="info"', 'data-task-id="t"', 'data-line-id="l"', 'data-drive-id="f1"', 'text-align: center']) expect(out).toContain(s);
  });
  it('forces safe link targets', () => {
    expect(sanitizeHtml('<a href="https://x.y">x</a>')).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe('token provider', () => {
  const fetchMock = vi.fn();
  afterEach(() => {
    fetchMock.mockReset();
    clearTokens();
    vi.unstubAllGlobals();
  });
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const setup = () => {
    vi.stubGlobal('fetch', fetchMock);
    const onReconnect = vi.fn();
    configureGoogle({ mock: true, apiBase: { 'https://www.googleapis.com': '/__mock/googleapis' } }, onReconnect);
    return onReconnect;
  };

  it('caches tokens in memory until near expiry and never touches localStorage', async () => {
    setup();
    fetchMock.mockResolvedValueOnce(json(200, { access_token: 'a1', expires_at: Date.now() + 3600_000, scopes: ['s'] }));
    expect(await getToken(['s'])).toBe('a1');
    expect(await getToken(['s'])).toBe('a1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify({ ...localStorage })).not.toContain('a1');
  });

  it('refreshes an expiring token', async () => {
    setup();
    fetchMock.mockResolvedValueOnce(json(200, { access_token: 'old', expires_at: Date.now() + 30_000 })).mockResolvedValueOnce(json(200, { access_token: 'new', expires_at: Date.now() + 3600_000 }));
    expect(await getToken(['s'])).toBe('old');
    expect(await getToken(['s'])).toBe('new');
  });

  it('maps a revoked grant to ReconnectRequiredError and notifies the UI', async () => {
    const onReconnect = setup();
    fetchMock.mockResolvedValueOnce(json(409, { error: 'reconnect_required' }));
    await expect(getToken(['s'])).rejects.toBeInstanceOf(ReconnectRequiredError);
    expect(onReconnect).toHaveBeenCalled();
  });

  it('maps an ungranted scope and network failures', async () => {
    setup();
    fetchMock.mockResolvedValueOnce(json(403, { error: 'scope_not_granted' }));
    await expect(getToken(['cal'])).rejects.toBeInstanceOf(ScopeNotGrantedError);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(getToken(['x'])).rejects.toBeInstanceOf(TransientError);
  });

  it('authFetch rewrites to the mock base, retries a Google 401 once with a forced fresh token', async () => {
    setup();
    fetchMock
      .mockResolvedValueOnce(json(200, { access_token: 't1', expires_at: Date.now() + 3600_000 }))
      .mockResolvedValueOnce(json(401, { error: { code: 401 } }))
      .mockResolvedValueOnce(json(200, { access_token: 't2', expires_at: Date.now() + 3600_000 }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const res = await authFetch('https://www.googleapis.com/drive/v3/files', { scopes: ['s'] });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[1]![0]).toBe('/__mock/googleapis/drive/v3/files');
    expect(String(fetchMock.mock.calls[2]![0])).toContain('force=1');
    expect((fetchMock.mock.calls[3]![1] as RequestInit).headers).toBeInstanceOf(Headers);
    expect(((fetchMock.mock.calls[3]![1] as RequestInit).headers as Headers).get('Authorization')).toBe('Bearer t2');
  });
});
