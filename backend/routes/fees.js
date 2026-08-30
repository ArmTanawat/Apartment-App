// routes/fees.js — three related things in one file:
//
//   fee_types        the catalogue of fees that can exist
//   lease_fees       recurring fees attached to a tenant, charged every month
//   one_time_charges a charge for a single month only, then gone
//
// The split between the last two matters. A motorcycle space recurs; a broken
// door does not. Putting a repair into lease_fees would quietly bill the tenant
// for that door every month afterwards.

const express = require('express');
const db = require('../db.js');
const { FEE_BASIS, FEE_BASIS_KEYS } = require('../fee-basis.js');

const router = express.Router();

// A fee is either a fixed amount or a share of something else on the bill.
// Returns a message when the pair does not make sense, or null when it does.
//
// percent_of is read with `in` rather than `??` wherever it is updated,
// because clearing it is a real action — turning a share back into a fixed
// fee. The same trap end_date has on PUT /leases/:id.
function checkPercent(percent_of, percent) {
  if (percent_of === null || percent_of === undefined) {
    return null;
  }
  if (!FEE_BASIS_KEYS.includes(percent_of)) {
    return `คิดตามเปอร์เซ็นต์ของ "${percent_of}" ไม่ได้`;
  }
  if (percent === null || percent === undefined || isNaN(percent) || percent < 0) {
    return 'เปอร์เซ็นต์ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fee types — the catalogue
// ---------------------------------------------------------------------------

// GET /fees/types — active types by default, ?all=true to include retired ones
// GET /fees/basis — what a percentage fee can be a percentage of.
//
// Served rather than written out again on the client, so the dropdown can
// never offer a basis the server would refuse. The labels come with it,
// because they are the same words that end up on the bill.
router.get('/basis', (req, res) => {
  res.json(FEE_BASIS);
});

router.get('/types', (req, res) => {
  const sql = req.query.all === 'true'
    ? 'SELECT * FROM fee_types ORDER BY name'
    : 'SELECT * FROM fee_types WHERE is_active = 1 ORDER BY name';

  res.json(db.prepare(sql).all());
});

// POST /fees/types — add a new kind of fee
router.post('/types', (req, res) => {
  const { name } = req.body;
  const percent_of = req.body.percent_of ?? null;
  const percent = req.body.percent ?? null;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'ต้องใส่ชื่อรายการ' });
  }

  const complaint = checkPercent(percent_of, percent);
  if (complaint) {
    return res.status(400).json({ error: complaint });
  }

  // A share has no fixed amount, so one is not asked for.
  const default_amount = percent_of ? 0 : req.body.default_amount;
  if (default_amount === undefined || default_amount === null || default_amount < 0) {
    return res.status(400).json({ error: 'ค่าตั้งต้นต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO fee_types (name, default_amount, percent_of, percent) VALUES (?, ?, ?, ?)
    `).run(name.trim(), default_amount, percent_of, percent_of ? percent : null);

    res.status(201).json(db.prepare('SELECT * FROM fee_types WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: `มีรายการชื่อ "${name}" อยู่แล้ว` });
    }
    throw err;
  }
});

// PUT /fees/types/3 — rename, reprice, or retire a fee type.
//
// Changing default_amount affects only fees added from now on. Existing
// lease_fees keep their own amount, so nobody's rent changes by accident.
router.put('/types/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM fee_types WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'ไม่พบประเภทค่าธรรมเนียมนี้' });
  }

  const name = req.body.name ?? existing.name;
  const is_active = req.body.is_active ?? existing.is_active;

  // Sending percent_of: null turns a share back into a fixed fee.
  const percent_of = 'percent_of' in req.body
    ? (req.body.percent_of || null) : existing.percent_of;
  const percent = 'percent' in req.body ? req.body.percent : existing.percent;

  const complaint = checkPercent(percent_of, percent);
  if (complaint) {
    return res.status(400).json({ error: complaint });
  }

  const default_amount = percent_of
    ? 0 : (req.body.default_amount ?? existing.default_amount);

  db.prepare(`
    UPDATE fee_types
    SET name = ?, default_amount = ?, is_active = ?, percent_of = ?, percent = ?
    WHERE id = ?
  `).run(name.trim(), default_amount, is_active ? 1 : 0,
         percent_of, percent_of ? percent : null, req.params.id);

  res.json(db.prepare('SELECT * FROM fee_types WHERE id = ?').get(req.params.id));
});

// DELETE /fees/types/3 — only when nothing has ever used it.
//
// A fee type in use is retired with is_active = 0 instead, so past bills keep
// their meaning. Deleting it would leave old records pointing at nothing.
router.delete('/types/:id', (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) AS count FROM lease_fees WHERE fee_type_id = ?')
    .get(req.params.id).count;

  if (inUse > 0) {
    return res.status(400).json({
      error: 'รายการนี้มีผู้เช่าใช้อยู่ ลบไม่ได้ ให้ปิดใช้งานแทน'
    });
  }

  const result = db.prepare('DELETE FROM fee_types WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'ไม่พบประเภทค่าธรรมเนียมนี้' });
  }

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Recurring fees on a lease
// ---------------------------------------------------------------------------

// GET /fees/lease/7 — what this tenant pays every month
// GET /fees/lease — every recurring fee on every lease.
//
// The settings screen needs to know which fee types are attached to somebody,
// because that is what decides whether a delete button is offered. Asking
// /fees/lease/:id once per lease answers the same question in as many
// requests.
//
// Declared before '/lease/:leaseId' so the bare path is not read as a lease id.
router.get('/lease', (req, res) => {
  const fees = db.prepare(`
    SELECT lf.id, lf.lease_id, lf.amount, lf.fee_type_id, lf.percent_of, lf.percent, ft.name
    FROM lease_fees lf
    JOIN fee_types ft ON ft.id = lf.fee_type_id
    ORDER BY lf.lease_id, ft.name
  `).all();
  res.json(fees);
});

router.get('/lease/:leaseId', (req, res) => {
  const fees = db.prepare(`
    SELECT lf.id, lf.amount, lf.fee_type_id, lf.percent_of, lf.percent, ft.name
    FROM lease_fees lf
    JOIN fee_types ft ON ft.id = lf.fee_type_id
    WHERE lf.lease_id = ?
    ORDER BY ft.name
  `).all(req.params.leaseId);

  res.json(fees);
});

// POST /fees/lease — attach a recurring fee to a tenant
router.post('/lease', (req, res) => {
  const { lease_id, fee_type_id, amount } = req.body;

  if (!lease_id || !fee_type_id) {
    return res.status(400).json({ error: 'ต้องระบุสัญญาเช่าและประเภทค่าธรรมเนียม' });
  }

  const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(lease_id);
  if (!lease) {
    return res.status(400).json({ error: 'ไม่พบสัญญาเช่านี้' });
  }

  const feeType = db.prepare('SELECT * FROM fee_types WHERE id = ?').get(fee_type_id);
  if (!feeType) {
    return res.status(400).json({ error: 'ไม่พบประเภทค่าธรรมเนียมนี้' });
  }

  // Amount is copied from the catalogue when not given, and stored on the row.
  // That is what allows a per-tenant discount without affecting anyone else.
  //
  // The percentage is copied for the same reason. Repricing a fee type must
  // not silently reprice every tenant already on it.
  const percent_of = 'percent_of' in req.body
    ? (req.body.percent_of || null) : feeType.percent_of;
  const percent = 'percent' in req.body ? req.body.percent : feeType.percent;

  const complaint = checkPercent(percent_of, percent);
  if (complaint) {
    return res.status(400).json({ error: complaint });
  }

  // A share works its amount out afresh each month, so the stored one is
  // not used and is kept at zero rather than left to look meaningful.
  const finalAmount = percent_of ? 0 : (amount ?? feeType.default_amount);

  try {
    const result = db.prepare(`
      INSERT INTO lease_fees (lease_id, fee_type_id, amount, percent_of, percent)
      VALUES (?, ?, ?, ?, ?)
    `).run(lease_id, fee_type_id, finalAmount, percent_of, percent_of ? percent : null);

    const created = db.prepare(`
      SELECT lf.id, lf.amount, lf.fee_type_id, lf.percent_of, lf.percent, ft.name
      FROM lease_fees lf JOIN fee_types ft ON ft.id = lf.fee_type_id
      WHERE lf.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: `ผู้เช่ารายนี้มี "${feeType.name}" อยู่แล้ว` });
    }
    throw err;
  }
});

