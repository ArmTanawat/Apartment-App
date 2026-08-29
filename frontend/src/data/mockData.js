/* mockData.js — the prototype's in-memory data, lifted unchanged from
   prototype/rooms.html (lines 394-506). It stands in for the API so the
   ported app runs and can be compared side by side with the original.

   Deleted in Phase 2, when every one of these arrays is replaced by the
   endpoint that already returns the same shape. */

export const TODAY = "2026-09-20";
// The month being worked on. One value shared by บันทึกมิเตอร์ and บิล, and
// used by the board only for its "still to do" note. Starts at the current
// month and never goes past it — nothing can be read or billed for a month
// that has not happened, and a reading typed into next month would be a
// data error that is hard to find later.
export const thisMonth = () => TODAY.slice(0, 7);

export const units = [
  {id:1, unit_number:"101", floor:1, base_rent:3900},
  {id:2, unit_number:"103", floor:1, base_rent:3900},
  {id:3, unit_number:"104", floor:1, base_rent:3900},
  {id:4, unit_number:"105", floor:1, base_rent:3900},
  {id:5, unit_number:"106", floor:1, base_rent:3900},
  {id:6, unit_number:"107", floor:1, base_rent:3900},
  {id:7, unit_number:"201", floor:2, base_rent:3800},
  {id:8, unit_number:"202", floor:2, base_rent:3800},
  {id:9, unit_number:"203", floor:2, base_rent:3800},
  {id:10,unit_number:"205", floor:2, base_rent:3800},
  {id:11,unit_number:"206", floor:2, base_rent:3800},
  {id:12,unit_number:"301", floor:3, base_rent:3700},
  {id:13,unit_number:"302", floor:3, base_rent:3700},
  {id:14,unit_number:"303", floor:3, base_rent:3700}
];
export const tenants = [
  {id:1, full_name:"นภา วงศ์ดี", phone:"081-234-5678", address:"12/3 ถ.สุขุมวิท กรุงเทพฯ"},
  {id:2, full_name:"วิชัย ทองสุข", phone:"082-111-2222"},
  {id:3, full_name:"สุดา แก้วใส", phone:"083-444-5555", address:"88 ถ.พระราม 4 กรุงเทพฯ"},
  {id:4, full_name:"ธนา พงษ์ไพร", phone:"084-777-8888"},
  {id:5, full_name:"พิมพ์ใจ ศรีวรรณ", phone:"085-999-0000"},
  {id:6, full_name:"เกษม บุญมา", phone:"086-321-6543"},
  {id:7, full_name:"จิรา สุขสันต์", phone:"087-246-8024"},
  {id:8, full_name:"ปรีชา ดวงแก้ว", phone:"088-135-7913", address:"7/9 ถ.รัชดา กรุงเทพฯ", id_card:"1234567890123"},
  {id:9, full_name:"บริษัท สวนพลู จำกัด", phone:"02-123-4567", address:"99 อาคารสวนพลู กรุงเทพฯ"}
];
export const leases = [
  {id:1, tenant_id:1, unit_id:1,  start_date:"2026-01-01", end_date:null, monthly_rent:3900, deposit:7800},
  {id:2, tenant_id:2, unit_id:2,  start_date:"2025-06-01", end_date:null, monthly_rent:3800, deposit:7600},
  {id:3, tenant_id:3, unit_id:4,  start_date:"2026-03-01", end_date:"2026-10-15", monthly_rent:3900, deposit:7800},
  {id:4, tenant_id:4, unit_id:6,  start_date:"2026-02-01", end_date:null, monthly_rent:3900, deposit:7800},
  {id:5, tenant_id:5, unit_id:7,  start_date:"2025-11-01", end_date:null, monthly_rent:3800, deposit:7600},
  {id:6, tenant_id:6, unit_id:9,  start_date:"2026-04-01", end_date:null, monthly_rent:3800, deposit:7600},
  {id:7, tenant_id:7, unit_id:12, start_date:"2026-01-15", end_date:null, monthly_rent:3700, deposit:7400},
  {id:8, tenant_id:8, unit_id:14, start_date:"2025-09-01", end_date:null, monthly_rent:3700, deposit:7400},
  {id:9,  tenant_id:9, unit_id:5,  start_date:"2026-02-01", end_date:null, monthly_rent:3900, deposit:7800},
  {id:10, tenant_id:9, unit_id:11, start_date:"2026-02-01", end_date:null, monthly_rent:3800, deposit:7600},
  {id:11, tenant_id:9, unit_id:13, start_date:"2026-02-01", end_date:null, monthly_rent:3700, deposit:7400}
];
export const readings = [
  {id:1, unit_id:1,  period:thisMonth(), water_prev:100, water_curr:112, elec_prev:500, elec_curr:640},
  {id:2, unit_id:4,  period:thisMonth(), water_prev:80,  water_curr:91,  elec_prev:420, elec_curr:505},
  {id:3, unit_id:7,  period:thisMonth(), water_prev:210, water_curr:224, elec_prev:880, elec_curr:1010},
  {id:4, unit_id:12, period:thisMonth(), water_prev:55,  water_curr:63,  elec_prev:300, elec_curr:388},
  // Last month, so the previous column has something to fill from.
  {id:11, unit_id:1,  period:"2026-08", water_prev:88,  water_curr:100, elec_prev:390, elec_curr:500},
  {id:12, unit_id:2,  period:"2026-08", water_prev:140, water_curr:151, elec_prev:600, elec_curr:702},
  {id:13, unit_id:4,  period:"2026-08", water_prev:70,  water_curr:80,  elec_prev:340, elec_curr:420},
  {id:14, unit_id:6,  period:"2026-08", water_prev:30,  water_curr:41,  elec_prev:180, elec_curr:265},
  {id:15, unit_id:7,  period:"2026-08", water_prev:198, water_curr:210, elec_prev:770, elec_curr:880},
  {id:16, unit_id:9,  period:"2026-08", water_prev:52,  water_curr:64,  elec_prev:250, elec_curr:341},
  {id:17, unit_id:12, period:"2026-08", water_prev:44,  water_curr:55,  elec_prev:210, elec_curr:300},
  {id:18, unit_id:14, period:"2026-08", water_prev:120, water_curr:133, elec_prev:520, elec_curr:618}
];

