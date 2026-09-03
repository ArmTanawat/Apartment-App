import { API } from './api-base.mjs';
/* Empties the database and fills it with the same building the prototype's
 * mock data describes, so the React app can be compared against
 * archive/rooms.html side by side. Months are placed relative to today,
 * not hardcoded.
 *
 *   node server.js            # in backend/
 *   node smoke/seed.mjs       # in frontend/
 *
 * smoke/walk.jsx imports this first, so the walk starts from the same state
 * every time however many times it has been run before.
 */


const p2 = n => String(n).padStart(2, '0');
const d = new Date();
const today = `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
const cur = today.slice(0, 7);
const shift = (p, by) => { const [y,m] = p.split('-').map(Number);
  const x = new Date(y, m-1+by, 1); return `${x.getFullYear()}-${p2(x.getMonth()+1)}`; };
const prev = shift(cur, -1);
// A month or two out, for the room that has a move-out already scheduled.
const soon = `${shift(cur, 1)}-15`;
const ago = (months, day) => `${shift(cur, -months)}-${p2(day)}`;

async function call(method, path, body){
  const res = await fetch(API + path, {
    method, headers: {'Content-Type':'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body) });
  if(res.status === 204) return null;
  const out = await res.json().catch(() => null);
  if(!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${out && out.error}`);
  return out;
}

// Emptied in dependency order: a lease with bills cannot be deleted, and
// neither can a unit or a tenant with leases. Fees and charges go with their
// lease through ON DELETE CASCADE.
for(const b of await call('GET','/bills')){
  try { await call('DELETE', `/bills/${b.id}`); }
  catch (e) {
    // A bill with a receipt cannot be deleted, by design — so a database that
    // has been receipted cannot be cleared at all. That is the rule working
    // rather than a fault, and it deserves saying rather than a stack trace.
    console.error('\nล้างฐานข้อมูลนี้ไม่ได้ เพราะมีใบเสร็จที่ออกไปแล้ว');
    console.error(String(e.message));
    console.error('\nใบเสร็จยกเลิกไม่ได้ บิลที่ออกใบเสร็จแล้วจึงลบไม่ได้ด้วย');
    console.error('ถ้าต้องการข้อมูลตัวอย่างใหม่ ให้ปิดเซิร์ฟเวอร์ ลบไฟล์ backend/apartment.db');
    console.error('แล้วเปิดเซิร์ฟเวอร์ใหม่ ไฟล์จะถูกสร้างให้เอง จากนั้นค่อยรัน npm run seed');
    console.error('\nส่วน npm test ไม่ได้รับผลกระทบ — มันสร้างฐานข้อมูลชั่วคราวของตัวเองอยู่แล้ว\n');
    process.exit(1);
  }
}
for(const l of await call('GET','/leases')){
  for(const r of await call('GET',`/readings/history/${l.unit_id}`))
    await call('DELETE',`/readings/${r.id}`).catch(() => {});
  await call('DELETE',`/leases/${l.id}`);
}
for(const t of await call('GET','/tenants'))  await call('DELETE',`/tenants/${t.id}`);
for(const u of await call('GET','/units')){
  for(const r of await call('GET',`/readings/history/${u.id}`))
    await call('DELETE',`/readings/${r.id}`);
  await call('DELETE',`/units/${u.id}`);
}
// Fee types other than the three db.js seeds; those are kept and reused.
const KEEP_TYPES = ['ค่าส่วนกลาง Facility fee','ที่จอดรถยนต์ Car parking','ที่จอดมอเตอร์ไซค์ Motorcycle parking'];
for(const f of await call('GET','/fees/types?all=true')){
  if(!KEEP_TYPES.includes(f.name)) await call('DELETE',`/fees/types/${f.id}`).catch(() => {});
  else if(!f.is_active) await call('PUT',`/fees/types/${f.id}`,{is_active:1});
}
// The minimum charge applies by default; a walk may have switched it off.
await call('PUT',`/settings/period/${cur}`,{apply_minimum:true});
await call('PUT','/settings',{water_rate:9, water_min_units:5, water_min_amount:100,
  electricity_rate:9, electricity_min_units:5, electricity_min_amount:100,
  water_meter_digits:4, electricity_meter_digits:4});

