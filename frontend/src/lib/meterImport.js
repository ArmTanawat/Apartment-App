/* meterImport.js — a spreadsheet of meter readings, made into rows the meter
 * page can preview and POST /readings/import can save.
 *
 * The owner's format is three columns, room, water, electricity, holding the
 * current readings — the same figures typed on the meter page, not units used
 * and not baht. Headers are matched loosely (any case, any order, Thai or
 * English); a file with no header row is read in that order.
 *
 * Blank never means 0. A blank cell skips that one meter, a row with both
 * blank skips the room, and a room not in the file is not touched. 0 is a real
 * reading and is kept.
 *
 * Everything here is pure except readSheetFile and downloadTemplate, which load
 * SheetJS on first use — it is large, and most visits to the meter page never
 * import anything. The server checks every row again; this is the preview.
 */

const ALIASES = {
  room:  ['room', 'number', 'no', 'no.', 'unit', 'ห้อง', 'เลขห้อง'],
  water: ['water', 'น้ำ', 'มิเตอร์น้ำ'],
  elec:  ['electricity', 'electric', 'ไฟ', 'มิเตอร์ไฟ'],
};

const clean = v => String(v ?? '').replace(/ /g, ' ').trim();
const headerKey = v => {
  const s = clean(v).toLowerCase();
  return Object.keys(ALIASES).find(k => ALIASES[k].includes(s)) || null;
};
const isBlank = v => v === null || v === undefined || clean(v) === '';

// Excel turns 102 into a number, and a CSV exported from it can say 102.0.
// Rooms are compared as text, so both come back as "102".
export function roomText(v){
  if(typeof v === 'number') return String(v);
  const s = clean(v);
  const m = s.match(/^(\d+)\.0+$/);
  return m ? m[1] : s;
}

// A reading: null when blank, a number when it is one, and { bad } when the
// cell holds something else — which is an error, not a skip. Thousands
// separators and spaces are what Excel puts in, so they are taken out.
export function readingOf(v){
  if(isBlank(v)) return null;
  if(typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : { bad: String(v) };
  const s = clean(v).replace(/[,\s]/g, '');
  if(s === '') return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : { bad: clean(v) };
}

/* A sheet, as rows of cells, into { rows } or { error }.
 *
 * unitNumbers is the building's rooms, used only to tell a headerless file
 * from one whose header was not recognised: a first cell that is one of the
 * rooms, or a number, is data. */
export function parseRows(aoa, unitNumbers = []){
  const rows = (aoa || []).map((r, i) => ({ cells: r || [], line: i + 1 }))
    .filter(r => r.cells.some(c => !isBlank(c)));
  if(!rows.length) return { error: 'ไฟล์นี้ไม่มีข้อมูล' };

  const first = rows[0].cells;
  const found = {};
  first.forEach((c, i) => { const k = headerKey(c); if(k && found[k] === undefined) found[k] = i; });

  let cols, data;
  if(found.room !== undefined){
    if(found.water === undefined && found.elec === undefined){
      return { error: 'พบคอลัมน์ห้อง แต่ไม่พบคอลัมน์น้ำหรือไฟ' };
    }
    cols = found;
    data = rows.slice(1);
  } else if(found.water !== undefined || found.elec !== undefined){
    return { error: 'ไม่พบคอลัมน์ห้อง (room) ในแถวแรก' };
  } else {
    const head = roomText(first[0]);
    const known = new Set(unitNumbers.map(String));
    if(!(known.has(head) || /^\d+$/.test(head))){
      return { error: 'อ่านหัวคอลัมน์ไม่ออก แถวแรกต้องเป็น room, water, electricity หรือเป็นเลขห้องเลย' };
    }
    cols = { room: 0, water: 1, elec: 2 };
    data = rows;
  }

  return {
    headerless: data === rows,
    rows: data.map(r => ({
      line: r.line,
      room: roomText(r.cells[cols.room]),
      water: cols.water === undefined ? null : readingOf(r.cells[cols.water]),
      elec:  cols.elec  === undefined ? null : readingOf(r.cells[cols.elec]),
    })),
  };
}

/* Average usage of the three most recent months before `period` that have
 * any, per room, from GET /readings/year for this year and last. A month with
 * nothing recorded is 0 there and is left out, so an empty month does not drag
 * the average down and make an ordinary month look unusual. */
export function averagesFrom(years, period){
  const out = new Map();
  for(const y of years){
    for(const r of y.rooms){
      const list = out.get(r.unit_id) || { w: [], e: [] };
      r.water.forEach((u, m) => {
        const p = `${y.year}-${String(m + 1).padStart(2, '0')}`;
        if(p < period && u > 0) list.w.push([p, u]);
      });
      r.elec.forEach((u, m) => {
        const p = `${y.year}-${String(m + 1).padStart(2, '0')}`;
        if(p < period && u > 0) list.e.push([p, u]);
      });
      out.set(r.unit_id, list);
    }
  }
  const avg = xs => {
    const last = xs.sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3);
    return last.length ? last.reduce((s, x) => s + x[1], 0) / last.length : null;
  };
  return new Map([...out].map(([id, l]) => [id, { w: avg(l.w), e: avg(l.e) }]));
}

