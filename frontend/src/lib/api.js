/* api.js — the one place that knows where the server is.
 *
 * Electron will later start the Express server as a child process and open a
 * window at localhost, so every URL in the app has to keep working. That is
 * what this constant is for: changing it is a one-line edit.
 */

export const API_BASE = 'http://localhost:3001';

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
  constructor(cause){ super('ติดต่อเซิร์ฟเวอร์ไม่ได้'); this.name = 'ApiDown'; this.cause = cause; }
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
  e instanceof ApiDown ? 'ติดต่อเซิร์ฟเวอร์ไม่ได้ — โปรแกรมส่วนหลังยังไม่ได้เปิด'
  : (e && e.message) || 'เกิดข้อผิดพลาด';