const UNITS = [
  ["101",1,3900],["103",1,3900],["104",1,3900],["105",1,3900],["106",1,3900],["107",1,3900],
  ["201",2,3800],["202",2,3800],["203",2,3800],["205",2,3800],["206",2,3800],
  ["301",3,3700],["302",3,3700],["303",3,3700],
];
const TENANTS = [
  ["นภา วงศ์ดี","081-234-5678","12/3 ถ.สุขุมวิท กรุงเทพฯ",null],
  ["วิชัย ทองสุข","082-111-2222",null,null],
  ["สุดา แก้วใส","083-444-5555","88 ถ.พระราม 4 กรุงเทพฯ",null],
  ["ธนา พงษ์ไพร","084-777-8888",null,null],
  ["พิมพ์ใจ ศรีวรรณ","085-999-0000",null,null],
  ["เกษม บุญมา","086-321-6543",null,null],
  ["จิรา สุขสันต์","087-246-8024",null,null],
  ["ปรีชา ดวงแก้ว","088-135-7913","7/9 ถ.รัชดา กรุงเทพฯ","1234567890123"],
  ["บริษัท สวนพลู จำกัด","02-123-4567","99 อาคารสวนพลู กรุงเทพฯ",null],
];
// tenant index, unit index, start, end, rent, deposit
const LEASES = [
  [0, 0,  ago(8,1),  null, 3900, 7800],
  [1, 1,  ago(15,1), null, 3800, 7600],
  [2, 3,  ago(6,1),  soon, 3900, 7800],   // a move-out already scheduled
  [3, 5,  ago(7,1),  null, 3900, 7800],
  [4, 6,  ago(10,1), null, 3800, 7600],
  [5, 8,  ago(5,1),  null, 3800, 7600],
  [6, 11, ago(8,15), null, 3700, 7400],
  [7, 13, ago(12,1), null, 3700, 7400],
  [8, 4,  ago(7,1),  null, 3900, 7800],   // one tenant, three rooms
  [8, 10, ago(7,1),  null, 3800, 7600],
  [8, 12, ago(7,1),  null, 3700, 7400],
];
// unit index, water_prev, water_curr, elec_prev, elec_curr
const LAST_MONTH = [
  [0, 88,100, 390,500],[1,140,151, 600,702],[3, 70, 80, 340,420],[5, 30, 41, 180,265],
  [6,198,210, 770,880],[8, 52, 64, 250,341],[11,44, 55, 210,300],[13,120,133, 520,618],
];
const THIS_MONTH = [
  [0,100,112, 500,640],[3, 80, 91, 420,505],[6,210,224, 880,1010],[11,55, 63, 300,388],
];
// lease index, fee type name, amount
const FEES = [
  [0,"ค่าส่วนกลาง Facility fee",500],
  [0,"ที่จอดมอเตอร์ไซค์ Motorcycle parking",300],
  [4,"ค่าส่วนกลาง Facility fee",500],
  [5,"ที่จอดรถยนต์ Car parking",500],
];

const units = [];
for(const [unit_number, floor, base_rent] of UNITS)
  units.push(await call('POST','/units',{unit_number, floor, base_rent}));

const tenants = [];
for(const [full_name, phone, address, id_card] of TENANTS)
  tenants.push(await call('POST','/tenants',{full_name, phone, address, id_card}));

const leases = [];
for(const [t, u, start_date, end_date, monthly_rent, deposit] of LEASES)
  leases.push(await call('POST','/leases',{tenant_id:tenants[t].id, unit_id:units[u].id,
    start_date, end_date, monthly_rent, deposit}));

for(const [u, wp, wc, ep, ec] of LAST_MONTH)
  await call('POST','/readings',{unit_id:units[u].id, period:prev,
    water_prev:wp, water_curr:wc, elec_prev:ep, elec_curr:ec});
for(const [u, wp, wc, ep, ec] of THIS_MONTH)
  await call('POST','/readings',{unit_id:units[u].id, period:cur,
    water_prev:wp, water_curr:wc, elec_prev:ep, elec_curr:ec});

const types = await call('GET','/fees/types');
for(const [l, name, amount] of FEES){
  const ft = types.find(t => t.name === name);
  await call('POST','/fees/lease',{lease_id:leases[l].id, fee_type_id:ft.id, amount});
}

await call('POST','/fees/onetime',{lease_id:leases[0].id, period:cur,
  description:"ซ่อมก๊อกน้ำ Tap repair", amount:450});

await call('PUT','/settings',{
  building_name:"บ้านสวนพลู",
  building_address:"88/1 ซ.สวนพลู 4 ถ.สาทรใต้ กรุงเทพฯ 10120",
  building_phone:"02-123-4567",
  bank_name:"ธนาคารกสิกรไทย",
  bank_account_number:"123-4-56789-0",
  bank_account_name:"นายสมชาย ใจดี",
  bill_note:"ชำระภายในวันที่ 5 ของทุกเดือน · โอนแล้วส่งสลิปที่ไลน์ @baansuanplu",
});

// Two bills already issued, so the list and the staleness check have something
// to show without generating first.
for(const l of [leases[0].id, leases[4].id])
  await call('POST','/bills',{lease_id:l, period:cur});

console.log(`seeded: ${units.length} rooms, ${tenants.length} tenants, ${leases.length} leases`);
console.log(`months: ${prev} (closed) and ${cur} (working), today ${today}`);
