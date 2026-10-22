/* bills.js — what the screens need to know about a bill, all of it from the
 * server.
 *
 * The prototype carried its own buildBill() and utilityCharge(), a second copy
 * of backend/routes/bills.js. They agreed on every case anyone tested and they
 * would not have stayed in agreement. Both are gone; the preview endpoint
 * returns exactly the figures POST would store.
 */

import { ApiError, get } from './api.js';

// GET /bills/preview/:leaseId/:period — the same figures POST /bills would
// write, without writing anything. A 400 here is not a failure: it is the
// server saying this room cannot be billed yet, and the message names why.
export function previewBill(leaseId, period, { prorate = false, days = null, waiveRent = false } = {}){
  const q = [];
  if(prorate) q.push('prorate=true');
  if(days !== null && days !== undefined) q.push(`days=${days}`);
  if(waiveRent) q.push('waive_rent=true');
  return get(`/bills/preview/${leaseId}/${period}${q.length ? '?' + q.join('&') : ''}`);
}

// The preview, or the reason there isn't one. Used where a whole table of
// rooms is being previewed and one room failing must not lose the others.
export async function previewOrReason(leaseId, period, opts){
  try { return { built: await previewBill(leaseId, period, opts) }; }
  catch (e) {
    if(e instanceof ApiError) return { skip: e.message };
    throw e;   // the server not being there is not a per-room problem
  }
}

// How a bill's rent was worked out, read back off its rent line — the only
// place it survives, since a bill stores amounts, not the options it was made
// with. The wording is buildBill's in backend/routes/bills.js; change both.
//
//   ห้อง 101 — คิด 11 จาก 31 วัน              → by the day, 11 days
//   ห้อง 101 — ชำระล่วงหน้าแล้ว Paid in advance  → no rent this month
//
// The day count matters. Re-checking a prorated bill against a preview with no
// day count compares it with a full month: the screen then reports a change
// that never happened, and its one button rebills the room for the whole month.
export function rentOptionsOf(bill){
  const detail = (bill.items && bill.items[0] && bill.items[0].detail) || '';
  const days = detail.match(/คิด (\d+) จาก \d+ วัน/);
  if(days) return { prorate: true, days: Number(days[1]), waiveRent: false };
  if(detail.includes('ชำระล่วงหน้าแล้ว')) return { prorate: false, days: null, waiveRent: true };
  return { prorate: false, days: null, waiveRent: false };
}

/* Compares a saved bill with what the same inputs would produce now.
 *
 * The comparison is line by line, NOT on the total. Two mistakes can cancel
 * out — a meter corrected down by 450 and a repair added for 450 leave the
 * total identical while both lines are wrong — and a total-only check would
 * report that nothing had changed. */
export function diffItems(oldItems, newItems){
  const key = i => i.label;
  const oldMap = new Map(oldItems.map(i => [key(i), i]));
  const newMap = new Map(newItems.map(i => [key(i), i]));
  const changes = [];

  new Set([...oldMap.keys(), ...newMap.keys()]).forEach(k => {
    const a = oldMap.get(k), b = newMap.get(k);
    if(!a) changes.push({ label:k, from:null, to:b.amount });
    else if(!b) changes.push({ label:k, from:a.amount, to:null });
    else if(a.amount !== b.amount) changes.push({ label:k, from:a.amount, to:b.amount });
  });

  return changes;
}

// A stored bill against a fresh preview of the same lease and month.
export async function billDiff(bill){
  try {
    const fresh = await previewBill(bill.lease_id, bill.period, rentOptionsOf(bill));
    return { changes: diffItems(bill.items, fresh.items) };
  } catch (e) {
    // The data moved so far that a bill can no longer be built at all — the
    // meter reading was deleted, say. That is worth saying, not swallowing.
    if(e instanceof ApiError) return { error: e.message };
    throw e;
  }
}
