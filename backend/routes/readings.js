// routes/readings.js — monthly water and electricity meter entry.

const express = require('express');
const { db } = require('../db.js');

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

// Which meter, if any, these figures make run backwards. Shared by manual entry
// and import so the two cannot disagree on what is refused.
function negativeMeter(r) {
  const wu = usage(r.water_prev, r.water_curr, r.water_rollover);
  if (wu !== null && wu < 0) return 'water';
  const eu = usage(r.elec_prev, r.elec_curr, r.elec_rollover);
  if (eu !== null && eu < 0) return 'elec';
  return null;
}

const BELOW_PREVIOUS = {
  water: 'เลขน้ำน้อยกว่างวดก่อน เป็นการพิมพ์ผิด มิเตอร์ถูกเปลี่ยนใหม่ หรือมิเตอร์ครบรอบ ต้องระบุว่าอย่างไหน',
  elec:  'เลขไฟน้อยกว่างวดก่อน เป็นการพิมพ์ผิด มิเตอร์ถูกเปลี่ยนใหม่ หรือมิเตอร์ครบรอบ ต้องระบุว่าอย่างไหน',
};

// The last completed month before this one — the chain a new row's previous
// figures come from. A skipped month does not break it.
function previousOf(unitId, period) {
  return db.prepare(`
    SELECT water_curr, elec_curr, period
    FROM meter_readings
    WHERE unit_id = ? AND period < ?
      AND water_curr IS NOT NULL AND elec_curr IS NOT NULL
    ORDER BY period DESC
    LIMIT 1
  `).get(unitId, period);
}

// What a dial adds when it wraps: its capacity, from how many digits it has.
// A property of the meter, kept in settings — counting the digits in a reading
// would get it wrong for any meter showing a number padded with zeros. The
// meter page's ครบรอบ button sends this same figure (rolloverAmount() in
// frontend/src/lib/helpers.js).
function rolloverOf(kind) {
  const key = kind === 'water' ? 'water_meter_digits' : 'electricity_meter_digits';
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return Math.pow(10, Number(row ? row.value : 4));
}

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

