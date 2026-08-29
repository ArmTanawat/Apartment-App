// routes/readings.js — monthly water and electricity meter entry.

const express = require('express');
const db = require('../db.js');

const router = express.Router();

// A mechanical meter has a fixed number of digits and wraps back to zero when
// it fills. 9995 followed by 12 on a five-digit meter is 17 units used, not a
// mistake. `rollover` holds the amount the dial wrapped by, so usage stays
// correct without inventing a reading that was never on the dial.
//
// Meter REPLACEMENT looks identical but is not the same: a new meter starts at
// zero, so usage is just the current number. That case is handled by setting
// the previous reading to 0, not by a rollover.
const usage = (prev, curr, rollover = 0) =>
  curr == null ? null : (curr + rollover) - prev;

// GET /readings?period=2026-08 — readings for a month, one row per room.
//
// LEFT JOIN from units means rooms with no reading yet still appear, with null
// values. That turns this endpoint into the monthly entry checklist: the null
// rows are the rooms still needing a number typed in.
router.get('/', (req, res) => {
  const period = req.query.period;

  if (!period) {
    return res.status(400).json({ error: 'ต้องระบุงวด เช่น ?period=2026-08' });
  }

  const rows = db.prepare(`
    SELECT
      u.id          AS unit_id,
      u.unit_number,
      u.floor,
      r.id          AS reading_id,
      r.water_prev,
      r.water_curr,
      r.water_rollover,
      r.elec_prev,
      r.elec_curr,
      r.elec_rollover,
      t.full_name   AS tenant_name
    FROM units u
    LEFT JOIN meter_readings r
      ON r.unit_id = u.id AND r.period = ?
    LEFT JOIN leases l
      ON l.unit_id = u.id AND (l.end_date IS NULL OR l.end_date > date('now','localtime'))
    LEFT JOIN tenants t
      ON t.id = l.tenant_id
    ORDER BY u.floor, u.unit_number
  `).all(period);

  const withUsage = rows.map(r => ({
    ...r,
    is_entered: r.reading_id !== null && r.water_curr != null && r.elec_curr != null,
    water_used: usage(r.water_prev, r.water_curr, r.water_rollover),
    elec_used:  usage(r.elec_prev,  r.elec_curr,  r.elec_rollover)
  }));

  res.json(withUsage);
});

// GET /readings/previous/:unitId/:period — what last month's meter ended at.
//
// The UI calls this to prefill the "previous" boxes so only one number is typed.
// Falls back to the most recent reading before this period rather than exactly
// the month before, so a skipped month does not break the chain.
router.get('/previous/:unitId/:period', (req, res) => {
  const last = db.prepare(`
    SELECT water_curr, elec_curr, period
    FROM meter_readings
    WHERE unit_id = ? AND period < ?
      AND water_curr IS NOT NULL AND elec_curr IS NOT NULL
    ORDER BY period DESC
    LIMIT 1
  `).get(req.params.unitId, req.params.period);

  // No history at all means this is the first reading for the room. Zeros are
  // returned rather than a 404 so the form still has something to fill in.
  if (!last) {
    return res.json({ water_prev: 0, elec_prev: 0, from_period: null });
  }

  res.json({
    water_prev: last.water_curr,
    elec_prev: last.elec_curr,
    from_period: last.period
  });
});

// GET /readings/history/:unitId — every reading for one room, newest first.
router.get('/history/:unitId', (req, res) => {
  const history = db.prepare(`
    SELECT * FROM meter_readings
    WHERE unit_id = ?
    ORDER BY period DESC
  `).all(req.params.unitId);

  res.json(history.map(r => ({
    ...r,
    water_used: usage(r.water_prev, r.water_curr, r.water_rollover),
    elec_used:  usage(r.elec_prev,  r.elec_curr,  r.elec_rollover)
  })));
});

