// routes/bills.js — turning a month's data into a bill.
//
// Every amount is rounded and STORED. Nothing about a bill is recalculated on
// read. If the water rate changes next year, last year's bills must still show
// what was actually charged.

const express = require('express');
const db = require('../db.js');

const router = express.Router();

// Money rounding, in one place so every amount is treated identically.
const money = n => Math.round(n * 100) / 100;

// Works out one utility charge and the wording that explains it.
//
// Wording is what the tenant reads on the printed bill, so it is written in
// Thai with the figures carrying the rest. Labels are bilingual; the working
// stays Thai only, because a bilingual version of every line would double the
// length of the bill for no gain.
//
// With the minimum applied, the first `minUnits` are covered by a flat
// `minAmount`, and anything above that costs `rate` per unit:
//
//   3 units, threshold 5, flat 100, rate 9  ->  100
//   8 units, threshold 5, flat 100, rate 9  ->  100 + (3 x 9) = 127
//
// With it switched off for the month, the charge is simply units x rate.
function utilityCharge(used, rate, minUnits, minAmount, applyMinimum, meterFrom, meterTo, rolled) {
  const meter = `${meterFrom} → ${meterTo}${rolled ? " ครบรอบ" : ""}`;

  if (!applyMinimum) {
    return {
      amount: money(used * rate),
      detail: `${used} หน่วย × ${rate} บาท (${meter})`
    };
  }

  if (used <= minUnits) {
    return {
      amount: money(minAmount),
      detail: `${used} หน่วย — ขั้นต่ำ ${minAmount} บาท ครอบคลุม ${minUnits} หน่วย (${meter})`
    };
  }

  const extra = used - minUnits;
  return {
    amount: money(minAmount + extra * rate),
    detail: `${used} หน่วย — ${minAmount} บาท สำหรับ ${minUnits} หน่วยแรก แล้ว ${extra} × ${rate} (${meter})`
  };
}

// How many days are in a given YYYY-MM. Day 0 of the next month is the last
// day of this one, which avoids hardcoding month lengths or leap year rules.
function daysInPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

// GET /bills?period=2026-08 — bills for a month, or all bills
router.get('/', (req, res) => {
  const { period } = req.query;

  const sql = `
    SELECT
      b.*,
      t.full_name   AS tenant_name,
      u.unit_number AS unit_number
    FROM bills b
    JOIN leases l  ON l.id = b.lease_id
    JOIN tenants t ON t.id = l.tenant_id
    JOIN units u   ON u.id = l.unit_id
    ${period ? 'WHERE b.period = ?' : ''}
    ORDER BY b.period DESC, u.unit_number
  `;

  const bills = period
    ? db.prepare(sql).all(period)
    : db.prepare(sql).all();

  res.json(bills);
});

// GET /bills/5 — one bill with everything needed to display or print it
router.get('/:id', (req, res) => {
  const bill = db.prepare(`
    SELECT
      b.*,
      t.full_name   AS tenant_name,
      t.phone       AS tenant_phone,
      t.address     AS tenant_address,
      u.unit_number AS unit_number,
      u.floor       AS floor
    FROM bills b
    JOIN leases l  ON l.id = b.lease_id
    JOIN tenants t ON t.id = l.tenant_id
    JOIN units u   ON u.id = l.unit_id
    WHERE b.id = ?
  `).get(req.params.id);

  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }

  // The printable line items, exactly as they were when generated.
  bill.items = db.prepare(`
    SELECT label, detail, amount FROM bill_items
    WHERE bill_id = ? ORDER BY sort_order, id
  `).all(req.params.id);

  res.json(bill);
});

// GET /bills/preview/:leaseId/:period — what the bill WOULD be.
//
// Calculates without saving, so the numbers can be checked before committing.
// Shares its logic with POST below through buildBill().
router.get('/preview/:leaseId/:period', (req, res) => {
  const built = buildBill(req.params.leaseId, req.params.period, {
    prorate: req.query.prorate === 'true',
    prorateDays: req.query.days ? Number(req.query.days) : null
  });

  if (built.error) {
    return res.status(400).json({ error: built.error });
  }

  res.json({ ...built, is_preview: true });
});

// POST /bills — generate and save a bill
router.post('/', (req, res) => {
  const { lease_id, period } = req.body;

  if (!lease_id || !period) {
    return res.status(400).json({ error: 'Lease and period are required' });
  }

  const built = buildBill(lease_id, period, {
    prorate: req.body.prorate === true,
    prorateDays: req.body.prorate_days ?? null
  });
  if (built.error) {
    return res.status(400).json({ error: built.error });
  }

  // A bill plus its line items must be written together or not at all. If the
  // items failed halfway, a bill with a total but no breakdown would be left
  // behind. A transaction makes the whole block succeed or roll back as one.
  const save = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO bills (lease_id, period, rent_amount, water_amount, elec_amount, fees_amount, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      lease_id, period,
      built.rent_amount, built.water_amount, built.elec_amount,
      built.fees_amount, built.total
    );

    const billId = result.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO bill_items (bill_id, label, detail, amount, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    built.items.forEach((item, index) => {
      insertItem.run(billId, item.label, item.detail || null, item.amount, index);
    });

    return billId;
  });

  try {
    const billId = save();
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
    bill.items = db.prepare('SELECT label, detail, amount FROM bill_items WHERE bill_id = ? ORDER BY sort_order').all(billId);
    res.status(201).json(bill);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: `A bill for ${period} already exists for this tenant` });
    }
    throw err;
  }
});

