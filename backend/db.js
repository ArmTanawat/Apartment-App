// db.js — creates the database file and defines every table.
// Runs on every server start; nothing is destroyed because of IF NOT EXISTS.

// better-sqlite3 is compiled against a particular runtime's ABI, and Node and
// Electron do not share one. So there are two builds of it: backend's own, for
// `node server.js`, and the one at the repository root, rebuilt for Electron.
//
// The packaged app ships only the second, so nothing has to be chosen there.
// Running from source, backend/node_modules is nearer and would shadow it, and
// the child would load a module built for the wrong runtime — so the main
// process says which one to use. Absent, this is the ordinary require it
// always was.
const Database = require(process.env.APARTMENT_SQLITE || 'better-sqlite3');
const { dbPath } = require('./data-dir.js');

const db = new Database(dbPath);

// SQLite ships with foreign key enforcement OFF for backwards compatibility.
// Without this line the REFERENCES clauses below are decorative — you could
// insert a lease pointing at tenant 999 that does not exist. Turn it on.
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name  TEXT NOT NULL,
    phone      TEXT,
    id_card    TEXT,
    address    TEXT,
    note       TEXT
  );

  CREATE TABLE IF NOT EXISTS units (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_number TEXT NOT NULL UNIQUE,
    floor       INTEGER,
    base_rent   REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leases (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id    INTEGER NOT NULL REFERENCES tenants(id),
    unit_id      INTEGER NOT NULL REFERENCES units(id),
    start_date   TEXT NOT NULL,
    end_date     TEXT,
    monthly_rent REAL NOT NULL,
    deposit      REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS meter_readings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id        INTEGER NOT NULL REFERENCES units(id),
    period         TEXT NOT NULL,
    water_prev     REAL NOT NULL,
    water_curr     REAL,
    water_rollover REAL NOT NULL DEFAULT 0,
    elec_prev      REAL NOT NULL,
    elec_curr      REAL,
    elec_rollover  REAL NOT NULL DEFAULT 0,
    UNIQUE (unit_id, period)
  );

  CREATE TABLE IF NOT EXISTS fee_types (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL UNIQUE,
    default_amount REAL NOT NULL DEFAULT 0,
    is_active      INTEGER NOT NULL DEFAULT 1,
    -- A fee type is either a fixed amount or a share of something else on the
    -- same bill. percent_of names what it is a share of (see fee-basis.js) and
    -- is NULL for the ordinary fixed kind, which is what nearly every fee is.
    -- default_amount is ignored when percent_of is set.
    percent_of     TEXT,
    percent        REAL
  );

  CREATE TABLE IF NOT EXISTS lease_fees (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lease_id    INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    fee_type_id INTEGER NOT NULL REFERENCES fee_types(id),
    amount      REAL NOT NULL,
    -- Copied from the fee type at attach time, exactly as amount is, and for
    -- the same reason: changing the catalogue must never rewrite what an
    -- existing tenant agreed to. Both NULL for a fixed fee, and then amount is
    -- what counts.
    percent_of  TEXT,
    percent     REAL,
    UNIQUE (lease_id, fee_type_id)
  );

  CREATE TABLE IF NOT EXISTS one_time_charges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lease_id    INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    period      TEXT NOT NULL,
    description TEXT NOT NULL,
    amount      REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bills (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    lease_id      INTEGER NOT NULL REFERENCES leases(id),
    period        TEXT NOT NULL,
    rent_amount   REAL NOT NULL,
    water_amount  REAL NOT NULL,
    elec_amount   REAL NOT NULL,
    fees_amount   REAL NOT NULL,
    total         REAL NOT NULL,
    created_at    TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE (lease_id, period)
  );

  CREATE TABLE IF NOT EXISTS bill_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id     INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    detail      TEXT,
    amount      REAL NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
  );

  -- A receipt is a document handed to a tenant after they pay. The program
  -- still records nothing about payment: this row says a piece of paper was
  -- issued, not that money arrived anywhere.
  --
  -- There is no receipt number. The receipt carries no identity of its own —
  -- it is the paper form of one bill, and the bill is what identifies it. That
  -- is what lets a receipt be cancelled and issued again, and what lets its
  -- figures follow a bill that was corrected: nothing was printed on it that
  -- the program would then be contradicting.
  --
  -- One receipt per bill, which is UNIQUE rather than checked in code.
  --
  -- ON DELETE CASCADE is the whole of the correction story. Correcting a bill
  -- is a delete and an insert, so the receipt for the old bill goes with it and
  -- the room shows ยังไม่ได้ออก again. Without the cascade the delete would
  -- fail on the foreign key and a receipted bill would be uncorrectable, which
  -- is the behaviour this replaced.
  CREATE TABLE IF NOT EXISTS receipts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id     INTEGER NOT NULL UNIQUE REFERENCES bills(id) ON DELETE CASCADE,
    issued_at   TEXT DEFAULT (datetime('now','localtime')),
    note        TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS period_settings (
    period        TEXT PRIMARY KEY,
    apply_minimum INTEGER NOT NULL DEFAULT 1
  );
