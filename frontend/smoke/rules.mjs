import { API } from './api-base.mjs';
/* Product testing, backend rules.
 *
 * Not a regression suite — this goes after the rules in CLAUDE.md and
 * REQUIREMENTS.md and tries to break each one, including the boundary cases
 * the prose is careful about. It creates its own rooms so it can be run
 * against a seeded database and cleaned up afterwards.
 *
 *   node smoke/rules.mjs
 */
const call = async (m, p, b) => {
  const r = await fetch(API + p, { method: m, headers: {'Content-Type':'application/json'},
    body: b === undefined ? undefined : JSON.stringify(b) });
  const body = r.status === 204 ? null : await r.json().catch(() => null);
  return { status: r.status, body };
};
const GET = p => call('GET', p), POST = (p,b) => call('POST',p,b),
      PUT = (p,b) => call('PUT',p,b), DEL = p => call('DELETE',p);

let pass = 0; const findings = [];
const ok = (name, cond, detail = '') => {
  if(cond){ pass++; console.log(`  ok   ${name}`); }
  else { findings.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}${detail ? '  — ' + detail : ''}`); }
};
const section = t => console.log(`\n${t}`);

const p2 = n => String(n).padStart(2,'0');
const now = new Date();
const period = `${now.getFullYear()}-${p2(now.getMonth()+1)}`;
const daysInPeriod = p => { const [y,m] = p.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const DAYS = daysInPeriod(period);

// ---- fixtures, kept apart from the seeded building ----
const made = { units: [], tenants: [], types: [] };
const newUnit = async (n, rent = 1000) => {
  const r = await POST('/units', { unit_number: n, floor: 9, base_rent: rent });
  made.units.push(r.body.id); return r.body;
};
const newTenant = async n => {
  const r = await POST('/tenants', { full_name: n });
  made.tenants.push(r.body.id); return r.body;
};

const settingsBefore = (await GET('/settings')).body;

section('end_date is the day the room becomes free — the six places must agree');
{
  const u = await newUnit('T01');
  const a = await newTenant('ผู้เช่า A'), b = await newTenant('ผู้เช่า B');
  const l1 = await POST('/leases', { tenant_id:a.id, unit_id:u.id,
    start_date:'2026-01-01', end_date:'2026-06-16', monthly_rent:1000 });
  ok('a lease with a future end date is created', l1.status === 201);

  const same = await POST('/leases', { tenant_id:b.id, unit_id:u.id, start_date:'2026-06-16', monthly_rent:1000 });
  ok('a lease starting the day the room frees up is allowed', same.status === 201,
     JSON.stringify(same.body));
  if(same.status === 201) await DEL(`/leases/${same.body.id}`);

  const overlap = await POST('/leases', { tenant_id:b.id, unit_id:u.id, start_date:'2026-06-15', monthly_rent:1000 });
  ok('one day earlier is refused', overlap.status === 400, JSON.stringify(overlap.body));
  ok('and the refusal names the tenant',
     overlap.body && overlap.body.error.includes('ผู้เช่า A'), overlap.body && overlap.body.error);

  // The same boundary on PUT, which used to have no check at all.
  const other = await POST('/leases', { tenant_id:b.id, unit_id:u.id, start_date:'2026-06-16', monthly_rent:1000 });
  const back = await PUT(`/leases/${other.body.id}`, { start_date:'2026-06-15' });
  ok('PUT refuses the same overlap POST does', back.status === 400, JSON.stringify(back.body));
  const stillFine = await PUT(`/leases/${other.body.id}`, { start_date:'2026-06-16' });
  ok('and allows the boundary day itself', stillFine.status === 200, JSON.stringify(stillFine.body));
  await DEL(`/leases/${other.body.id}`);
  await DEL(`/leases/${l1.body.id}`);
}

section('a room emptying today is vacant today, and re-lettable today');
{
  const u = await newUnit('T02');
  const t = await newTenant('ผู้เช่า C');
  const today = `${now.getFullYear()}-${p2(now.getMonth()+1)}-${p2(now.getDate())}`;
  const l = await POST('/leases', { tenant_id:t.id, unit_id:u.id, start_date:'2026-01-01', monthly_rent:1000 });
  await PUT(`/leases/${l.body.id}/end`, { end_date: today });

  const units = (await GET('/units')).body.find(x => x.id === u.id);
  ok('GET /units says vacant', units.is_occupied === false, JSON.stringify(units));
  const vacant = (await GET('/units/vacant')).body.some(x => x.id === u.id);
  ok('GET /units/vacant lists it', vacant);
  const active = (await GET('/leases/active')).body.some(x => x.id === l.body.id);
  ok('GET /leases/active drops it', !active);
  const relet = await POST('/leases', { tenant_id:t.id, unit_id:u.id, start_date: today, monthly_rent:1000 });
  ok('someone else can move in the same day', relet.status === 201, JSON.stringify(relet.body));
  if(relet.status === 201) await DEL(`/leases/${relet.body.id}`);
  await DEL(`/leases/${l.body.id}`);
}

section('a move-out scheduled for tomorrow is still occupied, and shows as leaving');
{
  const u = await newUnit('T03');
  const t = await newTenant('ผู้เช่า D');
  const tomorrow = new Date(now.getTime() + 86400000);
  const d = `${tomorrow.getFullYear()}-${p2(tomorrow.getMonth()+1)}-${p2(tomorrow.getDate())}`;
  const l = await POST('/leases', { tenant_id:t.id, unit_id:u.id, start_date:'2026-01-01', end_date:d, monthly_rent:1000 });
  const row = (await GET('/units')).body.find(x => x.id === u.id);
  ok('still occupied', row.is_occupied === true);
  ok('and flagged as leaving, with the date', row.is_leaving === true && row.leaving_on === d,
     JSON.stringify(row));
  await DEL(`/leases/${l.body.id}`);
}

section('the minimum charge, at and either side of the threshold');
{
  await PUT('/settings', { water_rate:9, water_min_units:5, water_min_amount:100 });
  const u = await newUnit('T04');
  const t = await newTenant('ผู้เช่า E');
  const l = await POST('/leases', { tenant_id:t.id, unit_id:u.id, start_date:'2026-01-01', monthly_rent:1000 });
  const bill = async (w) => {
    await DEL(`/readings/${((await GET(`/readings?period=${period}`)).body.find(r=>r.unit_id===u.id)||{}).reading_id || 0}`);
    await POST('/readings', { unit_id:u.id, period, water_prev:0, water_curr:w, elec_prev:0, elec_curr:0 });
    const pv = await GET(`/bills/preview/${l.body.id}/${period}`);
    return pv.body.water_amount;
  };
  ok('4 units — under the threshold, flat only', await bill(4) === 100);
  ok('5 units — at the threshold, flat only', await bill(5) === 100);
  ok('6 units — flat plus one', await bill(6) === 109);
  ok('8 units — the worked example in the docs', await bill(8) === 127);

  await PUT(`/settings/period/${period}`, { apply_minimum: false });
  ok('minimum off — simply units x rate', await bill(8) === 72);
  ok('minimum off — 3 units is not rounded up to the flat', await bill(3) === 27);
  await PUT(`/settings/period/${period}`, { apply_minimum: true });
  await DEL(`/leases/${l.body.id}`);
}

section('money is rounded when a bill is written');
{
  await PUT('/settings', { water_rate:3.333, water_min_units:0, water_min_amount:0 });
  const u = await newUnit('T05', 1000.005);
  const t = await newTenant('ผู้เช่า F');
  const l = await POST('/leases', { tenant_id:t.id, unit_id:u.id, start_date:'2026-01-01', monthly_rent:1000.005 });
  await POST('/readings', { unit_id:u.id, period, water_prev:0, water_curr:3, elec_prev:0, elec_curr:0 });
  const made = await POST('/bills', { lease_id:l.body.id, period });
  const b = made.body;
  const twoDp = n => Math.round(n * 100) === n * 100;
  ok('every amount on the bill has at most two decimals',
     [b.rent_amount, b.water_amount, b.elec_amount, b.fees_amount, b.total].every(twoDp),
     JSON.stringify([b.rent_amount, b.water_amount, b.elec_amount, b.fees_amount, b.total]));
  ok('3 x 3.333 stored as 10, not 9.999', b.water_amount === 10, String(b.water_amount));
  ok('the total is the sum of the parts',
     b.total === Math.round((b.rent_amount + b.water_amount + b.elec_amount + b.fees_amount) * 100) / 100,
     `${b.total} vs parts`);

  section('a bill is never overwritten');
  const again = await POST('/bills', { lease_id:l.body.id, period });
  ok('a second bill for the same tenant and month is refused', again.status === 400,
     JSON.stringify(again.body));
  const batch = await POST('/bills/batch', { period, unit_ids: [u.id] });
  ok('and the batch skips it rather than replacing it',
     batch.body.generated_count === 0 && batch.body.skipped_count === 1, JSON.stringify(batch.body));
  ok('the skip names the room and the reason',
     batch.body.skipped[0].unit_number === 'T05' && batch.body.skipped[0].reason.includes('ออกบิล'),
     JSON.stringify(batch.body.skipped[0]));
  const stillThere = await GET(`/bills/${b.id}`);
  ok('the original bill is untouched', stillThere.body.total === b.total);

  await DEL(`/bills/${b.id}`);
  await DEL(`/leases/${l.body.id}`);
  await PUT('/settings', { water_rate: settingsBefore.water_rate,
    water_min_units: settingsBefore.water_min_units, water_min_amount: settingsBefore.water_min_amount });
}

section('one failing room in a batch does not stop the others');
{
  const us = [await newUnit('T06'), await newUnit('T07'), await newUnit('T08')];
  const ts = [await newTenant('ผู้เช่า G'), await newTenant('ผู้เช่า H'), await newTenant('ผู้เช่า I')];
  const ls = [];
  for(let i = 0; i < 3; i++){
    ls.push((await POST('/leases', { tenant_id:ts[i].id, unit_id:us[i].id,
      start_date:'2026-01-01', monthly_rent:1000 })).body);
  }
  // The middle one is never metered.
  await POST('/readings', { unit_id:us[0].id, period, water_prev:0, water_curr:5, elec_prev:0, elec_curr:5 });
  await POST('/readings', { unit_id:us[2].id, period, water_prev:0, water_curr:5, elec_prev:0, elec_curr:5 });
  const r = await POST('/bills/batch', { period, unit_ids: us.map(u => u.id) });
  ok('two bills made, one skipped', r.body.generated_count === 2 && r.body.skipped_count === 1,
     JSON.stringify({ made: r.body.generated_count, skipped: r.body.skipped_count }));
  ok('the skipped room is named', r.body.skipped[0].unit_number === 'T07', JSON.stringify(r.body.skipped));
  ok('and the reason says the meter', r.body.skipped[0].reason.includes('มิเตอร์'), r.body.skipped[0].reason);
  for(const g of r.body.generated) await DEL(`/bills/${g.bill_id}`);
  for(const l of ls) await DEL(`/leases/${l.id}`);
}

section('a handover month bills both tenants');
{
  const u = await newUnit('T09');
  const a = await newTenant('ผู้เช่า J'), b = await newTenant('ผู้เช่า K');
  const mid = `${period}-10`;
  const l1 = await POST('/leases', { tenant_id:a.id, unit_id:u.id,
    start_date:`${period}-01`, end_date:mid, monthly_rent:1000 });
  const l2 = await POST('/leases', { tenant_id:b.id, unit_id:u.id, start_date:mid, monthly_rent:1000 });
  ok('both leases exist on one room', l1.status === 201 && l2.status === 201);
  await POST('/readings', { unit_id:u.id, period, water_prev:0, water_curr:5, elec_prev:0, elec_curr:5 });
  const r = await POST('/bills/batch', { period, unit_ids:[u.id] });
  ok('the batch bills both, not one', r.body.generated_count === 2, JSON.stringify(r.body));
  ok('and they are different tenants',
     new Set(r.body.generated.map(g => g.tenant_name)).size === 2,
     JSON.stringify(r.body.generated.map(g => g.tenant_name)));
  for(const g of r.body.generated) await DEL(`/bills/${g.bill_id}`);
  await DEL(`/leases/${l2.body.id}`); await DEL(`/leases/${l1.body.id}`);
}

section('rent by the day');
{
  const u = await newUnit('T10', 3000);
  const t = await newTenant('ผู้เช่า L');
  const l = await POST('/leases', { tenant_id:t.id, unit_id:u.id, start_date:'2026-01-01', monthly_rent:3000 });
  await POST('/readings', { unit_id:u.id, period, water_prev:0, water_curr:0, elec_prev:0, elec_curr:0 });
  const days = n => GET(`/bills/preview/${l.body.id}/${period}?prorate=true&days=${n}`);
  const one = await days(1);
  ok('1 day is a thirtieth-ish of the rent',
     one.body.rent_amount === Math.round(3000 / DAYS * 1 * 100) / 100, String(one.body.rent_amount));
  ok('and the working is on the line', one.body.items[0].detail.includes(`1 จาก ${DAYS} วัน`),
     one.body.items[0].detail);
  const all = await days(DAYS);
  ok('the whole month is the whole rent', all.body.rent_amount === 3000, String(all.body.rent_amount));
  ok('0 days is refused', (await days(0)).status === 400);
  ok('one day too many is refused', (await days(DAYS + 1)).status === 400);

  const batch = await POST('/bills/batch', { period, unit_ids:[u.id], prorate:true, prorate_days:11 });
  const made = (await GET(`/bills/${batch.body.generated[0].bill_id}`)).body;
  ok('the batch honours the day count it was given',
     made.rent_amount === Math.round(3000 / DAYS * 11 * 100) / 100,
     `${made.rent_amount} for 11 of ${DAYS} days`);
  await DEL(`/bills/${made.id}`);
  await DEL(`/leases/${l.body.id}`);
}

section('a meter that reads lower than last month');
{
  const u = await newUnit('T11');
  const low = await POST('/readings', { unit_id:u.id, period, water_prev:9995, water_curr:12,
    elec_prev:0, elec_curr:0 });
  ok('refused outright', low.status === 400, JSON.stringify(low.body));
  ok('and the message names water, not just "the meter"',
     low.body.error.includes('เลขน้ำ'), low.body.error);

  const rolled = await POST('/readings', { unit_id:u.id, period, water_prev:9995, water_curr:12,
    water_rollover:10000, elec_prev:0, elec_curr:0 });
  ok('accepted once the dial is said to have wrapped', rolled.status === 201, JSON.stringify(rolled.body));
  const row = (await GET(`/readings?period=${period}`)).body.find(r => r.unit_id === u.id);
  ok('9995 → 12 on a four-digit dial is 17 units, not 12', row.water_used === 17, String(row.water_used));

  await PUT(`/readings/${rolled.body.id}`, { water_prev:0, water_curr:0, water_rollover:0 });
  const same = await PUT(`/readings/${rolled.body.id}`, { water_prev:100, water_curr:100 });
  ok('a meter that did not move is 0 units, not an error', same.status === 200,
     JSON.stringify(same.body));
}

section('a reading with a previous figure but no current one');
{
  const u = await newUnit('T12');
  const t = await newTenant('ผู้เช่า M');
  const l = await POST('/leases', { tenant_id:t.id, unit_id:u.id, start_date:'2026-01-01', monthly_rent:1000 });
  const r = await POST('/readings', { unit_id:u.id, period, water_prev:100, water_curr:150,
    elec_prev:0, elec_curr:50 });
  await PUT(`/readings/${r.body.id}`, { water_curr: null });
  const row = (await GET(`/readings?period=${period}`)).body.find(x => x.unit_id === u.id);
  ok('the row survives with the previous figure', row.reading_id !== null && row.water_prev === 100);
  ok('and counts as not entered on the checklist', row.is_entered === false, JSON.stringify(row));

  const pv = await GET(`/bills/preview/${l.body.id}/${period}`);
  ok('a bill for it is refused rather than guessed at', pv.status === 400,
     `status ${pv.status}, water ${pv.body && pv.body.water_amount}, total ${pv.body && pv.body.total}`);
  ok('and says the meter is half done, not that it is missing',
     pv.body.error.includes('ไม่ครบ'), pv.body.error);

  // The worst shape of it: with the minimum switched off, null went through
  // the arithmetic as zero and came out as a NEGATIVE line on the bill.
  await PUT(`/settings/period/${period}`, { apply_minimum: false });
  const off = await GET(`/bills/preview/${l.body.id}/${period}`);
  ok('refused with the minimum switched off too', off.status === 400,
     `status ${off.status}, water ${off.body && off.body.water_amount}`);
  await PUT(`/settings/period/${period}`, { apply_minimum: true });

  ok('the batch skips it and names the room',
     (await POST('/bills/batch', { period, unit_ids:[u.id] })).body.skipped[0].reason.includes('ไม่ครบ'));
  ok('and POST /bills refuses it', (await POST('/bills', { lease_id:l.body.id, period })).status === 400);
  await DEL(`/leases/${l.body.id}`);
}

section('deletion is blocked when history depends on it');
{
  const u = await newUnit('T13');
  const t = await newTenant('ผู้เช่า N');
  const l = await POST('/leases', { tenant_id:t.id, unit_id:u.id, start_date:'2026-01-01', monthly_rent:1000 });
  ok('a tenant with a lease cannot be deleted', (await DEL(`/tenants/${t.id}`)).status === 400);
  ok('a room with a lease cannot be deleted', (await DEL(`/units/${u.id}`)).status === 400);
  await POST('/readings', { unit_id:u.id, period, water_prev:0, water_curr:1, elec_prev:0, elec_curr:1 });
  const bill = await POST('/bills', { lease_id:l.body.id, period });
  ok('a lease with a bill cannot be deleted', (await DEL(`/leases/${l.body.id}`)).status === 400);
  await DEL(`/bills/${bill.body.id}`);
  ok('and can be once the bill is gone', (await DEL(`/leases/${l.body.id}`)).status === 204);

  const ft = (await GET('/fees/types')).body[0];
  const t2 = await newTenant('ผู้เช่า O');
  const l2 = await POST('/leases', { tenant_id:t2.id, unit_id:u.id, start_date:'2026-01-01', monthly_rent:1000 });
  await POST('/fees/lease', { lease_id:l2.body.id, fee_type_id: ft.id, amount: 100 });
  ok('a fee type in use cannot be deleted', (await DEL(`/fees/types/${ft.id}`)).status === 400);
  await DEL(`/leases/${l2.body.id}`);
}

section('cascade: a deleted lease takes its fees and charges with it');
{
  const u = await newUnit('T14');
  const t = await newTenant('ผู้เช่า P');
  const l = await POST('/leases', { tenant_id:t.id, unit_id:u.id, start_date:'2026-01-01', monthly_rent:1000 });
  const ft = (await GET('/fees/types')).body[0];
  await POST('/fees/lease', { lease_id:l.body.id, fee_type_id: ft.id, amount: 100 });
  await POST('/fees/onetime', { lease_id:l.body.id, period, description:'ทดสอบ', amount: 50 });
  ok('both are attached',
     (await GET(`/fees/lease/${l.body.id}`)).body.length === 1
     && (await GET(`/fees/onetime/${l.body.id}?period=${period}`)).body.length === 1);
  await DEL(`/leases/${l.body.id}`);
  ok('the recurring fee is gone', (await GET(`/fees/lease/${l.body.id}`)).body.length === 0);
  ok('the one-time charge is gone', (await GET(`/fees/onetime/${l.body.id}?period=${period}`)).body.length === 0);
}

section('percentage fees');
{
  const u = await newUnit('T15', 1000);
  const t = await newTenant('ผู้เช่า Q');
  const l = await POST('/leases', { tenant_id:t.id, unit_id:u.id, start_date:'2026-01-01', monthly_rent:1000 });
  await POST('/readings', { unit_id:u.id, period, water_prev:0, water_curr:8, elec_prev:0, elec_curr:8 });

  const zero = await POST('/fees/types', { name:'ทดสอบ ศูนย์', percent_of:'electricity', percent:0 });
  await POST('/fees/lease', { lease_id:l.body.id, fee_type_id:zero.body.id });
  made.types.push(zero.body.id);
  let pv = (await GET(`/bills/preview/${l.body.id}/${period}`)).body;
  ok('0% is a zero line, not an error', pv.items.some(i => i.label === 'ทดสอบ ศูนย์' && i.amount === 0),
     JSON.stringify(pv.items.map(i => [i.label, i.amount])));

  const util = await POST('/fees/types', { name:'ทดสอบ น้ำและไฟ', percent_of:'utilities', percent:50 });
  await POST('/fees/lease', { lease_id:l.body.id, fee_type_id:util.body.id });
  made.types.push(util.body.id);
  pv = (await GET(`/bills/preview/${l.body.id}/${period}`)).body;
  const utilLine = pv.items.find(i => i.label === 'ทดสอบ น้ำและไฟ');
  ok('utilities is water plus electricity',
     utilLine.amount === Math.round((pv.water_amount + pv.elec_amount) * 50 / 100 * 100) / 100,
     `${utilLine.amount} vs half of ${pv.water_amount}+${pv.elec_amount}`);

  const sub = await POST('/fees/types', { name:'ทดสอบ ยอดรวม', percent_of:'subtotal', percent:10 });
  await POST('/fees/lease', { lease_id:l.body.id, fee_type_id:sub.body.id });
  made.types.push(sub.body.id);
  pv = (await GET(`/bills/preview/${l.body.id}/${period}`)).body;
  const subLine = pv.items.find(i => i.label === 'ทดสอบ ยอดรวม');
  const base = pv.rent_amount + pv.water_amount + pv.elec_amount;
  ok('subtotal ignores the other shares entirely',
     subLine.amount === Math.round(base * 10 / 100 * 100) / 100,
     `${subLine.amount} vs 10% of ${base}`);
  ok('the shares are all in fees_amount',
     Math.abs(pv.fees_amount - (0 + utilLine.amount + subLine.amount)) < 0.005,
     `${pv.fees_amount}`);
  ok('and the total adds up',
     pv.total === Math.round((pv.rent_amount + pv.water_amount + pv.elec_amount + pv.fees_amount) * 100) / 100);

  ok('a percentage over 100 is allowed — it is a share, not a proportion',
     (await POST('/fees/types', { name:'ทดสอบ เกินร้อย', percent_of:'rent', percent:150 })).status === 201);
  ok('a negative percentage is refused',
     (await POST('/fees/types', { name:'ทดสอบ ติดลบ', percent_of:'rent', percent:-5 })).status === 400);
  await DEL(`/leases/${l.body.id}`);
}

section('input the routes should refuse');
{
  ok('a period like 2026-9', (await POST('/readings', { unit_id:1, period:'2026-9', water_prev:0, elec_prev:0 })).status === 400);
  ok('a period like September', (await GET('/bills/preview/1/September')).status === 400);
  ok('a batch with no rooms', (await POST('/bills/batch', { period, unit_ids: [] })).status === 400);
  ok('a negative base rent', (await POST('/units', { unit_number:'T99', base_rent:-1 })).status === 400);
  ok('a blank tenant name', (await POST('/tenants', { full_name:'   ' })).status === 400);
  ok('a meter with two digits', (await PUT('/settings', { water_meter_digits:2 })).status === 400);
  ok('a meter with nine digits', (await PUT('/settings', { water_meter_digits:9 })).status === 400);
  ok('a meter digit count of 4.5', (await PUT('/settings', { water_meter_digits:4.5 })).status === 400);
  ok('a setting that does not exist', (await PUT('/settings', { favourite_colour:'blue' })).status === 400);
  ok('an empty building name', (await PUT('/settings', { building_name:'' })).status === 400);
  ok('a bill for a lease that does not exist', (await GET(`/bills/preview/999999/${period}`)).status === 400);
  ok('a room number already in use',
     (await POST('/units', { unit_number:'T01', floor:9, base_rent:1 })).status === 400);
}

section('numeric settings come back as numbers, not text');
{
  await PUT('/settings', { water_rate: 9 });
  const s = (await GET('/settings')).body;
  ok('water_rate is a number', typeof s.water_rate === 'number', typeof s.water_rate);
  ok("and '9' + 1 would not have been '91'", s.water_rate + 1 === 10, String(s.water_rate + 1));
  ok('building_name is still text', typeof s.building_name === 'string');
}

// ---- clean up ----
// By name rather than by the ids collected along the way: a case that creates
// a fee type inline is easy to write and easy to forget to register, and the
section('a year of meters, in one request');
{
  const u = await newUnit('T24');
  const yr = period.slice(0, 4);
  await POST('/readings', { unit_id:u.id, period:`${yr}-03`,
    water_prev:100, water_curr:118, elec_prev:1000, elec_curr:1146 });
  // A dial that wrapped. usage() is the only place that knows what to do with
  // this, and the year endpoint has to be going through it rather than
  // subtracting the two numbers itself.
  await POST('/readings', { unit_id:u.id, period:`${yr}-04`,
    water_prev:9995, water_curr:12, water_rollover:10000,
    elec_prev:1146, elec_curr:1200 });
  // Entered but not finished — the checklist counts this as still to do.
  await POST('/readings', { unit_id:u.id, period:`${yr}-05`,
    water_prev:12, water_curr:null, elec_prev:1200, elec_curr:null });

  const y = await GET(`/readings/year/${yr}`);
  const room = y.body.rooms.find(r => r.unit_id === u.id);

  ok('every room is present', y.body.rooms.length >= 1);
  ok('and every month has a figure', room.water.length === 12 && room.elec.length === 12,
     `${room.water.length}/${room.elec.length}`);
  ok('a month that was read carries its usage', room.water[2] === 18 && room.elec[2] === 146,
     `${room.water[2]}/${room.elec[2]}`);
  ok('a wrapped dial is 17 units, not 12 — the rollover rule is not reimplemented',
     room.water[3] === 17, String(room.water[3]));
  ok('a half-entered month is 0 rather than null or negative',
     room.water[4] === 0 && room.elec[4] === 0, `${room.water[4]}/${room.elec[4]}`);
  ok('a month never read is 0', room.water[0] === 0 && room.elec[11] === 0);

  ok('the years on offer include this one', y.body.years.includes(yr), y.body.years.join(','));
  const empty = await GET('/readings/year/1999');
  ok('a year with nothing in it still answers, all zeros',
     empty.status === 200 && empty.body.rooms.every(r => r.water.every(v => v === 0)));
  ok('a year that is not a year is refused',
     (await GET('/readings/year/26')).status === 400);

  for(const r of (await GET(`/readings/history/${u.id}`)).body) await DEL(`/readings/${r.id}`);
}

section('the board mark is a note, not a rule');
{
  const u = await newUnit('T23');
  const t = await newTenant('ผู้เช่า จองห้อง');

  ok('a new room carries no mark', u.mark === null || u.mark === undefined, String(u.mark));
  ok('it can be marked จอง',
     (await PUT(`/units/${u.id}/mark`, { mark:'reserved' })).body.mark === 'reserved');
  ok('setting ล็อค replaces จอง rather than joining it',
     (await PUT(`/units/${u.id}/mark`, { mark:'locked' })).body.mark === 'locked');
  ok('null clears it', (await PUT(`/units/${u.id}/mark`, { mark:null })).body.mark === null);

  const bad = await PUT(`/units/${u.id}/mark`, { mark:'purple' });
  ok('a value nothing renders is refused rather than stored', bad.status === 400, String(bad.status));
  ok('and the room is left as it was',
     (await GET(`/units/${u.id}`)).body.mark === null);

  // The point of the whole thing: it colours a card and changes nothing else.
  await PUT(`/units/${u.id}/mark`, { mark:'locked' });
  const vac = (await GET('/units/vacant')).body;
  ok('a locked room is still counted as vacant', vac.some(x => x.id === u.id));
  const l = await POST('/leases', { tenant_id:t.id, unit_id:u.id,
    start_date:'2026-01-01', monthly_rent:1000 });
  ok('and somebody can still be moved into it', l.status === 201, String(l.status));
  ok('which clears the mark, because what it warned about has happened',
     (await GET(`/units/${u.id}`)).body.mark === null);
  await DEL(`/leases/${l.body.id}`);
}

section('the three sums taken at move-in are kept apart, and none is charged');
{
  const u = await newUnit('T21');
  const t = await newTenant('ผู้เช่า เงินประกัน');
  const l = await POST('/leases', { tenant_id:t.id, unit_id:u.id, start_date:'2026-01-01',
    monthly_rent:4000, deposit:8000, guarantee:4000, advance_rent:2000 });

  ok('each is stored as its own figure',
     l.body.deposit === 8000 && l.body.guarantee === 4000 && l.body.advance_rent === 2000,
     `${l.body.deposit}/${l.body.guarantee}/${l.body.advance_rent}`);

  // PUT /leases/:id already used ?? for deposit; the two new ones follow it.
  const bumped = await PUT(`/leases/${l.body.id}`, { monthly_rent: 4200 });
  ok('changing the rent leaves all three alone',
     bumped.body.deposit === 8000 && bumped.body.guarantee === 4000
       && bumped.body.advance_rent === 2000,
     `${bumped.body.deposit}/${bumped.body.guarantee}/${bumped.body.advance_rent}`);

  const zeroed = await PUT(`/leases/${l.body.id}`, { guarantee: 0 });
  ok('and one can be set to nothing without touching the others',
     zeroed.body.guarantee === 0 && zeroed.body.deposit === 8000
       && zeroed.body.advance_rent === 2000);

  // The point of the whole thing: recorded, never charged. buildBill reads
  // monthly_rent off a lease and nothing else.
  await POST('/readings', { unit_id:u.id, period, water_prev:0, water_curr:1, elec_prev:0, elec_curr:1 });
  const b = await POST('/bills', { lease_id:l.body.id, period });
  const printed = JSON.stringify((await GET(`/bills/${b.body.id}`)).body);
  ok('none of them reaches the bill',
     !printed.includes('8000') && !printed.includes('2000') && !printed.includes('guarantee'),
     printed.slice(0, 120));
  ok('and the bill charges the rent alone',
     b.body.rent_amount === 4200, String(b.body.rent_amount));
  await DEL(`/bills/${b.body.id}`);

  const omitted = await POST('/leases', { tenant_id:t.id, unit_id:(await newUnit('T22')).id,
    start_date:'2026-01-01', monthly_rent:1000 });
  ok('a lease that names none of them records zero, not null',
     omitted.body.deposit === 0 && omitted.body.guarantee === 0
       && omitted.body.advance_rent === 0,
     `${omitted.body.deposit}/${omitted.body.guarantee}/${omitted.body.advance_rent}`);
  await DEL(`/leases/${omitted.body.id}`);
  await DEL(`/leases/${l.body.id}`);
}

section('what a tenant record keeps, and what a partial update does to it');
{
  const full = {
    full_name: 'ผู้เช่า เก็บครบ', phone: '081-234-5678', id_card: '1103700123456',
    id_card_issued: '2019-04-12', id_card_expires: '2027-04-11',
    address: '12/3 ถ.สุขุมวิท', line_id: 'somchai_j',
    vehicle_plate: 'กข 1234 กรุงเทพฯ', note: 'ผู้ติดต่อฉุกเฉิน 089-999-1111',
  };
  const made1 = await POST('/tenants', full);
  made.tenants.push(made1.body.id);
  const id = made1.body.id;

  ok('every field survives the create',
     Object.keys(full).every(k => made1.body[k] === full[k]),
     Object.keys(full).filter(k => made1.body[k] !== full[k]).join(','));

  // The reason PUT tests the key rather than reading a value: this route used
  // to SET every column from the body, so a caller sending one field blanked
  // the rest. The edit dialog sends all of them, which is what hid it.
  const partial = await PUT(`/tenants/${id}`, { full_name: full.full_name, phone: '082-000-0000' });
  ok('a partial update writes the field it was given',
     partial.body.phone === '082-000-0000', partial.body.phone);
  ok('and leaves every field it was not given alone',
     ['id_card','id_card_issued','id_card_expires','address','line_id','vehicle_plate','note']
       .every(k => partial.body[k] === full[k]),
     ['id_card','id_card_issued','id_card_expires','address','line_id','vehicle_plate','note']
       .filter(k => partial.body[k] !== full[k]).join(','));

  // The other side of the same rule: absent keeps, present writes — including
  // an empty one, or a field could be filled in but never emptied.
  const cleared = await PUT(`/tenants/${id}`, { full_name: full.full_name, line_id: '', note: '' });
  ok('an empty string clears the field it names',
     cleared.body.line_id === null && cleared.body.note === null,
     `${cleared.body.line_id} / ${cleared.body.note}`);
  ok('and still leaves the others alone',
     cleared.body.vehicle_plate === full.vehicle_plate && cleared.body.address === full.address);

  ok('none of it reaches a bill', await (async () => {
    const u = await newUnit('T20');
    const l = await POST('/leases', { tenant_id:id, unit_id:u.id, start_date:'2026-01-01', monthly_rent:1000 });
    await POST('/readings', { unit_id:u.id, period, water_prev:0, water_curr:1, elec_prev:0, elec_curr:1 });
    const b = await POST('/bills', { lease_id:l.body.id, period });
    const printed = JSON.stringify((await GET(`/bills/${b.body.id}`)).body);
    const leaked = ['1103700123456','2027-04-11','กข 1234 กรุงเทพฯ','089-999-1111']
      .filter(v => printed.includes(v));
    await DEL(`/bills/${b.body.id}`);
    await DEL(`/leases/${l.body.id}`);
    return leaked.length === 0;
  })());

  ok('the name is still the only required field',
     (await POST('/tenants', { line_id: 'x' })).status === 400);
}

section('ออกใบเสร็จทุกห้อง refuses what it cannot do');
{
  ok('a period that is not a period is refused',
     (await POST('/receipts/batch', { period: 'กันยายน' })).status === 400);
  ok('and a missing one too',
     (await POST('/receipts/batch', {})).status === 400);
  // A month with no bills has nothing to issue against. Saying so names the
  // month, rather than reporting a successful run of nothing.
  const empty = await POST('/receipts/batch', { period: '2019-03' });
  ok('a month with no bills is refused by name', empty.status === 400
     && empty.body.error.includes('2019-03'), JSON.stringify(empty.body));
}

// second run then fails on the UNIQUE name rather than on anything real.
for(const f of (await GET('/fees/types?all=true')).body){
  if(f.name.startsWith('ทดสอบ')) await DEL(`/fees/types/${f.id}`);
}
for(const u of made.units){
  for(const r of (await GET(`/readings/history/${u}`)).body) await DEL(`/readings/${r.id}`);
  await DEL(`/units/${u}`);
}
for(const t of made.tenants) await DEL(`/tenants/${t}`);
await PUT('/settings', settingsBefore);

console.log(`\n${pass} passed, ${findings.length} failed`);
if(findings.length){ console.log('\nFINDINGS:'); findings.forEach(f => console.log('  - ' + f)); }
process.exit(findings.length ? 1 : 0);