// POST /bills/batch — generate bills for several rooms at once.
//
// Takes { period, unit_ids: [1, 2, 3] } — the frontend turns a range, a tick
// list, or select-all into that array, since all three produce the same thing.
//
// A room that cannot be billed does NOT stop the rest. Twenty rooms with two
// missing readings produces eighteen bills and names the two, because failing
// the whole run over one missing number would be miserable in real use.
router.post('/batch', (req, res) => {
  const { period, unit_ids, prorate } = req.body;

  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'Period must look like 2026-09' });
  }
  if (!Array.isArray(unit_ids) || unit_ids.length === 0) {
    return res.status(400).json({ error: 'Choose at least one room' });
  }

  const generated = [];
  const skipped = [];

  // The first and last day of the month, used to find every lease that ran
  // during it. A lease overlaps when it started on or before the month ended
  // and had not ended before the month began.
  const periodStart = `${period}-01`;
  const periodEnd = `${period}-${String(daysInPeriod(period)).padStart(2, '0')}`;

  for (const unitId of unit_ids) {
    const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(unitId);
    if (!unit) {
      skipped.push({ unit_id: unitId, unit_number: null, reason: 'Room not found' });
      continue;
    }

    // A room can have more than one lease in a month — a handover, where one
    // tenant leaves mid-month and the next moves in. Both are billed, each for
    // their own days. Taking a single lease here would silently miss one.
    //
    // end_date is the day the room became free, so a lease ending on the 1st
    // was not in the room during that month at all.
    const leases = db.prepare(`
      SELECT * FROM leases
      WHERE unit_id = ?
        AND start_date <= ?
        AND (end_date IS NULL OR end_date > ?)
      ORDER BY start_date
    `).all(unitId, periodEnd, periodStart);

    if (leases.length === 0) {
      skipped.push({ unit_id: unitId, unit_number: unit.unit_number, reason: 'No tenant' });
      continue;
    }

    for (const lease of leases) {
      // Never overwrite. The user deletes the old bill first if a correction
      // is needed, so a record is never destroyed without them asking.
      const existing = db.prepare('SELECT id FROM bills WHERE lease_id = ? AND period = ?')
        .get(lease.id, period);

      if (existing) {
        const who = db.prepare('SELECT full_name FROM tenants WHERE id = ?').get(lease.tenant_id);
        skipped.push({
          unit_id: unitId,
          unit_number: unit.unit_number,
          tenant_name: who ? who.full_name : null,
          reason: `Already billed for ${period}`,
          bill_id: existing.id
        });
        continue;
      }

      const built = buildBill(lease.id, period, { prorate: prorate === true });

      if (built.error) {
        skipped.push({ unit_id: unitId, unit_number: unit.unit_number, reason: built.error });
        continue;
      }

      // Each bill is its own transaction. One failure rolls back only that
      // bill, leaving every successful one intact.
      const save = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO bills (lease_id, period, rent_amount, water_amount, elec_amount, fees_amount, total)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          lease.id, period,
          built.rent_amount, built.water_amount, built.elec_amount,
          built.fees_amount, built.total
        );

        const billId = result.lastInsertRowid;
        const insertItem = db.prepare(`
          INSERT INTO bill_items (bill_id, label, detail, amount, sort_order)
          VALUES (?, ?, ?, ?, ?)
        `);
        built.items.forEach((item, index) => {
          insertItem.run(billId, item.label, item.detail || null, item.amount, index);
        });

        return billId;
      });

      try {
        const billId = save();
        generated.push({
          bill_id: billId,
          unit_number: unit.unit_number,
          tenant_name: built.tenant_name,
          total: built.total
        });
      } catch (err) {
        skipped.push({ unit_id: unitId, unit_number: unit.unit_number, reason: err.message });
      }
    }
  }

  res.status(201).json({
    period,
    generated_count: generated.length,
    skipped_count: skipped.length,
    generated,
    skipped
  });
});

// DELETE /bills/5 — for a bill generated by mistake.
// bill_items rows go with it via ON DELETE CASCADE.
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Bill not found' });
  }
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Shared calculation
// ---------------------------------------------------------------------------

