// routes/units.js — every endpoint that deals with rooms.

const express = require('express');
const db = require('../db.js');

const router = express.Router();

// GET /units — list every room with its current occupancy.
//
// LEFT JOIN keeps rooms that have no matching lease. A plain JOIN would
// silently drop every empty room, which are exactly the ones being looked for.
// The join condition filters to the ACTIVE lease only, so a room whose old
// tenant moved out correctly shows as vacant.
router.get('/', (req, res) => {
  const units = db.prepare(`
    SELECT
      u.id,
      u.unit_number,
      u.floor,
      u.base_rent,
      t.id        AS tenant_id,
      t.full_name AS tenant_name,
      l.id        AS lease_id,
      l.end_date  AS leaving_on
    FROM units u
    LEFT JOIN leases l
      ON l.unit_id = u.id
      AND (l.end_date IS NULL OR l.end_date > date('now','localtime'))
    LEFT JOIN tenants t
      ON t.id = l.tenant_id
    ORDER BY u.floor, u.unit_number
  `).all();

  // tenant_name is null for an empty room, so it doubles as the occupancy flag.
  //
  // leaving_on carries a move-out already scheduled. Without it the board would
  // show a room as simply occupied right up to the day it empties, and there
  // would be no way to see which rooms are about to come free.
  const withStatus = units.map(u => ({
    ...u,
    is_occupied: u.tenant_name !== null,
    is_leaving: u.leaving_on !== null
  }));

  res.json(withStatus);
});

// GET /units/vacant — only the empty rooms.
//
// This must be declared BEFORE '/:id' below. Express matches routes top to
// bottom, and '/:id' would treat the word "vacant" as an id and try to look
// up a unit with id "vacant".
router.get('/vacant', (req, res) => {
  const vacant = db.prepare(`
    SELECT * FROM units
    WHERE id NOT IN (
      SELECT unit_id FROM leases
      WHERE end_date IS NULL OR end_date > date('now','localtime')
    )
    ORDER BY floor, unit_number
  `).all();

  res.json(vacant);
});

// GET /units/5
router.get('/:id', (req, res) => {
  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!unit) {
    return res.status(404).json({ error: 'ไม่พบห้อง' });
  }
  res.json(unit);
});

// POST /units
router.post('/', (req, res) => {
  const { unit_number, floor, base_rent } = req.body;

  if (!unit_number || unit_number.trim() === '') {
    return res.status(400).json({ error: 'ต้องใส่เลขห้อง' });
  }
  if (base_rent === undefined || base_rent === null || base_rent < 0) {
    return res.status(400).json({ error: 'ค่าเช่ามาตรฐานต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' });
  }

  // unit_number is UNIQUE in the schema, so a duplicate throws. Catching it
  // turns a raw SQLite error into a message that makes sense to the user.
  try {
    const result = db.prepare(`
      INSERT INTO units (unit_number, floor, base_rent) VALUES (?, ?, ?)
    `).run(unit_number.trim(), floor || null, base_rent);

    const created = db.prepare('SELECT * FROM units WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: `ห้อง ${unit_number} มีอยู่แล้ว` });
    }
    throw err;
  }
});

// PUT /units/5
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'ไม่พบห้อง' });
  }

  const { unit_number, floor, base_rent } = req.body;

  if (!unit_number || unit_number.trim() === '') {
    return res.status(400).json({ error: 'ต้องใส่เลขห้อง' });
  }
  if (base_rent === undefined || base_rent === null || base_rent < 0) {
    return res.status(400).json({ error: 'ค่าเช่ามาตรฐานต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' });
  }

  // Changing base_rent here affects only NEW leases. Existing leases keep the
  // monthly_rent copied at move-in, so no past bill is altered.
  try {
    db.prepare(`
      UPDATE units SET unit_number = ?, floor = ?, base_rent = ? WHERE id = ?
    `).run(unit_number.trim(), floor || null, base_rent, req.params.id);

    const updated = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: `ห้อง ${unit_number} มีอยู่แล้ว` });
    }
    throw err;
  }
});

// DELETE /units/5
router.delete('/:id', (req, res) => {
  const leaseCount = db.prepare('SELECT COUNT(*) AS count FROM leases WHERE unit_id = ?')
    .get(req.params.id).count;

  if (leaseCount > 0) {
    return res.status(400).json({
      error: 'ลบห้องนี้ไม่ได้ เพราะมีประวัติสัญญาเช่าอยู่ ถ้าไม่ใช้ห้องนี้แล้วให้ปล่อยว่างไว้แทน'
    });
  }

  const result = db.prepare('DELETE FROM units WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'ไม่พบห้อง' });
  }

  res.status(204).send();
});

module.exports = router;
