// buildings.js — which buildings exist, and which one is open.
//
// Each building is a whole, separate copy of the program's data: its own file
// under buildings/, its own rooms, tenants, bills, rates and backups. Nothing
// is shared and nothing is read across, so every rule in the routes holds per
// building exactly as it did when there was only one. A tenant who moves from
// one building to the other is a new tenant there.
//
// One building is open at a time. Nothing is open when the server starts: the
// screen asks which one first, every time, so the readings typed next go into
// the building the user meant. The one exception is the desktop shell bringing
// a crashed server back while the window is still open — it passes the open
// building in APARTMENT_OPEN_BUILDING, so the user does not land on the
// chooser in the middle of their work.

const fs = require('fs');
const path = require('path');
const Database = require(process.env.APARTMENT_SQLITE || 'better-sqlite3');
const { buildingsDir, deletedDir, backupRoot, legacyDbPath } = require('./data-dir.js');
const { openDatabase, setCurrent } = require('./db.js');
const { runBackup } = require('./backup.js');
const look = require('./building-look.js');

const ID = /^b\d+$/;

let open = null; // { id, file, backupDir, db }

const fileOf = id => path.join(buildingsDir, `${id}.db`);
const backupDirOf = id => path.join(backupRoot, id);

function ensureDirs() {
  for (const dir of [buildingsDir, deletedDir, backupRoot]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function ids() {
  return fs.readdirSync(buildingsDir)
    .filter(f => f.endsWith('.db') && ID.test(f.slice(0, -3)))
    .map(f => f.slice(0, -3))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

// Never reused. A deleted building leaves its backups under its id, and a new
// building given the same id would find them in its own list — so the next
// number is past every id still to be seen anywhere, not just the live ones.
function nextId() {
  const seen = [
    ...ids(),
    ...fs.readdirSync(deletedDir).map(f => f.split('-')[0]),
    ...fs.readdirSync(backupRoot),
  ].filter(x => ID.test(x)).map(x => Number(x.slice(1)));
  return `b${Math.max(0, ...seen) + 1}`;
}

// The building that was the whole program before there could be two.
//
// Copied in as b1 rather than moved, then the original is renamed so this
// never runs again. A copy that failed half way leaves apartment.db exactly
// as it was. Its old backups move into backups/b1/, where b1's list finds
// them. Runs only when there is no building yet, so it can never land on top
// of one.
function adoptLegacy() {
  if (!fs.existsSync(legacyDbPath) || ids().length) return;

  fs.copyFileSync(legacyDbPath, fileOf('b1'));
  fs.renameSync(legacyDbPath, `${legacyDbPath}.moved-to-buildings`);

  const target = backupDirOf('b1');
  if (!fs.existsSync(target)) fs.mkdirSync(target);
  for (const f of fs.readdirSync(backupRoot)) {
    if (f.startsWith('apartment-') && f.endsWith('.db')) {
      fs.renameSync(path.join(backupRoot, f), path.join(target, f));
    }
  }
  console.log('ย้ายข้อมูลเดิมเข้าเป็นตึกแรกแล้ว (b1)');
}

// Read straight off the file, without opening it as the active building.
// readonly, so listing can never write to a building nobody chose.
function describe(id) {
  if (open && open.id === id) return summary(id, open.db);
  let db;
  try {
    db = new Database(fileOf(id), { readonly: true, fileMustExist: true });
    return summary(id, db);
  } catch {
    return { id, name: `(เปิดไฟล์ ${id}.db ไม่ได้)`, units: null, unreadable: true };
  } finally {
    if (db) db.close();
  }
}

function summary(id, db) {
  const setting = key => {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
    return row ? row.value : null;
  };
  const units = db.prepare(`SELECT COUNT(*) AS n FROM units`).get().n;
  return {
    id,
    name: (setting('building_name') || '').trim() || id,
    units,
    color: setting('building_color') || look.DEFAULT.color,
    icon: setting('building_icon') || look.DEFAULT.icon,
  };
}

function list() {
  return ids().map(describe);
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// A new building starts exactly as a fresh install does: the default rates,
// the three starter fee types, no rooms. Nothing is copied from another one.
function create(name) {
  const clean = (name ?? '').trim();
  if (!clean) throw fail('กรุณาใส่ชื่อตึก');
  const taken = list().find(b => sameName(b.name, clean));
  if (taken) throw fail(`มีตึกชื่อ ${taken.name} อยู่แล้ว กรุณาใช้ชื่ออื่น`);

  const id = nextId();
  const db = openDatabase(fileOf(id));
  try {
    db.prepare(`UPDATE settings SET value = ? WHERE key = 'building_name'`).run(clean);
  } finally {
    db.close();
  }
  return { id, name: clean, units: 0 };
}

function select(id) {
  if (!ID.test(id) || !fs.existsSync(fileOf(id))) throw fail('ไม่พบตึกนี้', 404);
  if (open && open.id === id) return describe(id);

  close();
  const file = fileOf(id);
  const backupDir = backupDirOf(id);
  // Before opening, so the copy is of the finished state the last session
  // left rather than a file being written to.
  runBackup(file, backupDir);
  const db = openDatabase(file);
  open = { id, file, backupDir, db };
  setCurrent(db);
  announce();
  return describe(id);
}

function close() {
  if (!open) return;
  setCurrent(null);
  open.db.close();
  open = null;
  announce();
}

// The name has to be typed in full to delete, and the file is moved aside
// rather than erased — buildings-deleted/ keeps it, and its backups stay in
// backups/<id>/. Getting it back is a file copy into buildings/ by hand; there
// is no button for it, because there should be no need for one.
function remove(id, typedName) {
  if (!ID.test(id) || !fs.existsSync(fileOf(id))) throw fail('ไม่พบตึกนี้', 404);
  if (open && open.id === id) throw fail('ตึกนี้เปิดอยู่ กรุณากลับไปหน้าเลือกตึกก่อนลบ');

  // A file that cannot be read has no name to type, so its id stands in.
  const { name, unreadable } = describe(id);
  const expected = unreadable ? id : name;
  if ((typedName ?? '').trim() !== expected) {
    throw fail(`ชื่อที่พิมพ์ไม่ตรงกับ ${expected} จึงยังไม่ได้ลบ`);
  }

  // Local time, like the backups beside it — the date the user deleted it.
  const d = new Date();
  const p2 = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  const safe = expected.replace(/[\\/:*?"<>|]/g, '_');
  fs.renameSync(fileOf(id), path.join(deletedDir, `${id}-${stamp}-${safe}.db`));
}

// The card's colour and icon, set from the chooser while the building is
// closed. Written into that building's own file, the only place it is kept.
function setLook(id, { color, icon } = {}) {
  if (!ID.test(id) || !fs.existsSync(fileOf(id))) throw fail('ไม่พบตึกนี้', 404);
  if (color === undefined && icon === undefined) throw fail('ไม่ได้เลือกสีหรือไอคอน');
  if (color !== undefined && !look.COLORS.includes(color)) throw fail('ไม่มีสีนี้ให้เลือก');
  if (icon !== undefined && !look.ICONS.includes(icon)) throw fail('ไม่มีไอคอนนี้ให้เลือก');

  const db = open && open.id === id ? open.db : new Database(fileOf(id), { fileMustExist: true });
  try {
    const put = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
    if (color !== undefined) put.run('building_color', color);
    if (icon !== undefined) put.run('building_icon', icon);
  } finally {
    if (db !== open?.db) db.close();
  }
  return describe(id);
}

function active() {
  return open;
}

// On its own line for the desktop shell to read, the same way it reads the
// port. It is what lets a revived server reopen this building.
function announce() {
  console.log(`APARTMENT_BUILDING=${open ? open.id : ''}`);
}

// Every route except /buildings and /health sits behind this. A request with
// no building open is refused with a code the screen recognises, so it can go
// back to the chooser instead of showing the message beside some field.
function requireBuilding(req, res, next) {
  if (open) return next();
  res.status(400).json({ error: 'ยังไม่ได้เลือกตึก กรุณาเลือกตึกก่อน', code: 'NO_BUILDING' });
}

function start() {
  ensureDirs();
  adoptLegacy();
  const reopen = process.env.APARTMENT_OPEN_BUILDING;
  if (reopen && ID.test(reopen) && fs.existsSync(fileOf(reopen))) select(reopen);
}

module.exports = { start, list, create, select, close, remove, setLook, active, requireBuilding };
