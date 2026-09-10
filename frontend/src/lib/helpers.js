/* helpers.js — the prototype's "helpers that mirror the API's rules", made
   into pure functions that take their data as arguments instead of reading
   module-level arrays. The rules themselves are unchanged. */

export const baht = n => n.toLocaleString("th-TH",{minimumFractionDigits:2, maximumFractionDigits:2});

export const money = n => Math.round(n * 100) / 100;

export const daysInPeriod = period => {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

// The abbreviations a Thai column heading uses. Twelve narrow columns have no
// room for มกราคม, and these are what anybody reading a calendar expects.
export const MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.",
  "ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

export const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

export const periodLabel = p => {
  const [y, m] = p.split("-").map(Number);
  return `${THAI_MONTHS[m-1]} ${y}`;
};

export const shiftPeriod = (p, by) => {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
};

export const thaiDate = iso => { const [y,m,d] = iso.split("-").map(Number);
  return d + " " + ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][m-1]; };

const p2 = n => String(n).padStart(2, "0");

// The machine's local date, as YYYY-MM-DD.
//
// NOT new Date().toISOString().slice(0,10), which is UTC. The backend uses
// date('now','localtime') everywhere for exactly this reason: Thailand is
// seven hours ahead, so between midnight and 7am a UTC date is yesterday and
// a room whose lease ends today would show as occupied all morning.
export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
};

export const thisMonth = () => todayLocal().slice(0, 7);

// The timestamp format the bills and the backup list are shown in.
export const stampLocal = (d = new Date()) =>
  `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

export const floors = units => [...new Set(units.map(u=>u.floor))].sort((a,b)=>a-b);

// end_date is THE DAY THE ROOM BECOMES FREE, not the last night slept.
// A lease covers a date when it started on or before it and ends after it.
// Every date comparison in the app uses this meaning; mixing >= and > here
// makes the board show a room as vacant that nobody can be moved into.
export const leaseOn = (leases, unitId, date) => leases.find(l =>
  l.unit_id===unitId && l.start_date<=date && (!l.end_date || l.end_date>date));

export const activeLease = (leases, unitId, today) => leaseOn(leases, unitId, today);

// A move-out already entered for a future date. The room is still occupied,
// but it is about to come free and that is worth seeing on the board.
export const leavingOn = (leases, unitId, today) => {
  const l = activeLease(leases, unitId, today);
  return l && l.end_date ? l.end_date : null;
};

export const tenantOf = (tenants, leases, leaseId) =>
  tenants.find(t => t.id === (leases.find(l=>l.id===leaseId)||{}).tenant_id);

// The overlap test the backend runs before creating a lease. Comparing against
// today would wrongly allow a lease starting inside someone else's stay.
// A lease ending on the 15th and one starting on the 15th do not overlap.
export function overlapping(leases, unitId, start, end){
  return leases.find(l => l.unit_id===unitId
    && (!l.end_date || l.end_date > start)
    && (!end || l.start_date < end));
}

// Last reading before this period, used to prefill the previous boxes so only
// one number per meter is typed. Falls back to the most recent reading rather
// than exactly last month, so a skipped month does not break the chain.
export function previousReading(readings, unitId, period){
  // A row whose current reading was cleared has nothing to carry forward, so
  // the chain steps back past it to the last month that was actually finished.
  const past = readings.filter(r => r.unit_id===unitId && r.period < period
      && r.water_curr != null && r.elec_curr != null)
    .sort((a,b) => b.period.localeCompare(a.period));
  return past.length ? {water: past[0].water_curr, elec: past[0].elec_curr, from: past[0].period}
                     : {water: 0, elec: 0, from: null};
}

// Every lease that occupied the room at any point during a period — usually
// one, but two in a handover month. The room page needs this rather than just
// today's lease: a tenant who moved out on the 10th still gets a bill for that
// month, and a repair found afterwards is still theirs to pay.
export function leasesInPeriod(leases, unitId, period){
  const first = period + "-01", last = period + "-31";
  return leases.filter(l => l.unit_id===unitId
    && l.start_date <= last && (!l.end_date || l.end_date > first))
    .sort((a,b)=>a.start_date.localeCompare(b.start_date));
}

// A row can exist with a previous reading but no current one — the state left
// after the previous figure was corrected and the meter needs reading again.
// "Metered" means both current numbers are actually in.
export const metered = (readings, unitId, period) =>
  readings.some(r => r.unit_id===unitId && r.period===period
    && r.water_curr !== null && r.water_curr !== undefined
    && r.elec_curr !== null && r.elec_curr !== undefined);

export const billed = (bills, leases, unitId, period, today) => {
  const l = activeLease(leases, unitId, today);
  return !!(l && bills.some(b => b.lease_id===l.id && b.period===period));
};

export const appliesMinimum = (periodSettings, period) =>
  period in periodSettings ? periodSettings[period] : true;

// Name, phone and address are printed on the invoice. Anything missing here is
// a blank on a bill later, so it is worth surfacing before that happens.
export const missingForBill = t =>
  [!t.phone ? "เบอร์โทร" : null, !t.address ? "ที่อยู่" : null].filter(Boolean);

export const roomsOf = (leases, units, tenantId, today) =>
  leases.filter(l => l.tenant_id === tenantId)
    .map(l => ({ lease:l, unit: units.find(u => u.id === l.unit_id),
                 current: !l.end_date || l.end_date > today }))
    .sort((a,b) => (b.current - a.current) || a.unit.unit_number.localeCompare(b.unit.unit_number));

// How a percentage fee reads in a list: "10% ของค่าไฟ". The label comes from
// GET /fees/basis, so it is the same wording that lands on the bill.
export const shareLabel = (fee, feeBasis) =>
  `${fee.percent}% ของ${feeBasis[fee.percent_of] || fee.percent_of}`;
