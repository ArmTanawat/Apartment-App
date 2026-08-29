// routes/settings.js — utility rates, minimum charges, and the monthly switch.

const express = require('express');
const db = require('../db.js');

const router = express.Router();

// Only these keys may be written. Without the list, a typo like "water_rat"
// would insert a new row that nothing reads, and the bill would silently keep
// using the old value with no error anywhere.
const NUMERIC_KEYS = [
  'water_rate',
  'water_min_units',
  'water_min_amount',
  'electricity_rate',
  'electricity_min_units',
  'electricity_min_amount',
  'water_meter_digits',
  'electricity_meter_digits'
];

const TEXT_KEYS = [
  'building_name', 'building_address', 'building_phone',
  'bank_name', 'bank_account_number', 'bank_account_name',
  'bill_note'
];

// Only the name has to be filled in. An address and phone are blank until
// someone types them, and a blank is better than a placeholder that would
// print onto a real invoice.
const REQUIRED_TEXT_KEYS = ['building_name'];

const ALLOWED_KEYS = [...NUMERIC_KEYS, ...TEXT_KEYS];

// Everything is stored as text so one table can hold both a rate and a name.
// Numeric settings are converted here, once, so nothing downstream has to
// remember that `9` arrived as a string and `'9' + 1` would give `'91'`.
function readAll() {
  const out = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(row => {
    out[row.key] = NUMERIC_KEYS.includes(row.key) ? Number(row.value) : row.value;
  });
  return out;
}

// GET /settings — every rate, as one object rather than an array of rows
router.get('/', (req, res) => {
  res.json(readAll());
});

// PUT /settings — update one or several rates in a single call.
//
// Takes a plain object: { "water_rate": 10, "water_min_amount": 120 }
// Keys not supplied are left alone.
router.put('/', (req, res) => {
  const updates = req.body;

  if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'ต้องส่งอย่างน้อยหนึ่งค่ามาแก้' });
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ error: `ไม่รู้จักการตั้งค่าชื่อ "${key}"` });
    }
    if (TEXT_KEYS.includes(key)) {
      if (typeof value !== 'string') {
        return res.status(400).json({ error: `${key} ต้องเป็นข้อความ` });
      }
      if (REQUIRED_TEXT_KEYS.includes(key) && value.trim() === '') {
        return res.status(400).json({ error: `${key} เว้นว่างไม่ได้` });
      }
      continue;
    }
    if (value === null || value === undefined || isNaN(value) || value < 0) {
      return res.status(400).json({ error: `${key} ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป` });
    }
    if (key.endsWith('_meter_digits') && (value < 3 || value > 8 || value % 1 !== 0)) {
      return res.status(400).json({ error: `${key} ต้องเป็นจำนวนเต็มระหว่าง 3 ถึง 8` });
    }
  }

  // All keys are validated before any is written, so a bad key in the middle
  // cannot leave half the changes applied.
  const write = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    for (const [key, value] of Object.entries(updates)) {
      stmt.run(key, typeof value === 'string' ? value.trim() : String(value));
    }
  });

  write();
  res.json(readAll());
});

// GET /settings/period/2026-09 — is the minimum charge applied this month?
//
// A month with no row has never been decided, and the default is to apply it.
// Returning that default rather than a 404 keeps the frontend simple.
router.get('/period/:period', (req, res) => {
  const row = db.prepare('SELECT * FROM period_settings WHERE period = ?').get(req.params.period);

  res.json({
    period: req.params.period,
    apply_minimum: row ? row.apply_minimum === 1 : true,
    is_default: !row
  });
});

// PUT /settings/period/2026-09 — turn the minimum on or off for one month.
//
// One switch for the whole building, not per room.
router.put('/period/:period', (req, res) => {
  const { period } = req.params;
  const { apply_minimum } = req.body;

  if (!/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'งวดต้องอยู่ในรูปแบบ 2026-09' });
  }
  if (apply_minimum === undefined || apply_minimum === null) {
    return res.status(400).json({ error: 'ต้องระบุ apply_minimum' });
  }

  const value = apply_minimum ? 1 : 0;

  db.prepare(`
    INSERT INTO period_settings (period, apply_minimum) VALUES (?, ?)
    ON CONFLICT(period) DO UPDATE SET apply_minimum = excluded.apply_minimum
  `).run(period, value);

  // Bills already generated for this month keep the amounts they were given.
  // Flagging it here saves the user wondering why a total did not move.
  const billCount = db.prepare('SELECT COUNT(*) AS count FROM bills WHERE period = ?')
    .get(period).count;

  res.json({
    period,
    apply_minimum: value === 1,
    bills_already_generated: billCount,
    note: billCount > 0
      ? `งวด ${period} ออกบิลไปแล้ว ${billCount} ใบ บิลเหล่านั้นเก็บตัวเลขเดิมไว้ ถ้าต้องการให้มีผลต้องลบแล้วออกใหม่`
      : undefined
  });
});

module.exports = router;
