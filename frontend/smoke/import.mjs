/* The meter import's reading of a file, without a server or a screen.
 *
 * What a spreadsheet can look like by the time it reaches the program — a
 * CSV saved by Excel with its byte-order mark, Thai headers in any order, an
 * xlsx with columns nobody asked for, a file with no header row, room numbers
 * Excel turned into 102.0 — and what the preview then says about each row.
 *
 *   node smoke/import.mjs
 */
import * as XLSX from 'xlsx';
import { buildPreview, parseRows, payloadOf, readSheetFile, readingOf, roomText, templateRows }
  from '../src/lib/meterImport.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if(cond){ pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '  — ' + extra : ''}`); }
};
const section = s => console.log(`\n${s}`);

// What a browser's File gives readSheetFile: a name, and the bytes two ways.
const fileOf = (name, bytes) => ({
  name,
  text: async () => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes),
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});
const csv = (name, s) => fileOf(name, new TextEncoder().encode(s));
const ROOMS = ['101', '102', '103', '104', '201'];

section('cells');
check('102.0 is room 102', roomText('102.0') === '102' && roomText(102) === '102');
check('a room that is text stays text', roomText(' A-12 ') === 'A-12');
check('0 is a reading, not a blank', readingOf(0) === 0 && readingOf('0') === 0);
check('a blank is null, never 0', readingOf('') === null && readingOf(null) === null && readingOf('  ') === null);
check('commas and spaces are taken out', readingOf('1,520') === 1520 && readingOf(' 3 480 ') === 3480);
check('something that is not a number is marked, not dropped', readingOf('abc').bad === 'abc');
check('a negative reading is not a reading', readingOf(-5).bad !== undefined && readingOf('-5').bad !== undefined);

section('CSV with a BOM and Thai headers, in another order');
{
  const aoa = await readSheetFile(csv('meter.csv', '﻿ไฟ,ห้อง,มิเตอร์น้ำ\n3480,102,1520\n,103,980\n,104,\n,,\n'));
  const p = parseRows(aoa, ROOMS);
  check('the header is found, BOM and all', !p.error && !p.headerless, p.error);
  check('three rooms, the empty row ignored', p.rows.length === 3, JSON.stringify(p.rows));
  const r102 = p.rows.find(r => r.room === '102');
  check('columns follow their headers, not their positions', r102 && r102.water === 1520 && r102.elec === 3480,
    JSON.stringify(r102));
  const r103 = p.rows.find(r => r.room === '103');
  check('a blank electricity cell is null', r103 && r103.water === 980 && r103.elec === null);
  const r104 = p.rows.find(r => r.room === '104');
  check('both blank are both null', r104 && r104.water === null && r104.elec === null);
}

section('English headers in any case, and number as the room header');
{
  const p = parseRows(await readSheetFile(csv('x.csv', ' Number ,WATER,Electric\n102,0,0\n')), ROOMS);
  check('read', !p.error && p.rows[0].room === '102' && p.rows[0].water === 0 && p.rows[0].elec === 0,
    JSON.stringify(p));
}

