// routes/tenants.js — every endpoint that deals with tenants.

const express = require('express');
const db = require('../db.js'); // ../ means "go up one folder" to find db.js

// A Router is a mini Express app. It collects routes here, and server.js
// mounts the whole group under a prefix. Note the paths below are '/' and
// '/:id', not '/tenants' — the prefix is added when it is mounted.
const router = express.Router();

// GET /tenants — list everyone
router.get('/', (req, res) => {
  const tenants = db.prepare('SELECT * FROM tenants ORDER BY full_name').all();
  res.json(tenants);
});

// GET /tenants/5 — one tenant
router.get('/:id', (req, res) => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);

  // .get() returns undefined when nothing matches. Without this check the
  // response would be an empty body with a 200 status, which looks like success.
  if (!tenant) {
    return res.status(404).json({ error: 'ไม่พบผู้เช่า' });
  }

  res.json(tenant);
});

// Everything about a tenant except their name. Listed once so the insert, the
// update and the columns cannot drift apart as more are added.
const OPTIONAL = ['phone', 'id_card', 'id_card_issued', 'id_card_expires',
                  'address', 'line_id', 'vehicle_plate', 'note'];

// POST /tenants — create
router.post('/', (req, res) => {
  const { full_name } = req.body;

  if (!full_name || full_name.trim() === '') {
    return res.status(400).json({ error: 'ต้องใส่ชื่อ' });
  }

  const result = db.prepare(`
    INSERT INTO tenants (full_name, ${OPTIONAL.join(', ')})
    VALUES (?, ${OPTIONAL.map(() => '?').join(', ')})
  `).run(full_name.trim(), ...OPTIONAL.map(k => req.body[k] || null));

  const created = db.prepare('SELECT * FROM tenants WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /tenants/5 — update
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'ไม่พบผู้เช่า' });
  }

  const { full_name } = req.body;

  if (!full_name || full_name.trim() === '') {
    return res.status(400).json({ error: 'ต้องใส่ชื่อ' });
  }

  // A key that is present is written, empty string included, so a field can be
  // cleared. A key that is absent keeps what is there. The `in` test rather
  // than `??` is what makes both possible, the same way `end_date` works on
  // PUT /leases/:id — and it matters more here than it looks: this route used
  // to SET every column from the body, so a caller sending only a new phone
  // number silently blanked the note beside it.
  const value = k => (k in req.body ? (req.body[k] || null) : existing[k]);

  db.prepare(`
    UPDATE tenants
    SET full_name = ?, ${OPTIONAL.map(k => `${k} = ?`).join(', ')}
    WHERE id = ?
  `).run(full_name.trim(), ...OPTIONAL.map(value), req.params.id);

  const updated = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /tenants/5
router.delete('/:id', (req, res) => {
  // A tenant with leases must not be deleted — their billing history
  // points back to them. Blocking it here gives a clear message instead
  // of a raw foreign key error from SQLite.
  const leaseCount = db.prepare('SELECT COUNT(*) AS count FROM leases WHERE tenant_id = ?')
    .get(req.params.id).count;

  if (leaseCount > 0) {
    return res.status(400).json({
      error: 'ลบผู้เช่ารายนี้ไม่ได้ เพราะมีสัญญาเช่าอยู่ในระบบ ถ้าย้ายออกไปแล้วให้ใช้ปุ่มย้ายออกแทน'
    });
  }

  const result = db.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'ไม่พบผู้เช่า' });
  }

  res.status(204).send();
});

module.exports = router;
