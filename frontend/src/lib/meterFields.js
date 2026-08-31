/* meterFields.js — the meter numbers out of a bill line's working.
 *
 * A utility line stores one sentence:
 *
 *   12 หน่วย — 100 บาท สำหรับ 5 หน่วยแรก แล้ว 7 × 9 (100 → 112)
 *
 * which explains the charge but buries the three figures anyone actually
 * checks. A receipt needs previous, current and units used readable at a
 * glance, so they are lifted out and printed as their own fields, with the
 * explanation kept beside them — it is what lets a tenant follow the
 * arithmetic rather than trust it.
 *
 * Read from the stored sentence rather than from the meter reading itself,
 * deliberately. A bill records what it charged: if the reading was corrected
 * afterwards, the bill must still show the numbers it was worked out from.
 * Bills issued before this existed parse the same way, because the sentence
 * has not changed — and anything that does not parse falls back to printing
 * the sentence as it always was.
 */

// The trailing "(prev → curr)", with " ครบรอบ" when the dial wrapped.
const METER = /\(\s*([\d.]+)\s*→\s*([\d.]+)(\s*ครบรอบ)?\s*\)\s*$/;
const USED = /^\s*([\d.]+)\s*หน่วย/;

export function meterFields(detail) {
  if (!detail) return null;
  const meter = detail.match(METER);
  const used = detail.match(USED);
  if (!meter || !used) return null;

  return {
    prev: meter[1],
    curr: meter[2],
    used: used[1],
    rolled: !!meter[3],
    working: detail.slice(0, meter.index).trim(),
  };
}