section('xlsx with extra columns and Excel-typed cells');
{
  const ws = XLSX.utils.aoa_to_sheet([
    ['note', 'Room', 'tenant', 'Water', 'Electricity', 'prev_water'],
    ['x', 102, 'สมชาย', 1520, 3480, 1500],
    ['', 103.0, '', '1,000', null, 900],
    ['', '201', '', 'n/a', 50, 0],
  ]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S');
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const p = parseRows(await readSheetFile(fileOf('meter.xlsx', bytes)), ROOMS);
  check('extra columns are ignored', !p.error && p.rows.length === 3, p.error || JSON.stringify(p.rows));
  check('a numeric room cell becomes its text', p.rows[0].room === '102' && p.rows[1].room === '103');
  check('a text "1,000" is 1000', p.rows[1].water === 1000);
  check('"n/a" is marked bad', p.rows[2].water && p.rows[2].water.bad === 'n/a');
  check('prev_water is not taken for water', p.rows[0].water === 1520);
}

section('no header row');
{
  const p = parseRows(await readSheetFile(csv('h.csv', '102,1520,3480\n103,,\n')), ROOMS);
  check('read as room, water, electricity', !p.error && p.headerless && p.rows.length === 2
    && p.rows[0].water === 1520 && p.rows[0].elec === 3480, JSON.stringify(p));
  const bad = parseRows([['ชื่อ', 'ค่าน้ำ'], ['x', 1]], ROOMS);
  check('an unrecognised header is an error, not data', !!bad.error, JSON.stringify(bad));
  const noRoom = parseRows([['water', 'electricity'], [1, 2]], ROOMS);
  check('water and electricity without a room column is an error', !!noRoom.error);
  const roomOnly = parseRows([['room'], ['102']], ROOMS);
  check('a room column alone is an error', !!roomOnly.error);
}

section('a file that is not a spreadsheet');
{
  let msg = null;
  try { await readSheetFile(csv('photo.png', 'x')); } catch(e){ msg = e.message; }
  check('refused by its extension, in Thai', /csv|xlsx/.test(msg || ''), msg);
}

section('the preview, row by row');
{
  const units = ROOMS.map((n, i) => ({ id: i + 1, unit_number: n }));
  const id = n => units.find(u => u.unit_number === n).id;
  const stored = { [id('103')]: { water_prev: 900, water_curr: 950, water_rollover: 0,
                                   elec_prev: 100, elec_curr: null, elec_rollover: 0 } };
  const ctx = {
    units,
    readingFor: uid => stored[uid],
    previousOf: uid => uid === id('101') ? { water: 9990, elec: 500 } : { water: 1000, elec: 3000 },
    occupied: uid => uid !== id('201'),
    billed: uid => uid === id('104'),
    rollover: () => 10000,
    averages: new Map([[id('102'), { w: 10, e: 100 }]]),
  };
  const parsed = parseRows([
    ['room', 'water', 'electricity'],
    ['101', 12, 600],        // water wrapped
    ['102', 1100, 3050],     // 100 units of water against an average of 10
    ['103', 980, null],      // overwrites 950; electricity blank
    ['104', 1100, 3100],     // already billed
    ['201', 1001, 3001],     // vacant
    ['999', 1, 1],           // no such room
  ], ROOMS);
  const rows = buildPreview(parsed, ctx);
  const at = n => rows.find(r => r.room === n);

  check('below last month is a warning that needs a choice', at('101').status === 'warn'
    && at('101').w.below && at('101').w.used === null && at('101').importable, JSON.stringify(at('101')));
  check('and without one, only the other meter is sent',
    JSON.stringify(payloadOf([at('101')])) === JSON.stringify([{ unit_id: id('101'), water: null, electric: 600 }]),
    JSON.stringify(payloadOf([at('101')])));
  const fixed = buildPreview(parsed, ctx, { [at('101').key]: { w: 'rollover' } }).find(r => r.room === '101');
  check('ครบรอบ adds the dial: 9990 → 12 is 22 units', fixed.w.used === 22, `${fixed.w.used}`);
  check('and is sent as a fix, not as a number', payloadOf([fixed])[0].water === 12
    && payloadOf([fixed])[0].water_fix === 'rollover');
  const fresh = buildPreview(parsed, ctx, { [at('101').key]: { w: 'new_meter' } }).find(r => r.room === '101');
  check('เปลี่ยนมิเตอร์ counts from 0', fresh.w.used === 12 && fresh.w.prev === 0);

  check('unusually high usage is a warning', at('102').status === 'warn'
    && at('102').notes.some(n => n.includes('ผิดปกติ')), JSON.stringify(at('102').notes));
  check('overwriting a stored reading is a warning naming the old one', at('103').status === 'warn'
    && at('103').notes.some(n => n.includes('950')), JSON.stringify(at('103').notes));
  check('the stored previous figure is used, not last month\'s', at('103').w.prev === 900 && at('103').w.used === 80);
  check('a blank meter is skipped, not sent as 0', at('103').e.skipped && payloadOf([at('103')])[0].electric === null);
  check('a billed room is an error', at('104').status === 'error');
  check('a vacant room is a warning', at('201').status === 'warn' && at('201').notes[0].includes('ว่าง'));
  check('an unknown room is an error', at('999').status === 'error');

  const dup = buildPreview(parseRows([['room','water','electricity'], ['102', 1, 1], ['102', 2, 2]], ROOMS), ctx);
  check('a room twice in the file is an error both times', dup.every(r => r.status === 'error'));
  const skip = buildPreview(parseRows([['room','water','electricity'], ['102', null, null]], ROOMS), ctx);
  check('both blank is ข้าม, not an error', skip[0].status === 'skip');
  const ok = buildPreview(parseRows([['room','water','electricity'], ['102', 1010, 3080]], ROOMS), ctx);
  check('an ordinary row is ✅', ok[0].status === 'ok' && ok[0].w.used === 10 && ok[0].e.used === 80,
    JSON.stringify(ok[0]));
}

section('the template');
{
  const units = [{ id: 1, unit_number: '0102' }, { id: 2, unit_number: '201' }];
  const t = templateRows(units, () => ({ water: 1500, elec: 3400 }));
  check('every room, with last month beside it', t.length === 3 && t[1][0] === '0102' && t[1][3] === 1500);
  const ws = XLSX.utils.aoa_to_sheet(t);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S');
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const p = parseRows(await readSheetFile(fileOf('t.xlsx', bytes)), ['0102', '201']);
  check('imported untouched it is read, and every room is ข้าม', !p.error && p.rows.length === 2
    && p.rows.every(r => r.water === null && r.elec === null), JSON.stringify(p));
  check('a room written as text keeps its leading zero', p.rows[0].room === '0102');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