// Gathers everything a bill needs and returns the finished figures.
// Used by both the preview and the save route so the two can never disagree —
// if this logic lived in both places, one would eventually drift.
function buildBill(leaseId, period, options = {}) {
  const { prorate = false, prorateDays = null } = options;

  if (!/^\d{4}-\d{2}$/.test(period)) {
    return { error: 'Period must look like 2026-08' };
  }

  const lease = db.prepare(`
    SELECT l.*, t.full_name AS tenant_name, u.unit_number, u.id AS unit_id
    FROM leases l
    JOIN tenants t ON t.id = l.tenant_id
    JOIN units u   ON u.id = l.unit_id
    WHERE l.id = ?
  `).get(leaseId);

  if (!lease) {
    return { error: 'That lease does not exist' };
  }

  const reading = db.prepare(`
    SELECT * FROM meter_readings WHERE unit_id = ? AND period = ?
  `).get(lease.unit_id, period);

  if (!reading) {
    return { error: `No meter reading entered for unit ${lease.unit_number} in ${period}` };
  }

  // Rates are read now and their result frozen onto the bill. A later rate
  // change will not touch this bill.
  // Settings are stored as text so the table can also hold the building's name.
  // Number() here keeps every figure below arithmetic rather than string
  // concatenation.
  const rates = {};
  db.prepare('SELECT key, value FROM settings').all()
    .forEach(row => { rates[row.key] = Number(row.value); });

  // Whether the minimum charge applies is decided per month. No row means the
  // month was never configured, and the default is to apply it.
  const periodRow = db.prepare('SELECT * FROM period_settings WHERE period = ?').get(period);
  const applyMinimum = periodRow ? periodRow.apply_minimum === 1 : true;

  // A dial that wrapped past its last digit adds its rollover here, so 9995
  // followed by 12 bills as 17 units rather than a negative.
  const waterUsed = (reading.water_curr + (reading.water_rollover || 0)) - reading.water_prev;
  const elecUsed  = (reading.elec_curr  + (reading.elec_rollover  || 0)) - reading.elec_prev;

  const water = utilityCharge(
    waterUsed,
    rates.water_rate, rates.water_min_units, rates.water_min_amount,
    applyMinimum, reading.water_prev, reading.water_curr, !!reading.water_rollover
  );

  const elec = utilityCharge(
    elecUsed,
    rates.electricity_rate, rates.electricity_min_units, rates.electricity_min_amount,
    applyMinimum, reading.elec_prev, reading.elec_curr, !!reading.elec_rollover
  );

  const water_amount = water.amount;
  const elec_amount  = elec.amount;

  // Rent is charged for the full month unless prorating was asked for. Full
  // month is the default because it is what nearly always happens.
  let rent_amount = money(lease.monthly_rent);
  let rentDetail = `ห้อง ${lease.unit_number}`;

  if (prorate) {
    const totalDays = daysInPeriod(period);
    const days = prorateDays ?? totalDays;

    if (days < 1 || days > totalDays) {
      return { error: `Days must be between 1 and ${totalDays} for ${period}` };
    }

    rent_amount = money(lease.monthly_rent / totalDays * days);
    rentDetail = `ห้อง ${lease.unit_number} — คิด ${days} จาก ${totalDays} วัน`;
  }

  const recurringFees = db.prepare(`
    SELECT lf.amount, ft.name
    FROM lease_fees lf
    JOIN fee_types ft ON ft.id = lf.fee_type_id
    WHERE lf.lease_id = ?
    ORDER BY ft.name
  `).all(leaseId);

  // Only charges filed under THIS period. Last month's repair does not reappear.
  const oneTimeCharges = db.prepare(`
    SELECT description, amount FROM one_time_charges
    WHERE lease_id = ? AND period = ?
    ORDER BY id
  `).all(leaseId, period);

  const fees_amount = money(
    recurringFees.reduce((sum, f) => sum + f.amount, 0) +
    oneTimeCharges.reduce((sum, c) => sum + c.amount, 0)
  );

  const total = money(rent_amount + water_amount + elec_amount + fees_amount);

  // The printable breakdown. `detail` carries the working so a tenant can see
  // where a number came from, not just the number.
  // Labels are bilingual because they are what the tenant reads on the printed
  // bill, and they are frozen into bill_items at this moment. Changing them
  // later would not touch a bill already generated.
  //
  // Fee names come from fee_types.name and one_time_charges.description, both
  // typed by the user — so those are bilingual only if typed that way.
  const items = [
    { label: 'ค่าเช่า Rent', detail: rentDetail, amount: rent_amount },
    { label: 'ค่าน้ำ Water', detail: water.detail, amount: water_amount },
    { label: 'ค่าไฟ Electricity', detail: elec.detail, amount: elec_amount },
    ...recurringFees.map(f => ({ label: f.name, detail: 'รายเดือน Monthly', amount: money(f.amount) })),
    ...oneTimeCharges.map(c => ({ label: c.description, detail: 'ครั้งเดียว One-time', amount: money(c.amount) }))
  ];

  return {
    lease_id: Number(leaseId),
    period,
    tenant_name: lease.tenant_name,
    unit_number: lease.unit_number,
    rent_amount,
    water_amount,
    elec_amount,
    fees_amount,
    total,
    water_used: waterUsed,
    elec_used: elecUsed,
    items
  };
}

module.exports = router;