`);

// Columns added after a database was already in use.
//
// CREATE TABLE IF NOT EXISTS does nothing to a table that exists, so a new
// column has to be added on its own. Guarded by what the table actually has,
// so this is a no-op on the second start and on a database created fresh.
function addColumn(table, column, declaration) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all()
    .some(c => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  }
}

addColumn('fee_types', 'percent_of', 'TEXT');
addColumn('fee_types', 'percent', 'REAL');
addColumn('lease_fees', 'percent_of', 'TEXT');
addColumn('lease_fees', 'percent', 'REAL');

// Receipts used to carry a running number and to hold their bill down. Both
// are gone: a receipt is now the paper form of a bill, cancellable, and its
// figures follow the bill if it is corrected.
//
// Neither change can be made with ALTER TABLE. SQLite refuses to drop a column
// that a UNIQUE constraint is built on, and a foreign key cannot have
// ON DELETE CASCADE added to it afterwards. So the table is rebuilt, by the
// procedure SQLite's own documentation gives for this: foreign keys off, the
// whole thing in one transaction, and a foreign_key_check before committing.
//
// Guarded on the old column, so it runs once on a database that predates the
// change and never on one created since.
function dropReceiptNumbers() {
  const cols = db.prepare(`PRAGMA table_info(receipts)`).all();
  if (!cols.length || !cols.some(c => c.name === 'receipt_no')) return;

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE receipts_new (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          bill_id     INTEGER NOT NULL UNIQUE REFERENCES bills(id) ON DELETE CASCADE,
          issued_at   TEXT DEFAULT (datetime('now','localtime')),
          note        TEXT
        );
        INSERT INTO receipts_new (id, bill_id, issued_at, note)
          SELECT id, bill_id, issued_at, note FROM receipts;
        DROP TABLE receipts;
        ALTER TABLE receipts_new RENAME TO receipts;
      `);

      const broken = db.prepare(`PRAGMA foreign_key_check`).all();
      if (broken.length) {
        throw new Error(`ย้ายตารางใบเสร็จไม่สำเร็จ: พบข้อมูลที่อ้างถึงแถวที่ไม่มีอยู่ ${broken.length} แถว`);
      }
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  console.log('ปรับตารางใบเสร็จแล้ว: เลิกใช้เลขที่ใบเสร็จ ใบเสร็จเดิมยังอยู่ครบ');
}

dropReceiptNumbers();

// Seed the utility rates only if missing. INSERT OR IGNORE does nothing when
// the key already exists, so edited rates are never reset on restart.
//
// Water and electricity have completely separate figures. A minimum charge
// means the first `min_units` are covered by a flat `min_amount`, and anything
// above that is charged at `rate` per unit.
const seedSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);

// The building's own details. These print as the header of an invoice, so the
// tenant can see who issued it and where to ask about it. Stored as text, which
// is why `value` is TEXT rather than REAL — numeric settings convert on read.
seedSetting.run('building_name', 'บ้านสวนพลู');
seedSetting.run('building_address', '');
seedSetting.run('building_phone', '');

// Printed at the foot of an invoice. Rent is taken both in cash and by
// transfer, so the account details go on the bill; nothing about a payment is
// recorded, this is only the text a tenant needs in order to pay.
//
// bill_note is deliberately free text. Due dates, holiday closures, a change of
// office hours — anything that has to reach every tenant this month goes here
// rather than needing a new setting each time.
seedSetting.run('bank_name', '');
seedSetting.run('bank_account_number', '');
seedSetting.run('bank_account_name', '');
seedSetting.run('bill_note', '');

seedSetting.run('water_rate', 9);
seedSetting.run('water_min_units', 5);
seedSetting.run('water_min_amount', 100);

seedSetting.run('electricity_rate', 9);
seedSetting.run('electricity_min_units', 5);
seedSetting.run('electricity_min_amount', 100);

// How many digits each meter's dial has. Needed only when a dial fills and
// wraps back to zero: four digits wrap at 10000, five at 100000.
//
// This cannot be worked out from a reading — a five-digit meter showing 500
// reads as three digits and would be guessed wrong — so it is set here from
// the actual meters in the building. Four is what this building uses; change
// it if the meters differ.
seedSetting.run('water_meter_digits', 4);
seedSetting.run('electricity_meter_digits', 4);

// Starter fee types so the app is usable immediately. These are ordinary rows —
// add, rename, or retire them through the UI without touching this file.
//
// Names are bilingual because they are printed on the bill exactly as stored.
// A new fee type should be typed the same way: Thai first, then English.
const seedFee = db.prepare(`INSERT OR IGNORE INTO fee_types (name, default_amount) VALUES (?, ?)`);
seedFee.run('ค่าส่วนกลาง Facility fee', 500);
seedFee.run('ที่จอดรถยนต์ Car parking', 500);
seedFee.run('ที่จอดมอเตอร์ไซค์ Motorcycle parking', 300);

module.exports = db;