// PUT /fees/lease/12 — change the amount of a recurring fee
router.put('/lease/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM lease_fees WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'ไม่พบค่าธรรมเนียมนี้' });
  }

  const percent_of = 'percent_of' in req.body
    ? (req.body.percent_of || null) : existing.percent_of;
  const percent = 'percent' in req.body ? req.body.percent : existing.percent;

  const complaint = checkPercent(percent_of, percent);
  if (complaint) {
    return res.status(400).json({ error: complaint });
  }

  const amount = percent_of ? 0 : (req.body.amount ?? existing.amount);
  if (amount < 0) {
    return res.status(400).json({ error: 'ยอดต้องไม่ติดลบ' });
  }

  db.prepare('UPDATE lease_fees SET amount = ?, percent_of = ?, percent = ? WHERE id = ?')
    .run(amount, percent_of, percent_of ? percent : null, req.params.id);

  res.json(db.prepare(`
    SELECT lf.id, lf.amount, lf.fee_type_id, lf.percent_of, lf.percent, ft.name
    FROM lease_fees lf JOIN fee_types ft ON ft.id = lf.fee_type_id
    WHERE lf.id = ?
  `).get(req.params.id));
});

// DELETE /fees/lease/12 — stop charging a recurring fee.
// Safe to delete: bills that already included it stored their own copy.
router.delete('/lease/:id', (req, res) => {
  const result = db.prepare('DELETE FROM lease_fees WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'ไม่พบค่าธรรมเนียมนี้' });
  }
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// One-time charges
// ---------------------------------------------------------------------------

// GET /fees/onetime/7?period=2026-08 — charges for a tenant, optionally one month
router.get('/onetime/:leaseId', (req, res) => {
  const { period } = req.query;

  const charges = period
    ? db.prepare('SELECT * FROM one_time_charges WHERE lease_id = ? AND period = ? ORDER BY id')
        .all(req.params.leaseId, period)
    : db.prepare('SELECT * FROM one_time_charges WHERE lease_id = ? ORDER BY period DESC, id')
        .all(req.params.leaseId);

  res.json(charges);
});

// POST /fees/onetime — add a charge for one month only
router.post('/onetime', (req, res) => {
  const { lease_id, period, description, amount } = req.body;

  if (!lease_id || !period || !description || description.trim() === '') {
    return res.status(400).json({ error: 'ต้องระบุสัญญาเช่า งวด และชื่อรายการ' });
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'งวดต้องอยู่ในรูปแบบ 2026-08' });
  }
  if (amount === undefined || amount === null || isNaN(amount)) {
    return res.status(400).json({ error: 'จำนวนเงินต้องเป็นตัวเลข' });
  }

  const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(lease_id);
  if (!lease) {
    return res.status(400).json({ error: 'ไม่พบสัญญาเช่านี้' });
  }

  // Deliberately no UNIQUE constraint here. Two separate repairs in the same
  // month are normal, and each should appear as its own line on the bill.
  const result = db.prepare(`
    INSERT INTO one_time_charges (lease_id, period, description, amount)
    VALUES (?, ?, ?, ?)
  `).run(lease_id, period, description.trim(), amount);

  res.status(201).json(db.prepare('SELECT * FROM one_time_charges WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /fees/onetime/4
router.put('/onetime/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM one_time_charges WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'ไม่พบค่าใช้จ่ายนี้' });
  }

  const description = req.body.description ?? existing.description;
  const amount = req.body.amount ?? existing.amount;
  const period = req.body.period ?? existing.period;

  db.prepare(`
    UPDATE one_time_charges SET description = ?, amount = ?, period = ? WHERE id = ?
  `).run(description.trim(), amount, period, req.params.id);

  res.json(db.prepare('SELECT * FROM one_time_charges WHERE id = ?').get(req.params.id));
});

// DELETE /fees/onetime/4
router.delete('/onetime/:id', (req, res) => {
  const result = db.prepare('DELETE FROM one_time_charges WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'ไม่พบค่าใช้จ่ายนี้' });
  }
  res.status(204).send();
});

module.exports = router;