// POST /readings — record a month's meters for one room.
router.post('/', (req, res) => {
  const { unit_id, period, water_prev, water_curr, elec_prev, elec_curr } = req.body;
  const water_rollover = req.body.water_rollover || 0;
  const elec_rollover  = req.body.elec_rollover  || 0;

  if (!unit_id || !period) {
    return res.status(400).json({ error: 'ต้องระบุห้องและงวด' });
  }

  if (!/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'งวดต้องอยู่ในรูปแบบ 2026-08' });
  }

  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(unit_id);
  if (!unit) {
    return res.status(400).json({ error: 'ไม่พบห้องนี้' });
  }

  // The previous readings must be numbers. The current ones may be left out:
  // that is the state after a previous figure was corrected and the meter has
  // to be read again, and it is what the checklist shows as still outstanding.
  for (const [name, value] of Object.entries({ water_prev, elec_prev })) {
    if (value === undefined || value === null || isNaN(value)) {
      return res.status(400).json({ error: `${name} ต้องเป็นตัวเลข` });
    }
  }
  for (const [name, value] of Object.entries({ water_curr, elec_curr })) {
    if (value !== undefined && value !== null && isNaN(value)) {
      return res.status(400).json({ error: `${name} ต้องเป็นตัวเลข` });
    }
  }

  // A meter counts up. A current reading below the previous one is a typo, a
  // replaced meter, or a dial that wrapped — and the caller has to say which,
  // because each produces a different bill. Without a rollover supplied, the
  // reading is refused rather than billed as a negative.
  if (water_curr != null && usage(water_prev, water_curr, water_rollover) < 0) {
    return res.status(400).json({
      error: 'เลขน้ำน้อยกว่างวดก่อน เป็นการพิมพ์ผิด มิเตอร์ถูกเปลี่ยนใหม่ หรือมิเตอร์ครบรอบ ต้องระบุว่าอย่างไหน'
    });
  }
  if (elec_curr != null && usage(elec_prev, elec_curr, elec_rollover) < 0) {
    return res.status(400).json({
      error: 'เลขไฟน้อยกว่างวดก่อน เป็นการพิมพ์ผิด มิเตอร์ถูกเปลี่ยนใหม่ หรือมิเตอร์ครบรอบ ต้องระบุว่าอย่างไหน'
    });
  }

  try {
    const result = db.prepare(`
      INSERT INTO meter_readings
        (unit_id, period, water_prev, water_curr, water_rollover, elec_prev, elec_curr, elec_rollover)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(unit_id, period, water_prev, water_curr ?? null, water_rollover,
           elec_prev, elec_curr ?? null, elec_rollover);

    const created = db.prepare('SELECT * FROM meter_readings WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    // UNIQUE (unit_id, period) from the schema catches a double entry.
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({
        error: `ห้อง ${unit.unit_number} มีบันทึกมิเตอร์งวด ${period} อยู่แล้ว ให้แก้ไขแทน`
      });
    }
    throw err;
  }
});

// PUT /readings/5 — correct a reading that was typed wrong.
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM meter_readings WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'ไม่พบบันทึกมิเตอร์' });
  }

  const water_prev = req.body.water_prev ?? existing.water_prev;
  const elec_prev  = req.body.elec_prev  ?? existing.elec_prev;
  const water_rollover = req.body.water_rollover ?? existing.water_rollover;
  const elec_rollover  = req.body.elec_rollover  ?? existing.elec_rollover;

  // The current readings are checked with `in` rather than `??`, the same way
  // end_date is on PUT /leases/:id, because clearing one is a real action.
  //
  // A row may hold a previous figure with no current one. That is the state
  // left after the previous figure was corrected upward and the meter has to
  // be read again — refusing the correction until the current number is
  // inflated first is backwards. With `??`, sending null would be read as "not
  // supplied" and the old number would stay, so there would be no way to get
  // back to it.
  const water_curr = 'water_curr' in req.body
    ? (req.body.water_curr ?? null) : existing.water_curr;
  const elec_curr = 'elec_curr' in req.body
    ? (req.body.elec_curr ?? null) : existing.elec_curr;

  const wu = usage(water_prev, water_curr, water_rollover);
  const eu = usage(elec_prev, elec_curr, elec_rollover);
  if ((wu !== null && wu < 0) || (eu !== null && eu < 0)) {
    return res.status(400).json({ error: 'ค่านี้ทำให้จำนวนหน่วยติดลบ ตรวจเลขอีกครั้ง หรือตั้งว่ามิเตอร์ครบรอบ' });
  }

  db.prepare(`
    UPDATE meter_readings
    SET water_prev = ?, water_curr = ?, water_rollover = ?,
        elec_prev = ?, elec_curr = ?, elec_rollover = ?
    WHERE id = ?
  `).run(water_prev, water_curr, water_rollover, elec_prev, elec_curr, elec_rollover, req.params.id);

  const updated = db.prepare('SELECT * FROM meter_readings WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /readings/5
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM meter_readings WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'ไม่พบบันทึกมิเตอร์' });
  }

  res.status(204).send();
});

module.exports = router;
