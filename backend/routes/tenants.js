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
    return res.status(404).json({ error: 'Tenant not found' });
  }

  res.json(tenant);
});

// POST /tenants — create
router.post('/', (req, res) => {
  const { full_name, phone, id_card, address, note } = req.body;

  if (!full_name || full_name.trim() === '') {
    return res.status(400).json({ error: 'Full name is required' });
  }

  const result = db.prepare(`
    INSERT INTO tenants (full_name, phone, id_card, address, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(full_name.trim(), phone || null, id_card || null, address || null, note || null);

  const created = db.prepare('SELECT * FROM tenants WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /tenants/5 — update
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  const { full_name, phone, id_card, address, note } = req.body;

  if (!full_name || full_name.trim() === '') {
    return res.status(400).json({ error: 'Full name is required' });
  }

  db.prepare(`
    UPDATE tenants
    SET full_name = ?, phone = ?, id_card = ?, address = ?, note = ?
    WHERE id = ?
  `).run(full_name.trim(), phone || null, id_card || null, address || null, note || null, req.params.id);

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
      error: 'Cannot delete a tenant who has leases. End the lease instead.'
    });
  }

  const result = db.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  res.status(204).send();
});

module.exports = router;
