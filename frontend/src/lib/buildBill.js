/* buildBill.js — PHASE 1 ONLY.
 *
 * This is the prototype's second copy of the logic in backend/routes/bills.js.
 * It exists so the ported app shows real numbers against mock data and can be
 * compared side by side with prototype/rooms.html.
 *
 * Phase 2 deletes this file. buildBill() is replaced by
 * GET /bills/preview/:leaseId/:period and utilityCharge() by the same preview,
 * because two copies of a money calculation will not stay in agreement.
 */

import { money, daysInPeriod, appliesMinimum } from './helpers.js';

// Mirrors buildBill() in routes/bills.js. Every figure a tenant is charged
// comes through here, and the same function feeds both the preview and the
// saved bill so the two can never disagree.
export function buildBill(data, leaseId, period, opts = {}){
  const { leases, units, tenants, readings, settings, leaseFees, charges, periodSettings } = data;
  const { prorate = false, prorateDays = null } = opts;
  const lease = leases.find(l => l.id === leaseId);
  if(!lease) return { error: "ไม่พบสัญญาเช่า" };

  const unit = units.find(u => u.id === lease.unit_id);
  const tenant = tenants.find(t => t.id === lease.tenant_id);
  const r = readings.find(x => x.unit_id === lease.unit_id && x.period === period);

  if(!r || r.water_curr == null || r.elec_curr == null)
    return { error: `ห้อง ${unit.unit_number} ยังจดมิเตอร์ไม่ครบ` };

  const applyMin = appliesMinimum(periodSettings, period);
  const waterUsed = (r.water_curr + (r.water_rollover || 0)) - r.water_prev;
  const elecUsed  = (r.elec_curr  + (r.elec_rollover  || 0)) - r.elec_prev;

  const charge = (kind, used, from, to, rolled) => {
    const rate = settings[kind + "_rate"];
    const mu = settings[kind + "_min_units"];
    const ma = settings[kind + "_min_amount"];
    const meter = `${from} → ${to}${rolled ? " ครบรอบ" : ""}`;
    if(!applyMin) return { amount: money(used * rate),
      detail: `${used} หน่วย × ${rate} บาท (${meter})` };
    if(used <= mu) return { amount: money(ma),
      detail: `${used} หน่วย — ขั้นต่ำ ${ma} บาท ครอบคลุม ${mu} หน่วย (${meter})` };
    return { amount: money(ma + (used - mu) * rate),
      detail: `${used} หน่วย — ${ma} บาท สำหรับ ${mu} หน่วยแรก แล้ว ${used-mu} × ${rate} (${meter})` };
  };

  const water = charge("water", waterUsed, r.water_prev, r.water_curr, r.water_rollover);
  const elec  = charge("electricity", elecUsed, r.elec_prev, r.elec_curr, r.elec_rollover);

  let rentAmount = money(lease.monthly_rent);
  let rentDetail = `ห้อง ${unit.unit_number}`;
  if(prorate){
    const total = daysInPeriod(period);
    const days = prorateDays ?? total;
    if(days < 1 || days > total) return { error: `จำนวนวันต้องอยู่ระหว่าง 1 ถึง ${total}` };
    rentAmount = money(lease.monthly_rent / total * days);
    rentDetail = `ห้อง ${unit.unit_number} — คิด ${days} จาก ${total} วัน`;
  }

  const recurring = leaseFees.filter(f => f.lease_id === leaseId);
  const oneTime = charges.filter(c => c.lease_id === leaseId && c.period === period);
  const feesAmount = money(
    recurring.reduce((sum, f) => sum + f.amount, 0) +
    oneTime.reduce((sum, c) => sum + c.amount, 0));

  const items = [
    { label:"ค่าเช่า Rent", detail: rentDetail, amount: rentAmount },
    { label:"ค่าน้ำ Water", detail: water.detail, amount: water.amount },
    { label:"ค่าไฟ Electricity", detail: elec.detail, amount: elec.amount },
    ...recurring.map(f => ({ label:f.name, detail:"รายเดือน Monthly", amount: money(f.amount) })),
    ...oneTime.map(c => ({ label:c.description, detail:"ครั้งเดียว One-time", amount: money(c.amount) }))
  ];

  return {
    lease_id: leaseId, period,
    tenant_name: tenant.full_name, tenant_phone: tenant.phone, tenant_address: tenant.address,
    unit_number: unit.unit_number, floor: unit.floor,
    rent_amount: rentAmount, water_amount: water.amount, elec_amount: elec.amount,
    fees_amount: feesAmount,
    total: money(rentAmount + water.amount + elec.amount + feesAmount),
    water_used: waterUsed, elec_used: elecUsed,
    items
  };
}

// Compares a saved bill with what the same inputs would produce now.
//
// The comparison is line by line, NOT on the total. Two mistakes can cancel
// out — a meter corrected down by 450 and a repair added for 450 leave the
// total identical while both lines are wrong — and a total-only check would
// report that nothing had changed.
export function billDiff(data, bill){
  const fresh = buildBill(data, bill.lease_id, bill.period, {
    prorate: bill.items[0].detail.includes("จาก"),
    prorateDays: null
  });
  if(fresh.error) return { error: fresh.error };

  const key = i => i.label;
  const oldMap = new Map(bill.items.map(i => [key(i), i]));
  const newMap = new Map(fresh.items.map(i => [key(i), i]));
  const changes = [];

  new Set([...oldMap.keys(), ...newMap.keys()]).forEach(k => {
    const a = oldMap.get(k), b = newMap.get(k);
    if(!a) changes.push({ label:k, from:null, to:b.amount });
    else if(!b) changes.push({ label:k, from:a.amount, to:null });
    else if(a.amount !== b.amount) changes.push({ label:k, from:a.amount, to:b.amount });
  });

  return { changes, fresh };
}

// The same arithmetic the bill uses. Kept here so the worked example on the
// settings page cannot drift from what a tenant is actually charged.
export function utilityCharge(settings, kind, used){
  const rate = settings[kind + "_rate"];
  const minUnits = settings[kind + "_min_units"];
  const minAmount = settings[kind + "_min_amount"];
  return used <= minUnits ? minAmount : minAmount + (used - minUnits) * rate;
}
