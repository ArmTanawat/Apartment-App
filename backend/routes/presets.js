// routes/presets.js — quick-pick buttons for one-time charges.
//
// A preset fills the add-charge form and nothing else; the charge itself is
// still POST /fees/onetime with the text and amount copied in. See the note on
// one_time_charge_presets in db.js.

const express = require('express');
const { db } = require('../db.js');

const router = express.Router();

const byId = id => db.prepare('SELECT * FROM one_time_charge_presets WHERE id = ?').get(id);

// Two active buttons with the same name would be two ways to pick one thing,
// and the screen could not tell the user which one they were editing.
function nameTaken(name, exceptId = null) {
  return db.prepare(`
    SELECT 1 FROM one_time_charge_presets
    WHERE is_active = 1 AND name = ? AND id IS NOT ?
  `).get(name, exceptId);
}

function check(name, amount) {
  if (typeof name !== 'string' || name.trim() === '') return 'ต้องใส่ชื่อรายการ';
  if (amount === undefined || amount === null || amount === '' || !Number.isFinite(Number(amount))) {
    return 'จำนวนเงินต้องเป็นตัวเลข';
  }
  return null;
}

// GET /charge-presets — the active ones, in button order
router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT * FROM one_time_charge_presets WHERE is_active = 1 ORDER BY sort_order, id
  `).all());
});

// POST /charge-presets — { name, default_amount }; goes on the end of the row
router.post('/', (req, res) => {
  const { name, default_amount } = req.body || {};
  const bad = check(name, default_amount);
  if (bad) return res.status(400).json({ error: bad });
  if (nameTaken(name.trim())) {
    return res.status(400).json({ error: `มีรายการด่วน "${name.trim()}" อยู่แล้ว` });
  }

  const last = db.prepare('SELECT MAX(sort_order) AS n FROM one_time_charge_presets WHERE is_active = 1').get().n;
  const result = db.prepare(`
    INSERT INTO one_time_charge_presets (name, default_amount, sort_order) VALUES (?, ?, ?)
  `).run(name.trim(), Number(default_amount), (last ?? -1) + 1);

  res.status(201).json(byId(result.lastInsertRowid));
});

// PUT /charge-presets/order — { ids: [3, 1, 2] }, every active preset once.
//
// Declared before /:id, or Express would read "order" as an id.
router.put('/order', (req, res) => {
  const ids = req.body && req.body.ids;
  const active = db.prepare('SELECT id FROM one_time_charge_presets WHERE is_active = 1').all().map(r => r.id);

  // The whole list rather than one move, so the order the screen shows is the
  // order that is saved. A list that misses one or repeats one was drawn from
  // a stale picture, and saving it would scramble the rest.
  if (!Array.isArray(ids) || ids.length !== active.length
      || new Set(ids).size !== ids.length || !ids.every(id => active.includes(id))) {
    return res.status(400).json({ error: 'ลำดับไม่ตรงกับรายการด่วนที่มีอยู่ ลองเปิดหน้านี้ใหม่' });
  }

  const write = db.transaction(() => {
    const stmt = db.prepare('UPDATE one_time_charge_presets SET sort_order = ? WHERE id = ?');
    ids.forEach((id, i) => stmt.run(i, id));
  });
  write();

  res.json(db.prepare(`
    SELECT * FROM one_time_charge_presets WHERE is_active = 1 ORDER BY sort_order, id
  `).all());
});

// PUT /charge-presets/4 — rename or reprice. Charges already made keep what
// was copied into them.
router.put('/:id', (req, res) => {
  const existing = byId(req.params.id);
  if (!existing || !existing.is_active) {
    return res.status(404).json({ error: 'ไม่พบรายการด่วนนี้' });
  }

  const body = req.body || {};
  const name = body.name ?? existing.name;
  const amount = body.default_amount ?? existing.default_amount;
  const bad = check(name, amount);
  if (bad) return res.status(400).json({ error: bad });
  if (nameTaken(name.trim(), existing.id)) {
    return res.status(400).json({ error: `มีรายการด่วน "${name.trim()}" อยู่แล้ว` });
  }

  db.prepare('UPDATE one_time_charge_presets SET name = ?, default_amount = ? WHERE id = ?')
    .run(name.trim(), Number(amount), existing.id);
  res.json(byId(existing.id));
});

// DELETE /charge-presets/4 — the button goes; the row is kept, inactive.
router.delete('/:id', (req, res) => {
  const result = db.prepare(`
    UPDATE one_time_charge_presets SET is_active = 0 WHERE id = ? AND is_active = 1
  `).run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'ไม่พบรายการด่วนนี้' });
  }
  res.status(204).send();
});

module.exports = router;
