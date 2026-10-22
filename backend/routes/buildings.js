// routes/buildings.js — the chooser: list, add, open, close and delete buildings.
//
// The only router that works with no building open. Everything else is
// mounted behind requireBuilding in server.js. The work is in ../buildings.js;
// this file turns it into requests and status codes.

const express = require('express');
const buildings = require('../buildings.js');

const router = express.Router();

const send = (res, err) => {
  if (!err.status) throw err;
  res.status(err.status).json({ error: err.message });
};

// GET /buildings — every building, and which one is open (null on the chooser).
router.get('/', (req, res) => {
  const open = buildings.active();
  res.json({ buildings: buildings.list(), current: open ? open.id : null });
});

// POST /buildings — { name }. Makes the file with the default settings; does
// not open it. The screen opens it straight after.
router.post('/', (req, res) => {
  try {
    res.status(201).json(buildings.create(req.body?.name));
  } catch (err) { send(res, err); }
});

// POST /buildings/close — back to the chooser. Literal, so before /:id.
router.post('/close', (req, res) => {
  buildings.close();
  res.status(204).end();
});

// POST /buildings/:id/open — make this the building every other route uses.
router.post('/:id/open', (req, res) => {
  try {
    res.json(buildings.select(req.params.id));
  } catch (err) { send(res, err); }
});

// PUT /buildings/:id/look — { color, icon }, either or both, for the card on
// the chooser. Ids from building-look.js; anything else is refused.
router.put('/:id/look', (req, res) => {
  try {
    res.json(buildings.setLook(req.params.id, req.body || {}));
  } catch (err) { send(res, err); }
});

// DELETE /buildings/:id — { name }, typed by the user and required to match.
// The file is moved to buildings-deleted/, not erased.
router.delete('/:id', (req, res) => {
  try {
    buildings.remove(req.params.id, req.body?.name);
    res.status(204).end();
  } catch (err) { send(res, err); }
});

module.exports = router;