// More than three times the usual, and more than a handful of units — a room
// that usually uses 2 and now uses 7 is not worth stopping anyone for.
const unusual = (used, avg) => avg !== null && avg !== undefined && used > avg * 3 && used > 20;

/* What each row of the file would do, for the preview.
 *
 *   ctx.units              the building's rooms
 *   ctx.readingFor(id)     this month's stored reading, if any
 *   ctx.previousOf(id)     { water, elec } last completed month
 *   ctx.occupied(id)       anyone in the room during this month
 *   ctx.billed(id)         a bill exists for this room and month
 *   ctx.rollover(kind)     what the dial adds when it wraps ("w" / "e")
 *   ctx.averages           averagesFrom(), or an empty Map
 *   fixes                  { [key]: { w: 'rollover'|'new_meter', e: … } }
 *
 * status is 'ok', 'warn', 'error' or 'skip'. A meter below last month is a
 * warning that needs a choice: until ครบรอบ or เปลี่ยนมิเตอร์ is picked, that
 * meter is not imported — the same question the meter page asks, because the
 * two bill differently and the program does not guess. */
export function buildPreview(parsed, ctx, fixes = {}){
  const count = new Map();
  parsed.rows.forEach(r => count.set(r.room, (count.get(r.room) || 0) + 1));

  return parsed.rows.map(r => {
    const key = `${r.line}`;
    const unit = ctx.units.find(u => String(u.unit_number) === r.room) || null;
    const row = { key, line: r.line, room: r.room, unit, status: 'ok', notes: [], w: null, e: null };
    const fail = note => ({ ...row, status: 'error', notes: [note] });

    if(!r.room) return fail('ไม่มีเลขห้อง');
    if(!unit) return fail('ไม่มีห้องนี้ในตึก');
    if(count.get(r.room) > 1) return fail('ห้องนี้ซ้ำในไฟล์');
    const bad = [['น้ำ', r.water], ['ไฟ', r.elec]].filter(([, v]) => v && v.bad !== undefined);
    if(bad.length) return fail(bad.map(([l, v]) => `${l} "${v.bad}" ไม่ใช่ตัวเลข`).join(' · '));
    if(r.water === null && r.elec === null) return { ...row, status: 'skip', notes: ['น้ำและไฟว่าง ข้ามห้องนี้'] };
    if(ctx.billed(unit.id)) return fail('ออกบิลเดือนนี้แล้ว บิลไม่เปลี่ยนตามมิเตอร์');

    const stored = ctx.readingFor(unit.id);
    const prev = ctx.previousOf(unit.id);
    const fix = fixes[key] || {};
    let warn = false;

    const meter = (kind, value, label) => {
      if(value === null) return { skipped: true };
      const p = stored ? stored[kind === 'w' ? 'water_prev' : 'elec_prev'] : prev[kind === 'w' ? 'water' : 'elec'];
      const roll = stored ? (stored[kind === 'w' ? 'water_rollover' : 'elec_rollover'] || 0) : 0;
      const before = stored ? stored[kind === 'w' ? 'water_curr' : 'elec_curr'] : null;
      const m = { prev: p, value, used: (value + roll) - p, below: false, fix: null };

      if(m.used < 0){
        m.below = true;
        m.fix = fix[kind] || null;
        warn = true;
        if(m.fix === 'rollover') m.used = (value + ctx.rollover(kind)) - p;
        else if(m.fix === 'new_meter'){ m.prev = 0; m.used = value; }
        else { m.used = null; row.notes.push(`${label}น้อยกว่าเดิม เลือกครบรอบหรือเปลี่ยนมิเตอร์ ไม่เลือก = ไม่นำเข้า${label}`); }
      }
      if(before !== null && before !== undefined && before !== value){
        warn = true;
        row.notes.push(`${label}: ทับเลขเดิม ${before}`);
      }
      const avg = ctx.averages.get(unit.id);
      if(m.used !== null && unusual(m.used, avg && avg[kind])){
        warn = true;
        row.notes.push(`${label}ใช้ ${m.used} หน่วย มากผิดปกติ (เฉลี่ย ${Math.round(avg[kind])})`);
      }
      return m;
    };

    row.w = meter('w', r.water, 'น้ำ');
    row.e = meter('e', r.elec, 'ไฟ');
    if(!ctx.occupied(unit.id)){ warn = true; row.notes.unshift('ห้องว่างเดือนนี้'); }

    // Something left to send once the undecided meters are held back.
    const sends = m => !m.skipped && !(m.below && !m.fix);
    row.importable = sends(row.w) || sends(row.e);
    if(warn) row.status = 'warn';
    return row;
  });
}

