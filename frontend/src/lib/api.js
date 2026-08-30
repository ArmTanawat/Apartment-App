/* api.js — the one place that knows where the server is.
 *
 * Nowhere, as it turns out. Express serves the built pages itself, so the app
 * and the API are one origin and every request is a relative path — which is
 * what makes the port the OS happens to hand the packaged app irrelevant here.
 *
 * In development Vite serves the pages on 5173 and proxies these paths to the
 * server on 3001, so the same relative paths work there too. The constant
 * stays because it is still the one place that would change.
 */

export const API_BASE = '';

/* Two kinds of failure, and they are not the same thing.
 *
 * ApiError is the server saying no — a rule being enforced, with a message
 * written for a person to read. It belongs beside the field that caused it.
 *
 * ApiDown is the server not being there at all. It affects everything on the
 * screen and belongs at the top of the page with a way to retry. Treating the
 * two the same teaches the user to ignore both. */
export class ApiError extends Error {
  constructor(message, status){ super(message); this.name = 'ApiError'; this.status = status; }
}
export class ApiDown extends Error {
  constructor(cause){ super('ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่'); this.name = 'ApiDown'; this.cause = cause; }
}

async function request(path, options){
  let res;
  try {
    res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (e) {
    throw new ApiDown(e);
  }

  if(res.status === 204) return null;

  let body = null;
  try { body = await res.json(); } catch { body = null; }

  // The backend writes errors for a person to read — passing them through
  // beats inventing wording that says less. The generic line is only for a
  // response that carried no message at all.
  if(!res.ok){
    throw new ApiError((body && body.error) || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`, res.status);
  }
  return body;
}

export const get  = path        => request(path);
export const post = (path, body) => request(path, { method: 'POST',   body: JSON.stringify(body) });
export const put  = (path, body) => request(path, { method: 'PUT',    body: JSON.stringify(body) });
export const del  = path        => request(path, { method: 'DELETE' });

// A message to show, whatever went wrong.
export const messageOf = e =>
  e instanceof ApiDown ? 'ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่'
  : (e && e.message) || 'เกิดข้อผิดพลาด';