// GET /readings/year/2026 — a year of usage, every room, for the yearly report.
//
// One request rather than twelve, and the arithmetic stays here: usage() knows
// about rollovers and meter replacements, and a second copy of it on the client
// would be the same mistake buildBill() was moved off the frontend to avoid.
//
// Every room appears and every month has a number. A month with no reading, or
// one entered but not yet finished, is 0 rather than null — the report is a
// grid to scan down a column of, and a blank would read as "look into this"
// when the answer is simply that nothing was recorded.
//
// `years` comes back alongside so the picker can offer the years that have
// something in them without a second call.
router.get('/year/:year', (req, res) => {
  const year = String(req.params.year);
  if (!/^\d{4}$/.test(year)) {
    return res.status(400).json({ error: 'ปีต้องเป็นตัวเลขสี่หลัก เช่น 2026' });
  }

  const rows = db.prepare(`
    SELECT
      u.id AS unit_id, u.unit_number, u.floor,
      r.period,
      r.water_prev, r.water_curr, r.water_rollover,
      r.elec_prev,  r.elec_curr,  r.elec_rollover
    FROM units u
    LEFT JOIN meter_readings r
      ON r.unit_id = u.id AND r.period LIKE ?
    ORDER BY u.floor, u.unit_number
  `).all(`${year}-%`);

  const rooms = new Map();
  for (const r of rows) {
    if (!rooms.has(r.unit_id)) {
      rooms.set(r.unit_id, {
        unit_id: r.unit_id, unit_number: r.unit_number, floor: r.floor,
        water: Array(12).fill(0), elec: Array(12).fill(0),
      });
    }
    if (!r.period) continue;

    // period is 'YYYY-MM', so the month is the last two characters. Stored
    // Gregorian everywhere, which is why this is a slice and not a conversion.
    const m = Number(r.period.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;

    const room = rooms.get(r.unit_id);
    room.water[m] = usage(r.water_prev, r.water_curr, r.water_rollover) ?? 0;
    room.elec[m]  = usage(r.elec_prev,  r.elec_curr,  r.elec_rollover)  ?? 0;
  }

  const years = db.prepare(`
    SELECT DISTINCT substr(period, 1, 4) AS y FROM meter_readings ORDER BY y DESC
  `).all().map(x => x.y);

  // The current year is always offered, even before anything is entered in it.
  const thisYear = db.prepare(`SELECT strftime('%Y', 'now', 'localtime') AS y`).get().y;
  if (!years.includes(thisYear)) years.unshift(thisYear);

  res.json({ year, years, rooms: [...rooms.values()] });
});

// GET /readings/previous/:unitId/:period — what last month's meter ended at.
//
// The UI calls this to prefill the "previous" boxes so only one number is typed.
// Falls back to the most recent reading before this period rather than exactly
// the month before, so a skipped month does not break the chain.
router.get('/previous/:unitId/:period', (req, res) => {
  const last = previousOf(req.params.unitId, req.params.period);

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
  const backwards = negativeMeter({ water_prev, water_curr, water_rollover, elec_prev, elec_curr, elec_rollover });
  if (backwards) {
    return res.status(400).json({ error: BELOW_PREVIOUS[backwards] });
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

// POST /readings/import — a month of meters from a spreadsheet, in one go.
//
//   { period: '2026-10',
//     rows: [{ unit_id, water, electric, water_fix, elec_fix }] }
//
// water and electric are current readings, exactly what is typed on the meter
// page. null means the file left that cell blank: that meter is not touched,
// and the room's other meter is still saved. A row with both null is not sent.
//
// water_fix / elec_fix answer the question the meter page asks when a reading
// is below last month: 'rollover' (the dial wrapped) or 'new_meter' (it was
// replaced, so it counts from 0). Without one, such a reading is refused here
// as it is on manual entry — the program does not guess which it was.
//
// The screen has already checked all of this to draw its preview. It is
// checked again because the screen's picture can be out of date — a bill
// generated in another window between preview and confirm, say.
//
// All or nothing, in one transaction. A row the server refuses fails the whole
// import with every row's result, so the user sees which, and nothing has been
// half-saved. It writes readings only; bills are generated the normal way.
router.post('/import', (req, res) => {
  const { period, rows } = req.body || {};

  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: 'งวดต้องอยู่ในรูปแบบ 2026-10' });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'ไม่มีห้องให้นำเข้า' });
  }

  const FIXES = ['rollover', 'new_meter'];
  const seen = new Map(rows.map(r => [r && r.unit_id, 0]));
  rows.forEach(r => seen.set(r && r.unit_id, seen.get(r && r.unit_id) + 1));
  const isReading = v => v === null || v === undefined
    || (typeof v === 'number' && Number.isFinite(v) && v >= 0);

  const plans = rows.map(r => {
    const unit = r && db.prepare('SELECT * FROM units WHERE id = ?').get(r.unit_id);
    const out = { unit_id: r && r.unit_id, unit_number: unit ? unit.unit_number : null };
    if (!unit) return { ...out, error: 'ไม่พบห้องนี้' };
    const name = `ห้อง ${unit.unit_number}`;
    if (seen.get(r.unit_id) > 1) return { ...out, error: `${name} ซ้ำในรายการนำเข้า` };
    if (!isReading(r.water) || !isReading(r.electric)) {
      return { ...out, error: `${name}: เลขมิเตอร์ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป` };
    }
    const water = r.water ?? null, elec = r.electric ?? null;
    if (water === null && elec === null) return { ...out, error: `${name}: ไม่มีเลขให้นำเข้า` };
    if ((r.water_fix && !FIXES.includes(r.water_fix)) || (r.elec_fix && !FIXES.includes(r.elec_fix))) {
      return { ...out, error: `${name}: ต้องเลือกครบรอบหรือเปลี่ยนมิเตอร์` };
    }

    // Bills are frozen: a reading changed under one leaves it stale. The meter
    // page allows that and warns; an import does not, because it would do it to
    // a whole month at once without anyone looking at a single bill.
    const billed = db.prepare(`
      SELECT 1 FROM bills b JOIN leases l ON l.id = b.lease_id
      WHERE l.unit_id = ? AND b.period = ?
    `).get(unit.id, period);
    if (billed) return { ...out, error: `${name} ออกบิลงวด ${period} ไปแล้ว ลบบิลก่อนถ้าต้องการแก้เลข` };

    // Start from what is stored for this month, or from last month's figures
    // for a room not yet entered — the same starting point as manual entry.
    const existing = db.prepare('SELECT * FROM meter_readings WHERE unit_id = ? AND period = ?')
      .get(unit.id, period);
    const last = existing ? null : previousOf(unit.id, period);
    const next = existing ? { ...existing } : {
      water_prev: last ? last.water_curr : 0, water_curr: null, water_rollover: 0,
      elec_prev:  last ? last.elec_curr  : 0, elec_curr:  null, elec_rollover:  0,
    };

    // The same two fixes the meter page's buttons apply: a wrapped dial keeps
    // its previous figure and adds its capacity; a new meter counts from 0.
    //
    // A fix is only taken for a reading that needs one. ครบรอบ on a figure that
    // went up would add a whole dial's worth of units to the bill.
    let needless = null;
    const apply = (kind, curr, fix) => {
      if (curr === null) return;
      const p = kind === 'water' ? 'water' : 'elec';
      next[`${p}_curr`] = curr;
      if (fix && usage(next[`${p}_prev`], curr, next[`${p}_rollover`]) >= 0) needless = kind;
      if (fix === 'rollover') next[`${p}_rollover`] = rolloverOf(kind);
      if (fix === 'new_meter') { next[`${p}_prev`] = 0; next[`${p}_rollover`] = 0; }
    };
    apply('water', water, r.water_fix);
    apply('electricity', elec, r.elec_fix);
    if (needless) {
      return { ...out, error: `${name}: เลข${needless === 'water' ? 'น้ำ' : 'ไฟ'}ไม่ได้น้อยกว่างวดก่อน ไม่ต้องเลือกครบรอบหรือเปลี่ยนมิเตอร์` };
    }

    const backwards = negativeMeter(next);
    if (backwards) return { ...out, error: `${name}: ${BELOW_PREVIOUS[backwards]}` };

    return { ...out, existing, next };
  });

  if (plans.some(p => p.error)) {
    return res.status(400).json({
      error: `นำเข้าไม่สำเร็จ ยังไม่ได้บันทึกห้องใดเลย: ${plans.filter(p => p.error).map(p => p.error).join(' · ')}`,
      results: plans.map(p => ({ unit_id: p.unit_id, unit_number: p.unit_number,
        status: p.error ? 'error' : 'ok', error: p.error })),
    });
  }

  const write = db.transaction(() => plans.map(p => {
    const n = p.next;
    if (p.existing) {
      db.prepare(`
        UPDATE meter_readings
        SET water_prev = ?, water_curr = ?, water_rollover = ?,
            elec_prev = ?, elec_curr = ?, elec_rollover = ?
        WHERE id = ?
      `).run(n.water_prev, n.water_curr, n.water_rollover,
             n.elec_prev, n.elec_curr, n.elec_rollover, p.existing.id);
    } else {
      db.prepare(`
        INSERT INTO meter_readings
          (unit_id, period, water_prev, water_curr, water_rollover, elec_prev, elec_curr, elec_rollover)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(p.unit_id, period, n.water_prev, n.water_curr, n.water_rollover,
             n.elec_prev, n.elec_curr, n.elec_rollover);
    }
    const saved = db.prepare('SELECT * FROM meter_readings WHERE unit_id = ? AND period = ?')
      .get(p.unit_id, period);
    return {
      unit_id: p.unit_id, unit_number: p.unit_number, status: 'saved',
      water_curr: saved.water_curr, elec_curr: saved.elec_curr,
      water_used: usage(saved.water_prev, saved.water_curr, saved.water_rollover),
      elec_used:  usage(saved.elec_prev,  saved.elec_curr,  saved.elec_rollover),
    };
  }));

  const results = write();
  res.json({ period, saved: results.length, results });
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

  if (negativeMeter({ water_prev, water_curr, water_rollover, elec_prev, elec_curr, elec_rollover })) {
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
