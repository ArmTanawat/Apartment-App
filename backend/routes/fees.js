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

const router = express.Router();

// ---------------------------------------------------------------------------
// Fee types — the catalogue
// ---------------------------------------------------------------------------

// GET /fees/types — active types by default, ?all=true to include retired ones
router.get('/types', (req, res) => {
  const sql = req.query.all === 'true'
    ? 'SELECT * FROM fee_types ORDER BY name'
    : 'SELECT * FROM fee_types WHERE is_active = 1 ORDER BY name';

  res.json(db.prepare(sql).all());
});

// POST /fees/types — add a new kind of fee
router.post('/types', (req, res) => {
  const { name, default_amount } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Fee name is required' });
  }
  if (default_amount === undefined || default_amount === null || default_amount < 0) {
    return res.status(400).json({ error: 'Default amount must be a positive number' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO fee_types (name, default_amount) VALUES (?, ?)
    `).run(name.trim(), default_amount);

    res.status(201).json(db.prepare('SELECT * FROM fee_types WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: `A fee called "${name}" already exists` });
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
    return res.status(404).json({ error: 'Fee type not found' });
  }

  const name = req.body.name ?? existing.name;
  const default_amount = req.body.default_amount ?? existing.default_amount;
  const is_active = req.body.is_active ?? existing.is_active;

  db.prepare(`
    UPDATE fee_types SET name = ?, default_amount = ?, is_active = ? WHERE id = ?
  `).run(name.trim(), default_amount, is_active ? 1 : 0, req.params.id);

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
      error: 'This fee is in use. Set it to inactive instead of deleting it.'
    });
  }

  const result = db.prepare('DELETE FROM fee_types WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Fee type not found' });
  }

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Recurring fees on a lease
// ---------------------------------------------------------------------------

// GET /fees/lease/7 — what this tenant pays every month
router.get('/lease/:leaseId', (req, res) => {
  const fees = db.prepare(`
    SELECT lf.id, lf.amount, lf.fee_type_id, ft.name
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
    return res.status(400).json({ error: 'Lease and fee type are required' });
  }

  const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(lease_id);
  if (!lease) {
    return res.status(400).json({ error: 'That lease does not exist' });
  }

  const feeType = db.prepare('SELECT * FROM fee_types WHERE id = ?').get(fee_type_id);
  if (!feeType) {
    return res.status(400).json({ error: 'That fee type does not exist' });
  }

  // Amount is copied from the catalogue when not given, and stored on the row.
  // That is what allows a per-tenant discount without affecting anyone else.
  const finalAmount = amount ?? feeType.default_amount;

  try {
    const result = db.prepare(`
      INSERT INTO lease_fees (lease_id, fee_type_id, amount) VALUES (?, ?, ?)
    `).run(lease_id, fee_type_id, finalAmount);

    const created = db.prepare(`
      SELECT lf.id, lf.amount, lf.fee_type_id, ft.name
      FROM lease_fees lf JOIN fee_types ft ON ft.id = lf.fee_type_id
      WHERE lf.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: `This tenant already has "${feeType.name}"` });
    }
    throw err;
  }
});

// PUT /fees/lease/12 — change the amount of a recurring fee
router.put('/lease/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM lease_fees WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Fee not found' });
  }

  const amount = req.body.amount ?? existing.amount;
  if (amount < 0) {
    return res.status(400).json({ error: 'Amount cannot be negative' });
  }

  db.prepare('UPDATE lease_fees SET amount = ? WHERE id = ?').run(amount, req.params.id);

  res.json(db.prepare(`
    SELECT lf.id, lf.amount, lf.fee_type_id, ft.name
    FROM lease_fees lf JOIN fee_types ft ON ft.id = lf.fee_type_id
    WHERE lf.id = ?
  `).get(req.params.id));
});

// DELETE /fees/lease/12 — stop charging a recurring fee.
// Safe to delete: bills that already included it stored their own copy.
router.delete('/lease/:id', (req, res) => {
  const result = db.prepare('DELETE FROM lease_fees WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Fee not found' });
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
    return res.status(400).json({ error: 'Lease, period, and description are required' });
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'Period must look like 2026-08' });
  }
  if (amount === undefined || amount === null || isNaN(amount)) {
    return res.status(400).json({ error: 'Amount must be a number' });
  }

  const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(lease_id);
  if (!lease) {
    return res.status(400).json({ error: 'That lease does not exist' });
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
    return res.status(404).json({ error: 'Charge not found' });
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
    return res.status(404).json({ error: 'Charge not found' });
  }
  res.status(204).send();
});

module.exports = router;
