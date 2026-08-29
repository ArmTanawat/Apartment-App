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
export function previewBill(leaseId, period, { prorate = false, days = null } = {}){
  const q = [];
  if(prorate) q.push('prorate=true');
  if(days !== null && days !== undefined) q.push(`days=${days}`);
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

// Whether a bill was made with rent charged by the day. The working is
// recorded in the rent line, which is the only place it survives — a bill
// stores amounts, not the options it was generated with.
export const wasProrated = bill =>
  !!(bill.items && bill.items[0] && (bill.items[0].detail || '').includes('จาก'));

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
    const fresh = await previewBill(bill.lease_id, bill.period,
      { prorate: wasProrated(bill), days: null });
    return { changes: diffItems(bill.items, fresh.items) };
  } catch (e) {
    // The data moved so far that a bill can no longer be built at all — the
    // meter reading was deleted, say. That is worth saying, not swallowing.
    if(e instanceof ApiError) return { error: e.message };
    throw e;
  }
}
