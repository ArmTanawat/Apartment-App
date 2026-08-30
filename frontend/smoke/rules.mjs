/* Product testing, backend rules.
 *
 * Not a regression suite — this goes after the rules in CLAUDE.md and
 * REQUIREMENTS.md and tries to break each one, including the boundary cases
 * the prose is careful about. It creates its own rooms so it can be run
 * against a seeded database and cleaned up afterwards.
 *
 *   node smoke/rules.mjs
 */
const A = 'http://localhost:3001';
const call = async (m, p, b) => {
  const r = await fetch(A + p, { method: m, headers: {'Content-Type':'application/json'},
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