export const bills = [];
export const leaseFees = [
  {id:1, lease_id:1, fee_type_id:1, name:"ค่าส่วนกลาง Facility fee", amount:500},
  {id:2, lease_id:1, fee_type_id:3, name:"ที่จอดมอเตอร์ไซค์ Motorcycle parking", amount:300},
  {id:3, lease_id:5, fee_type_id:1, name:"ค่าส่วนกลาง Facility fee", amount:500},
  {id:4, lease_id:6, fee_type_id:2, name:"ที่จอดรถยนต์ Car parking", amount:500}
];
// Mirrors the settings table. Meter digits belong here rather than being
// inferred from a reading: a five-digit meter showing 500 looks like three.
export const settings = {
  building_name:"บ้านสวนพลู",
  building_address:"88/1 ซ.สวนพลู 4 ถ.สาทรใต้ กรุงเทพฯ 10120",
  building_phone:"02-123-4567",
  bank_name:"ธนาคารกสิกรไทย",
  bank_account_number:"123-4-56789-0",
  bank_account_name:"นายสมชาย ใจดี",
  bill_note:"ชำระภายในวันที่ 5 ของทุกเดือน · โอนแล้วส่งสลิปที่ไลน์ @baansuanplu",
  water_rate:9, water_min_units:5, water_min_amount:100,
  electricity_rate:9, electricity_min_units:5, electricity_min_amount:100,
  water_meter_digits:4, electricity_meter_digits:4
};

export const feeTypes = [
  {id:1, name:"ค่าส่วนกลาง Facility fee", default_amount:500, is_active:1},
  {id:2, name:"ที่จอดรถยนต์ Car parking", default_amount:500, is_active:1},
  {id:3, name:"ที่จอดมอเตอร์ไซค์ Motorcycle parking", default_amount:300, is_active:1}
];
export const charges = [
  {id:1, lease_id:1, period:thisMonth(), description:"ซ่อมก๊อกน้ำ Tap repair", amount:450}
];
// Mirrors GET /backups. Copies are made when the server starts and kept to a
// limit, so the page can show that it is actually happening.
export const backups = [
  {filename:"apartment-2026-09-20-0812.db", size_kb:96, created_at:"2026-09-20 08:12"},
  {filename:"apartment-2026-09-19-0755.db", size_kb:95, created_at:"2026-09-19 07:55"},
  {filename:"apartment-2026-09-18-0903.db", size_kb:95, created_at:"2026-09-18 09:03"},
  {filename:"apartment-2026-09-16-1140.db", size_kb:94, created_at:"2026-09-16 11:40"},
  {filename:"apartment-2026-09-15-0820.db", size_kb:94, created_at:"2026-09-15 08:20"}
];
export const BACKUP_KEEP = 30;

// Whether the minimum charge applies, decided per month for the whole building.
// A month with no entry defaults to applying it.
export const periodSettings = {};

export const nextId = {unit:100, tenant:100, lease:100, fee:100, charge:100, bill:100};
