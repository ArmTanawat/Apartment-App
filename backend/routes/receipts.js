// routes/receipts.js — issuing the paper a tenant gets after they pay.
//
// A receipt is a document, not a payment record. Nothing here says money
// arrived; it says a numbered piece of paper was printed for a bill. Payment
// tracking is deliberately not in this program.

const express = require('express');
const db = require('../db.js');

const router = express.Router();

// Receipt numbers run as a count within the calendar year — 2026-0001,
// 2026-0002 — in the Gregorian year the periods everywhere else use.
//
// Assigned HERE, inside the same transaction as the insert, and never by the
// caller. Two receipts issued a second apart would otherwise read the highest
// number, both add one, and both write the same one.
//
// Padded to four digits so the text sorts the way the numbers do. A fifth
// digit still sorts correctly after 9999; a year that reaches it in this
// building would be a surprise of a different kind.
const issue = db.transaction((bill_id, note) => {
  const year = db.prepare(`SELECT strftime('%Y', 'now', 'localtime') AS y`).get().y;
  const last = db.prepare(`
    SELECT receipt_no FROM receipts WHERE receipt_no LIKE ? ORDER BY receipt_no DESC LIMIT 1
  `).get(`${year}-%`);

  const next = last ? Number(last.receipt_no.slice(year.length + 1)) + 1 : 1;
  const receipt_no = `${year}-${String(next).padStart(4, '0')}`;

  const result = db.prepare(`
    INSERT INTO receipts (bill_id, receipt_no, note) VALUES (?, ?, ?)
  `).run(bill_id, receipt_no, note || null);

  return result.lastInsertRowid;
});

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
router.get('/', (req, res) => {
  const { period } = req.query;
  const sql = `${withBill} ${period ? 'WHERE b.period = ?' : ''} ORDER BY r.receipt_no`;
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
  // make a second press of the button look like a failure, and issuing
  // another would put two numbers against one payment.
  const existing = db.prepare(`${withBill} WHERE r.bill_id = ?`).get(bill_id);
  if (existing) {
    return res.json(existing);
  }

  const id = issue(bill_id, note);
  res.status(201).json(db.prepare(`${withBill} WHERE r.id = ?`).get(id));
});

// PUT /receipts/:id — the note only.
//
// Not the number, not the bill, not the date. Everything else on a receipt is
// what was handed over.
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM receipts WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'ไม่พบใบเสร็จ' });
  }

  db.prepare('UPDATE receipts SET note = ? WHERE id = ?')
    .run(req.body.note ?? null, req.params.id);

  res.json(db.prepare(`${withBill} WHERE r.id = ?`).get(req.params.id));
});

// There is deliberately no DELETE. See CLAUDE.md: a receipt number, once
// issued, is spent. Deleting a row and inserting another would hand the same
// number out twice, which is the one thing a receipt book must never do.

module.exports = router;