// The rows to POST, from the ones still ticked.
export const payloadOf = rows => rows.filter(r => r.importable).map(r => {
  const send = m => m.skipped || (m.below && !m.fix) ? null : m.value;
  return {
    unit_id: r.unit.id,
    water: send(r.w), electric: send(r.e),
    ...(r.w.fix ? { water_fix: r.w.fix } : null),
    ...(r.e.fix ? { elec_fix: r.e.fix } : null),
  };
});

// ---- the parts that touch files ----

export async function readSheetFile(file){
  const name = (file && file.name || '').toLowerCase();
  if(!/\.(csv|xlsx)$/.test(name)) throw new Error('รองรับเฉพาะไฟล์ .csv หรือ .xlsx');
  const XLSX = await import('xlsx');
  let wb;
  try {
    // A CSV is read as text so its encoding is decided here: UTF-8, not
    // whatever codepage SheetJS would guess for Thai. The byte-order mark
    // Excel writes is taken off here too, so a header never reads "\uFEFFroom"
    // whichever of the browser or SheetJS would otherwise have removed it.
    wb = name.endsWith('.csv')
      ? XLSX.read((await file.text()).replace(/^﻿/, ''), { type: 'string', raw: true })
      : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  } catch {
    throw new Error('เปิดไฟล์นี้ไม่ได้ ไฟล์อาจเสียหรือไม่ใช่ไฟล์ตาราง');
  }
  return sheetRows(XLSX, wb);
}

export function sheetRows(XLSX, wb){
  const ws = wb.Sheets[wb.SheetNames[0]];
  if(!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
}

/* A template with every room and last month's figures beside it.
 *
 * The reference columns are named prev_water and prev_electricity, which
 * match none of the headers above — so a template filled in and imported
 * as-is reads only the three columns that matter. Rooms are written as text,
 * so Excel does not turn 0102 into 102. */
export function templateRows(units, previousOf){
  return [
    ['room', 'water', 'electricity', 'prev_water', 'prev_electricity'],
    ...units.map(u => {
      const p = previousOf(u.id);
      return [String(u.unit_number), null, null, p.water, p.elec];
    }),
  ];
}

export async function downloadTemplate(units, previousOf, period){
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(templateRows(units, previousOf));
  ws['!cols'] = [{ wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, period);
  XLSX.writeFile(wb, `meter-${period}.xlsx`);
}
