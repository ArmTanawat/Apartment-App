// routes/leases.js — moving tenants in and out of rooms.

const express = require('express');
const db = require('../db.js');

const router = express.Router();

// A lease is "active" when it has no end date, or the end date is still ahead.
// This exact condition appears in several queries, so it lives in one constant
// to guarantee every check agrees. If the rule ever changes, it changes here.
const ACTIVE_CONDITION = `(end_date IS NULL OR end_date > date('now','localtime'))`;

// GET /leases — every lease, with tenant and unit names joined in.
//
// Plain JOIN is correct here (not LEFT JOIN): a lease always has a tenant and
// a unit, enforced by NOT NULL plus the foreign keys. There are no orphans to
// preserve, so there is nothing for a LEFT JOIN to rescue.
router.get('/', (req, res) => {
  const leases = db.prepare(`
    SELECT
      l.*,
      t.full_name   AS tenant_name,
      t.phone       AS tenant_phone,
      u.unit_number AS unit_number,
      u.floor       AS floor
    FROM leases l
    JOIN tenants t ON t.id = l.tenant_id
    JOIN units   u ON u.id = l.unit_id
    ORDER BY u.floor, u.unit_number
  `).all();

  const withStatus = leases.map(l => ({
    ...l,
    is_active: l.end_date === null || l.end_date > new Date().toISOString().slice(0, 10)
  }));

  res.json(withStatus);
});

// GET /leases/active — only current residents.
// Declared before '/:id' so the word "active" is not read as an id.
router.get('/active', (req, res) => {
  const leases = db.prepare(`
    SELECT
      l.*,
      t.full_name   AS tenant_name,
      t.phone       AS tenant_phone,
      u.unit_number AS unit_number,
      u.floor       AS floor
    FROM leases l
    JOIN tenants t ON t.id = l.tenant_id
    JOIN units   u ON u.id = l.unit_id
    WHERE ${ACTIVE_CONDITION.replace(/end_date/g, 'l.end_date')}
    ORDER BY u.floor, u.unit_number
  `).all();

  res.json(leases);
});

// GET /leases/5 — one lease, with its attached fees.
router.get('/:id', (req, res) => {
  const lease = db.prepare(`
    SELECT
      l.*,
      t.full_name   AS tenant_name,
      t.phone       AS tenant_phone,
      u.unit_number AS unit_number,
      u.floor       AS floor
    FROM leases l
    JOIN tenants t ON t.id = l.tenant_id
    JOIN units   u ON u.id = l.unit_id
    WHERE l.id = ?
  `).get(req.params.id);

  if (!lease) {
    return res.status(404).json({ error: 'Lease not found' });
  }

  // The add-on fees for this lease, with the fee name joined in so the
  // response is readable without a second request.
  lease.fees = db.prepare(`
    SELECT lf.id, lf.amount, ft.name
    FROM lease_fees lf
    JOIN fee_types ft ON ft.id = lf.fee_type_id
    WHERE lf.lease_id = ?
  `).all(req.params.id);

  res.json(lease);
});

// POST /leases — move a tenant into a room.
router.post('/', (req, res) => {
  const { tenant_id, unit_id, start_date, end_date, monthly_rent, deposit } = req.body;

  if (!tenant_id || !unit_id || !start_date) {
    return res.status(400).json({ error: 'Tenant, unit, and start date are required' });
  }

  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenant_id);
  if (!tenant) {
    return res.status(400).json({ error: 'That tenant does not exist' });
  }

  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(unit_id);
  if (!unit) {
    return res.status(400).json({ error: 'That unit does not exist' });
  }

  // THE DOUBLE-BOOKING CHECK.
  //
  // end_date means THE DAY THE ROOM BECOMES FREE, not the last night slept.
  // A lease ending on the 16th and one starting on the 16th do not overlap.
  // Every date comparison in the app has to agree on this or the board will
  // show a room as vacant while this check refuses to let anyone move in.
  //
  // The test is overlap, not "is anyone here today". Checking today would let
  // a lease start in the middle of someone else's stay.
  const newEnd = end_date || null;

  const occupied = db.prepare(`
    SELECT l.id, l.start_date, l.end_date, t.full_name
    FROM leases l
    JOIN tenants t ON t.id = l.tenant_id
    WHERE l.unit_id = ?
      AND (l.end_date IS NULL OR l.end_date > ?)
      AND (? IS NULL OR l.start_date < ?)
  `).get(unit_id, start_date, newEnd, newEnd);

  if (occupied) {
    const until = occupied.end_date ? ` (ถึง ${occupied.end_date})` : '';
    return res.status(400).json({
      error: `Unit ${unit.unit_number} is already rented to ${occupied.full_name}${until}`
    });
  }

  // Rent falls back to the unit's standard price. The value is COPIED onto the
  // lease rather than referenced, so a later change to units.base_rent leaves
  // this tenant and every past bill untouched.
  const rent = monthly_rent !== undefined && monthly_rent !== null
    ? monthly_rent
    : unit.base_rent;

  const result = db.prepare(`
    INSERT INTO leases (tenant_id, unit_id, start_date, end_date, monthly_rent, deposit)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tenant_id, unit_id, start_date, newEnd, rent, deposit || 0);

  const created = db.prepare('SELECT * FROM leases WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /leases/5/end — move a tenant out.
//
// This is a separate endpoint rather than a general update because ending a
// lease is a distinct real-world action, not an edit. Naming it that way makes
// the frontend button obvious and prevents an accidental blank end_date.
router.put('/:id/end', (req, res) => {
  const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id);
  if (!lease) {
    return res.status(404).json({ error: 'Lease not found' });
  }

  const end_date = req.body.end_date || new Date().toISOString().slice(0, 10);

  if (end_date < lease.start_date) {
    return res.status(400).json({ error: 'End date cannot be before the start date' });
  }

  db.prepare('UPDATE leases SET end_date = ? WHERE id = ?').run(end_date, req.params.id);

  const updated = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// PUT /leases/5 — correct the details of a lease.
router.put('/:id', (req, res) => {
  const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id);
  if (!lease) {
    return res.status(404).json({ error: 'Lease not found' });
  }

  const { start_date, end_date, monthly_rent, deposit } = req.body;

  if (end_date && end_date < (start_date || lease.start_date)) {
    return res.status(400).json({ error: 'End date cannot be before the start date' });
  }

  // Only the fields supplied are changed; anything omitted keeps its old value.
  //
  // end_date is checked with `in` rather than `??` because clearing it is a
  // real action — cancelling a scheduled move-out. With `??`, sending null
  // would be read as "not supplied" and the old date would stay, leaving no
  // way to undo a move-out entered by mistake.
  const nextEnd = 'end_date' in req.body ? (end_date || null) : lease.end_date;

  db.prepare(`
    UPDATE leases
    SET start_date = ?, end_date = ?, monthly_rent = ?, deposit = ?
    WHERE id = ?
  `).run(
    start_date   ?? lease.start_date,
    nextEnd,
    monthly_rent ?? lease.monthly_rent,
    deposit      ?? lease.deposit,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /leases/5 — for correcting a lease created by mistake.
// Ending a lease is the normal action; deleting removes it from history.
router.delete('/:id', (req, res) => {
  const billCount = db.prepare('SELECT COUNT(*) AS count FROM bills WHERE lease_id = ?')
    .get(req.params.id).count;

  if (billCount > 0) {
    return res.status(400).json({
      error: 'Cannot delete a lease that has bills. End the lease instead.'
    });
  }

  const result = db.prepare('DELETE FROM leases WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Lease not found' });
  }

  res.status(204).send();
});

module.exports = router;
