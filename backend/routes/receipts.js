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

// POST /receipts/batch — issue one for every bill of a month that has none.
//
// Declared before the '/:id' routes below. Nothing routed by POST would catch
// 'batch' as an id today, but the literal-before-parameterised rule is cheap
// to keep and silent to break.
//
// A month's rent is usually collected in one sitting, and issuing forty
// receipts one dialog at a time is the whole of an afternoon. What the batch
// does not do is decide anything the single route would not: a bill that
// already has a receipt is skipped rather than given a second one, and the
// skipped list says so by room.
//
// No note is written. A note describes one payment — "จ่ายสดที่สำนักงาน" —
// and there is nothing a batch could put there that would be true of all of
// them. They are typed afterwards on the receipts that need one.
//
// Whether the tenant has actually paid is not a question this route can ask.
// It is asked on the screen, once, before the button is pressed.
router.post('/batch', (req, res) => {
  const { period } = req.body;

  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'งวดต้องอยู่ในรูปแบบ 2026-09' });
  }

  // Ordered by room, like GET above and like the list the button sits under.
  const bills = db.prepare(`
    SELECT b.id, b.total,
           u.unit_number  AS unit_number,
           t.full_name    AS tenant_name,
           r.id           AS receipt_id
    FROM bills b
    JOIN leases l   ON l.id = b.lease_id
    JOIN tenants t  ON t.id = l.tenant_id
    JOIN units u    ON u.id = l.unit_id
    LEFT JOIN receipts r ON r.bill_id = b.id
    WHERE b.period = ?
    ORDER BY u.unit_number
  `).all(period);

  if (bills.length === 0) {
    return res.status(400).json({ error: `งวด ${period} ยังไม่มีบิล จึงยังออกใบเสร็จไม่ได้` });
  }

  const issued = [];
  const skipped = [];
  const insert = db.prepare('INSERT INTO receipts (bill_id, note) VALUES (?, NULL)');

  // One room failing must not stop the rest — eighteen receipts and two named
  // problems beats nothing at all and one error message.
  for (const b of bills) {
    const row = { bill_id: b.id, unit_number: b.unit_number, tenant_name: b.tenant_name };

    if (b.receipt_id) {
      skipped.push({ ...row, reason: 'ออกใบเสร็จไปแล้ว', receipt_id: b.receipt_id });
      continue;
    }

    try {
      const result = insert.run(b.id);
      issued.push({ ...row, receipt_id: result.lastInsertRowid, total: b.total });
    } catch (err) {
      skipped.push({ ...row, reason: err.message });
    }
  }

  res.status(201).json({
    period,
    issued_count: issued.length,
    skipped_count: skipped.length,
    issued,
    skipped
  });
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
