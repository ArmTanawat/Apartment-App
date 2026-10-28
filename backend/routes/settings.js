// routes/settings.js — utility rates, minimum charges, and the monthly switch.

const express = require('express');
const { db } = require('../db.js');
const look = require('../building-look.js');

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
  'bill_note',
  // The folder Export เป็นรูปภาพ last wrote into, so it is offered again.
  // Shown nowhere on ตั้งค่า; the export dialog reads and writes it.
  'export_folder'
];

// Only the name has to be filled in. An address and phone are blank until
// someone types them, and a blank is better than a placeholder that would
// print onto a real invoice.
const REQUIRED_TEXT_KEYS = ['building_name'];

// The chooser's card colour and icon. Set through PUT /buildings/:id/look, but
// they are rows in this table, so GET /settings returns them — and a screen or
// suite that reads everything and writes it back must not be refused for it.
// Held to the same lists here as there.
const LOOK_KEYS = { building_color: look.COLORS, building_icon: look.ICONS };

const ALLOWED_KEYS = [...NUMERIC_KEYS, ...TEXT_KEYS, ...Object.keys(LOOK_KEYS)];

// The payment QR printed beside the bank details, as a data URL. A row in this
// table so the backup — a copy of the building's file — carries it without
// anyone remembering a second file. It is not in ALLOWED_KEYS and readAll()
// leaves it out: a few hundred kilobytes riding along on every GET /settings
// is waste, and a screen that writes back what it read would be refused for a
// key PUT /settings does not take. It has its own three routes below.
const QR_KEY = 'payment_qr_image';
const QR_MAX_BYTES = 1024 * 1024;
const QR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

// Everything is stored as text so one table can hold both a rate and a name.
// Numeric settings are converted here, once, so nothing downstream has to
// remember that `9` arrived as a string and `'9' + 1` would give `'91'`.
function readAll() {
  const out = {};
  db.prepare('SELECT key, value FROM settings WHERE key <> ?').all(QR_KEY).forEach(row => {
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
    if (LOOK_KEYS[key]) {
      if (!LOOK_KEYS[key].includes(value)) {
        return res.status(400).json({ error: `${key} ต้องเป็นหนึ่งใน ${LOOK_KEYS[key].join(', ')}` });
      }
      continue;
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

// GET /settings/payment-qr — the QR image, or null when none is set.
router.get('/payment-qr', (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(QR_KEY);
  res.json({ image: row ? row.value : null });
});

// PUT /settings/payment-qr — { image: 'data:image/png;base64,...' }
//
// The screen shrinks the picture before sending it. This checks again rather
// than trusting that, because the image is printed on every bill and a broken
// one would be found on paper.
router.put('/payment-qr', (req, res) => {
  const image = req.body && req.body.image;

  if (typeof image !== 'string' || !QR_PATTERN.test(image)) {
    return res.status(400).json({ error: 'ไฟล์นี้ไม่ใช่รูปภาพ ใช้ไฟล์ PNG, JPG หรือ WebP' });
  }
  const bytes = Math.floor((image.length - image.indexOf(',') - 1) * 3 / 4);
  if (bytes > QR_MAX_BYTES) {
    return res.status(400).json({ error: 'รูป QR ใหญ่เกิน 1 MB ลองใช้รูปที่เล็กลงหรือครอบเฉพาะตัว QR' });
  }

  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(QR_KEY, image);

  res.json({ image });
});

// DELETE /settings/payment-qr — bills go back to the bank details alone.
router.delete('/payment-qr', (req, res) => {
  db.prepare('DELETE FROM settings WHERE key = ?').run(QR_KEY);
  res.status(204).send();
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
