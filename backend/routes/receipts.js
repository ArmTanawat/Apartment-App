// routes/receipts.js — issuing the paper a tenant gets after they pay.
//
// A receipt is a document, not a payment record. Nothing here says money
// arrived; it says a piece of paper was printed for a bill. Payment tracking is
// deliberately not in this program.
//
// A receipt has no number and no figures of its own. It is the paper form of
// one bill: the room, the tenant, the period and every line come off the bill
// when the page is drawn. Two things follow from that, and they are the point
// of the design rather than side effects.
//
//   Issuing can be undone. DELETE removes the row and the bill goes back to
//   ยังไม่ได้ออก. Nothing has been spent, so nothing is lost by cancelling.
//
//   A corrected bill carries its receipt with it. Correcting a bill is a delete
//   and an insert, ON DELETE CASCADE takes the receipt with the old bill, and
//   the user issues again against the corrected figures. The tenant never ends
//   up holding paper the program disagrees with.

const express = require('express');
const db = require('../db.js');

const router = express.Router();

const withBill = `
  SELECT
    r.*,
    b.period, b.total,
    t.full_name   AS tenant_name,
    u.unit_number AS unit_number
  FROM receipts r
  JOIN bills b   ON b.id = r.bill_id
  JOIN leases l  ON l.id = b.lease_id
  JOIN tenants t ON t.id = l.tenant_id
  JOIN units u   ON u.id = l.unit_id
`;

// GET /receipts?period=2026-08 — the receipts for a month, for the print-all
// view. Filtered by the month the BILL is for, not the day the receipt was
// printed: a receipt for August handed over in September is an August receipt.
//
// Ordered by room, which is the order the bills list and the print-all use.
// There is no number to sort on any more, and issue order is not an order
// anybody looks for a receipt in.
router.get('/', (req, res) => {
  const { period } = req.query;
  const sql = `${withBill} ${period ? 'WHERE b.period = ?' : ''} ORDER BY u.unit_number`;
  res.json(period ? db.prepare(sql).all(period) : db.prepare(sql).all());
});

// POST /receipts — issue one for a bill.
router.post('/', (req, res) => {
  const { bill_id } = req.body;
  const note = req.body.note ?? null;

  if (!bill_id) {
    return res.status(400).json({ error: 'ต้องระบุบิล' });
  }

  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(bill_id);
  if (!bill) {
    return res.status(400).json({ error: 'ไม่พบบิล' });
  }

  // A bill already has one. Handing back the existing receipt is right: the
  // caller wanted the receipt for this bill and there it is. Refusing would
  // make a second press of the button look like a failure, and issuing another
  // would put two pieces of paper against one bill.
  const existing = db.prepare(`${withBill} WHERE r.bill_id = ?`).get(bill_id);
  if (existing) {
    return res.json(existing);
  }

  const result = db.prepare('INSERT INTO receipts (bill_id, note) VALUES (?, ?)')
    .run(bill_id, note);

  res.status(201).json(db.prepare(`${withBill} WHERE r.id = ?`).get(result.lastInsertRowid));
});

// PUT /receipts/:id — the note only.
//
// Not the bill and not the date. Everything else on a receipt is read off the
// bill when the page is drawn, so there is nothing else here to change.
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM receipts WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'ไม่พบใบเสร็จ' });
  }

  db.prepare('UPDATE receipts SET note = ? WHERE id = ?')
    .run(req.body.note ?? null, req.params.id);

  res.json(db.prepare(`${withBill} WHERE r.id = ?`).get(req.params.id));
});

// DELETE /receipts/:id — cancel one.
//
// The bill goes back to ยังไม่ได้ออก and can be issued again. This is what a
// receipt with no number buys: there is no document identity to strand, so
// cancelling costs nothing and a mis-press is recoverable.
//
// The note goes with it. It described this issuing, and there is no second
// issuing it would still be true of.
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM receipts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'ไม่พบใบเสร็จ' });
  }
  res.status(204).send();
});

module.exports = router;
