# Apartment Management — Database Design

**Purpose of the program:** look up unoccupied rooms quickly, enter each month's water and electricity readings, and generate a bill for every tenant. Payment tracking is a future addition, not part of this version.

---

## Tables at a glance

| Table | What it holds | Grows when |
|---|---|---|
| `tenants` | People who rent | A new tenant moves in |
| `units` | Rooms in the building | Never (set up once) |
| `leases` | Which tenant rents which room | A tenant moves in |
| `meter_readings` | Water + electricity per room per month | Every month, per room |
| `fee_types` | Catalogue of possible fees | You add a new kind of fee |
| `lease_fees` | Recurring fees — charged every month | A tenant adds parking, etc. |
| `one_time_charges` | Charges for a single month only | A repair, a replacement |
| `bills` | Finished monthly bills | Every month, per tenant |
| `bill_items` | The printed breakdown of each bill | With every bill |
| `receipts` | The paper issued after a tenant pays | When a receipt is printed |
| `settings` | Water and electricity rates, and minimum charges | Rarely |
| `period_settings` | Whether the minimum applies in a given month | Once a month |

---

## Schema

### `tenants`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `full_name` | TEXT | Required — the only one |
| `phone` | TEXT | Prints on the bill |
| `id_card` | TEXT | National ID / passport |
| `id_card_issued` | TEXT | `'YYYY-MM-DD'` |
| `id_card_expires` | TEXT | `'YYYY-MM-DD'` |
| `address` | TEXT | Home address — prints on the bill |
| `line_id` | TEXT | |
| `vehicle_plate` | TEXT | Free text; several cars go in one box |
| `note` | TEXT | Free text |

`address` is plain text and is never queried, filtered, or grouped on. Splitting it into street / district / province columns would only pay off if you needed to search by them, which this program does not.

**Three of these print, the rest are kept.** `full_name`, `phone` and `address` reach an invoice. `id_card` and everything after it reach nothing — no bill, no receipt, no report. They are the landlord's own record of who is in the building: wanted at the moment a tenant is standing at the desk, and gone a week later if nobody wrote them down. The form says so under its own heading rather than leaving the distinction to be guessed at.

**The card dates are stored, not watched.** `id_card_issued` and `id_card_expires` are `'YYYY-MM-DD'` like every other date here, but nothing compares them against today and nothing warns when one passes. That is deliberate rather than unfinished — the program does not know what it would want the landlord to *do* about an expired card, and a warning nobody can act on is worse than none. If that changes, the data is already in the right shape for it.

**Why the vehicle plate is on the tenant and not the lease.** A car belongs to a person, not to a room, and a tenant renting three rooms has one car between them rather than three. It is one free-text box, so somebody with two cars types both and nothing counts them — this is a note, not a register. The parking *fee* is a separate thing entirely and lives in `lease_fees`, where it is charged per room.

**Adding another of these is one line in three places.** The column in `db.js`, an `addColumn` beside it for databases that already exist, and the name in `OPTIONAL` in `routes/tenants.js` — the insert and the update both build their SQL from that list, so they cannot drift apart. Then a field in `TenantExtra`.

### `units`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `unit_number` | TEXT | e.g. "201" |
| `floor` | INTEGER | |
| `base_rent` | REAL | Standard price for this room (e.g. 3800) |

`base_rent` is the current asking price. It is copied onto a lease when a tenant moves in, so raising it later does not change existing tenants or past bills.

There is deliberately **no** `status` or `is_occupied` column. Occupancy is derived from `leases` — a column would drift out of sync every time someone forgot to update it.

### `leases`

The centre of the schema. One row = one tenant renting one room for a period of time.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `tenant_id` | INTEGER | → `tenants.id` |
| `unit_id` | INTEGER | → `units.id` |
| `start_date` | TEXT | `YYYY-MM-DD` |
| `end_date` | TEXT | `NULL` = still living there |
| `monthly_rent` | REAL | Copied from `units.base_rent` at move-in |
| `deposit` | REAL | |

**One tenant can have many leases** — someone renting three rooms is simply three rows with the same `tenant_id`. A unit can also have many leases, but *over time* (last year's tenant, then this year's), never simultaneously — see the double-booking rule below.

### `meter_readings`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `unit_id` | INTEGER | → `units.id` |
| `period` | TEXT | `'2026-08'` |
| `water_prev` | REAL | Last month's meter number |
| `water_curr` | REAL | This month's meter number. Null until the meter is read |
| `water_rollover` | REAL | The meter's capacity, when the dial wrapped. 0 normally |
| `elec_prev` | REAL | |
| `elec_curr` | REAL | |
| `elec_rollover` | REAL | |

Attached to the **unit**, not the lease — the meter belongs to the room and keeps counting when a tenant changes.

Both `prev` and `curr` are stored rather than computing usage by looking up last month. This makes each row self-contained and auditable, and survives a skipped month or a corrected typo. In the UI, `prev` auto-fills from last month's `curr`, so only one number is typed.

Usage = `(curr + rollover) - prev`.

`rollover` is 0 almost always. A mechanical meter has a fixed number of digits and returns to zero when it fills, so 9995 followed by 12 on a four-digit meter is 17 units used, not a mistake. Storing the capacity keeps the two readings as they actually appeared on the dial while still producing the right usage.

A replaced meter looks identical but is not the same thing — it starts at zero, so usage is just the current number. That case sets `prev` to 0 and leaves `rollover` alone. Getting the two confused bills the wrong amount, so the program asks rather than guessing.

Add a unique constraint on `(unit_id, period)` so the same room cannot be entered twice for the same month.

### `fee_types`

The catalogue of fees that *can* exist.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `name` | TEXT | "Facility fee", "Car parking", "Motorcycle parking" |
| `default_amount` | REAL | Suggested amount |
| `is_active` | INTEGER | 0 or 1 — hide retired fees without deleting history |

Because this is a table and not hardcoded values, adding a new kind of fee is a data entry action in the UI, not a code change and rebuild.

Use `is_active = 0` to retire a fee rather than deleting the row — deleting would break old bills that referenced it.

### `lease_fees`

Which tenant actually pays which fees.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `lease_id` | INTEGER | → `leases.id` |
| `fee_type_id` | INTEGER | → `fee_types.id` |
| `amount` | REAL | Defaults to `fee_types.default_amount`, can be overridden |

The separate `amount` allows a per-tenant override (a discount, or a grandfathered old price) without affecting anyone else.

### `one_time_charges`

A charge that appears on one month's bill and never again — a repair, a replacement, a penalty.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `lease_id` | INTEGER | → `leases.id` |
| `period` | TEXT | `'2026-08'` — the only month this appears on |
| `description` | TEXT | "Replaced broken door handle" |
| `amount` | REAL | |

This is deliberately a separate table from `lease_fees`. The two look similar but behave oppositely: a motorcycle space recurs every month, a broken door does not. Filing a repair under `lease_fees` would silently charge the tenant for that door every month afterwards.

There is no unique constraint on `(lease_id, period)` — two separate repairs in one month are normal, and each should appear as its own line.

The question when adding any charge is simply: does this happen again next month? Yes → `lease_fees`. No → here.

### `bills`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `lease_id` | INTEGER | → `leases.id` |
| `period` | TEXT | `'2026-08'` |
| `rent_amount` | REAL | |
| `water_amount` | REAL | |
| `elec_amount` | REAL | |
| `fees_amount` | REAL | All add-on fees combined |
| `total` | REAL | Sum of the above |

Amounts are **stored, not recalculated**. A bill is a historical record: if the water rate changes next year, last year's bills must still show what was actually charged. This is what makes month-by-month history reports correct.

### `bill_items`

The printed breakdown — one row per line on the bill.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `bill_id` | INTEGER | → `bills.id`, `ON DELETE CASCADE` |
| `label` | TEXT | "Water", "Motorcycle parking" |
| `detail` | TEXT | "12 units x 18 baht (100 to 112)" |
| `amount` | REAL | |
| `sort_order` | INTEGER | Keeps the printed order stable |

`bills` holds the totals for accounting; `bill_items` holds what the tenant actually reads. `detail` carries the working, so a tenant can see where a number came from rather than being asked to trust it.

These rows are written at generation time and never touched again. Rebuilding the breakdown later from `lease_fees` would print today's prices onto an old bill.

### `receipts`

The paper a tenant is given after they pay.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `bill_id` | INTEGER | → `bills.id`, **UNIQUE**, **ON DELETE CASCADE** |
| `issued_at` | TEXT | `datetime('now','localtime')` |
| `note` | TEXT | About this payment, not about every bill |

This table records that a document was printed. It does **not** record that money arrived: there is no paid flag, no amount received and no payment table, and adding one is still out of scope.

**Why there is no receipt number.** A number is an identity, and an identity is a promise: once it is printed on paper in a tenant's file, the program can never contradict it. That promise is what used to make a receipt permanent — it could not be cancelled, and the bill under it could not be corrected, because either would leave the paper disagreeing with the database.

Dropping the number drops the promise, and everything else follows from that. The row is now nothing but a marker that says "the paper for this bill has been printed", plus a note. The room, the period, every line and the total are read off the bill each time the page is drawn.

**Why `bill_id` is UNIQUE.** One bill, one receipt. Without it, pressing the button twice would produce two pieces of paper for one payment.

**Why `bill_id` cascades.** Correcting a bill is a delete and an insert, so the receipt for the old bill has to go somewhere. Taking it with the bill is the only option that leaves nothing dangling: the room reads `ยังไม่ได้ออก` again and the user issues afresh against the corrected figures. Without the cascade the delete fails on the foreign key and a receipted bill becomes uncorrectable, which is the behaviour this replaced.

**What is lost, and why it was acceptable.** A receipt book with numbers can be audited — a gap in the sequence is a question. This one cannot be. That was the owner's call: the building is small, receipts are handed over in person, and being unable to fix a wrong meter reading after issuing a receipt cost more than the audit trail was worth.

**Migrating an existing database.** `db.js` rebuilds the table when it finds the old `receipt_no` column, because SQLite will not drop a column a UNIQUE constraint is built on, and cannot add `ON DELETE CASCADE` to an existing foreign key. Rows, ids, notes and timestamps are carried across; only the numbers are dropped. It runs once and is a no-op afterwards.

`issued_at` uses `datetime('now','localtime')` like every other timestamp here. UTC would date a receipt issued at 2am to the previous day.

### `settings`

A key–value table. All values are stored as TEXT so one table can hold both a rate and the building's name; the numeric ones are converted on read in `routes/settings.js`.

| Key | Meaning | Example |
|---|---|---|
| `building_name` | The building's own name, shown in the app and on bills | บ้านสวนพลู |
| `building_address` | Printed as the invoice header. May be blank | 88/1 ซ.สวนพลู 4 … |
| `building_phone` | Printed as the invoice header. May be blank | 02-123-4567 |
| `bank_name` | Printed at the foot of the invoice. May be blank | ธนาคารกสิกรไทย |
| `bank_account_number` | | 123-4-56789-0 |
| `bank_account_name` | | นายสมชาย ใจดี |
| `bill_note` | Free text printed on every bill. May be blank | ชำระภายในวันที่ 5 … |
| `water_rate` | Baht per unit above the threshold | 9 |
| `water_min_units` | Units covered by the flat amount | 5 |
| `water_min_amount` | Flat amount for that first block | 100 |
| `electricity_rate` | Baht per unit above the threshold | 9 |
| `electricity_min_units` | Units covered by the flat amount | 5 |
| `electricity_min_amount` | Flat amount for that first block | 100 |
| `water_meter_digits` | Digits on the dial, for rollover | 4 |
| `electricity_meter_digits` | Digits on the dial, for rollover | 4 |

Water and electricity have entirely separate figures. They are not required to match.

Key–value was kept rather than one row with six columns because the set of settings will keep growing, and adding a setting should be an `INSERT` rather than an `ALTER TABLE`.

### `period_settings`

Whether the minimum charge applies in a given month.

| Column | Type | Notes |
|---|---|---|
| `period` | TEXT | Primary key — `'2026-09'` |
| `apply_minimum` | INTEGER | 0 or 1 |

This cannot live in `settings`. A setting holds a value that stays in force until changed; this one is a decision made per month, and last September's answer must remain readable next year.

One row per month covers the whole building. There is no per-room switch — that was a deliberate choice, because ticking twenty rooms every month is worse than one tick.

A month with no row defaults to the minimum being applied.

### How the minimum charge is calculated

Using water, with threshold 5 units, flat amount 100 baht, rate 9 baht:

| Units used | Charge | Working |
|---|---|---|
| 3 | 100 | Below the threshold — flat amount only |
| 5 | 100 | At the threshold — flat amount only |
| 8 | 127 | 100 + (3 units above x 9) |

```js
const charge = used <= minUnits
  ? minAmount
  : minAmount + (used - minUnits) * rate;
```

With the minimum switched off for that month, the charge is simply `used * rate`.

The figures are read at generation time and the resulting baht amount is frozen onto the bill. Editing a rate afterwards never changes a bill already generated — the same guarantee that applies to every other amount.

---

## What you should know

**Every date comparison uses `date('now','localtime')`, never `date('now')`.** SQLite's `now` is UTC. Thailand is seven hours ahead, so between midnight and 7am plain `date('now')` returns yesterday — a room whose lease ends today would still show as occupied all morning, and `/units/vacant` would miss it. The same applies to `datetime('now')` on `bills.created_at`, which would otherwise record a time seven hours off.

The program reads the machine's clock and needs no network, so this works offline. It does mean a wrong system clock produces wrong dates, and there is nothing to check that against.

**Occupancy is derived, never stored.** A unit is unoccupied if it has no lease that is currently active (`end_date IS NULL` or in the future). Nothing needs to be manually marked.

```sql
SELECT * FROM units
WHERE id NOT IN (
  SELECT unit_id FROM leases
  WHERE end_date IS NULL OR end_date > date('now')
);
```

**"Month" is a column, not a table.** `period` stored as `'2026-08'` on `meter_readings` and `bills` is all that is needed. A dedicated months table would contain nothing but dates.

**Rent is copied, not referenced.** `units.base_rent` is today's price; `leases.monthly_rent` is what this tenant agreed to. Copying at move-in means a price increase never rewrites history.

**Money uses REAL, and that is safe here.** In SQLite `REAL` is an 8-byte double — there is no true decimal type available, so the real choice is between `REAL` and storing integer satang.

Floating point only loses precision on fractions that are not powers of two. `0.1` is the well-known offender (`0.1 + 0.2` gives `0.30000000000000004` in every language). But `0.5` is exactly `2⁻¹` and is stored perfectly. Since amounts here land on whole baht and half baht, `REAL` is exact.

The one place error can enter is an intermediate calculation — a rate such as `5.70` multiplied by a usage figure. Guard against it by rounding when the bill is written:

```js
const water_amount = Math.round(usage * rate * 100) / 100;
```

Integer satang (3800 baht stored as `380000`) is the stricter approach and is what financial systems use. It was not chosen here because every read and write would need a ×100 or ÷100, and one missed conversion produces a bill 100× wrong.

**The bank details are text on a bill, not payment tracking.** Rent is taken in cash and by transfer, so the account has to be printed for the tenant. Nothing records whether anyone paid; that remains out of scope.

`bill_note` is free text so a due date, a holiday closure, or a Line ID can reach every tenant without needing a new setting each time.

**Payments were left out on purpose.** When added later, a `payments` table will point at `bills.id`. Nothing in this design needs restructuring for that.

**Periods stay Gregorian in the database.** `'2026-09'` sorts and compares correctly as text. Displaying a Buddhist year is a formatting function on the frontend, not a stored value.

**The database is backed up on every server start.** `backup.js` copies `apartment.db` into `backups/` with a timestamp and keeps the last 30. It runs before the database is opened, so the copy is of a settled file. The whole database being one file is what makes this trivial — and without it, a corrupted file loses every bill ever generated, since no server holds a copy.

**`settings.value` is TEXT, and numeric settings are converted on read.** One table holds both a rate and the building's name. `routes/settings.js` keeps the list of numeric keys and does the conversion once, so nothing downstream has to remember that `9` arrived as a string — `'9' + 1` would give `'91'` and a bill would be silently wrong.

**A meter's digit count lives in settings, not in the reading.** `water_meter_digits` and `electricity_meter_digits` give the dial's capacity for a rollover — five digits wrap at 100000. Counting the digits in the reading itself is wrong for any meter showing a padded number: a five-digit dial reading 500 looks like three digits and would add 1000 instead of 100000.

---

## Two rules that must live in code

The database can enforce a lot on its own, but these two things it cannot. Both are easy to write and easy to forget.

### Rule 1 — round money when writing a bill

`REAL` is exact for whole and half baht, but an intermediate calculation with an awkward rate (say `5.70` per unit) can produce a long trailing decimal. Round once, at the moment the amount is written to `bills`:

```js
const water_amount = Math.round(usage * water_rate * 100) / 100;
const elec_amount  = Math.round(usage_elec * elec_rate * 100) / 100;
```

`Math.round(x * 100) / 100` is the standard 2-decimal round. Do this for every amount going into `bills` — rent, water, electricity, fees, and the total. Once stored, the number is frozen and correct forever.

### Rule 2 — block double-booking a unit

Foreign keys can guarantee that a `lease.unit_id` points at a real unit. They **cannot** guarantee that a unit has only one active lease at a time — that rule involves comparing dates across other rows, which a foreign key does not do.

So this must be checked in the Express route **before** inserting a new lease:

```js
// Inside POST /leases, before the INSERT
const conflict = db.prepare(`
  SELECT id FROM leases
  WHERE unit_id = ?
    AND (end_date IS NULL OR end_date > date('now'))
`).get(unit_id);

if (conflict) {
  return res.status(400).json({ error: 'This unit already has an active lease' });
}
```

Without this check nothing errors — the row inserts happily, and the room silently appears rented to two people at once. It shows up much later as a confusing bug, which is why it is worth writing on day one.

The same category of rule applies elsewhere: one meter reading per unit per month, one bill per lease per month. Those two can be enforced by the database with a `UNIQUE(unit_id, period)` and `UNIQUE(lease_id, period)` constraint, because they only involve columns in a single row.

---

## Design decisions

**No `is_occupied` column.** Occupancy is derived from lease dates: a unit is vacant when it has no lease with `end_date IS NULL OR end_date > date('now')`. A stored flag would drift out of sync the first time someone forgot to update it. This is why moving a tenant out automatically frees the room with no second write.

**Rent is copied onto the lease, not referenced.** `units.base_rent` is today's asking price; `leases.monthly_rent` is what this tenant agreed to. Copying at move-in means raising the rent later never rewrites an existing tenant's terms or a past bill.

**Bills store amounts, they do not recalculate them.** A bill is a historical record. If the water rate changes, last year's bills must still show what was charged. Never compute a bill total on read.

**Meter readings attach to units, not leases.** The meter belongs to the room and keeps counting when a tenant changes. Readings store both `prev` and `curr` so each row is self-contained and survives a skipped month or a corrected typo.

**Fee types are data, not code.** `fee_types` is a table so new fee kinds are added through the UI without a code change. Retire a fee with `is_active = 0`; never delete, because old bills reference it.

**Recurring and one-time charges are separate tables.** `lease_fees` recurs every month (parking, facility). `one_time_charges` is filed under a single `period` and appears on that month's bill only (a repair, a replacement). Putting a repair into `lease_fees` would silently bill the tenant for it every month afterwards. When adding a charge, the question is always "does this happen again next month?"

**`bill_items` stores the printed breakdown.** Each line is written at generation time with its own label, detail, and amount. Reconstructing the breakdown later from `lease_fees` would show today's prices on an old bill.

**One tenant can hold many leases.** Someone renting three rooms is three rows in `leases`. This is intended, not a bug to guard against.

**Utility settings are key–value, the monthly switch is a table.** `settings` holds six rows: a rate, a minimum threshold, and a minimum flat amount for each of water and electricity, with entirely separate figures. Adding a setting should be an `INSERT`, never an `ALTER TABLE`.

Whether the minimum applies is decided per month, so it lives in `period_settings` keyed by period. It is one switch for the whole building — not per room, because ticking twenty rooms every month is worse than one tick. A month with no row defaults to applying the minimum.

**Changing how a charge is calculated never touches the schema.** Bills store computed amounts, so the minimum-charge formula and prorated rent both slot into `buildBill()` and land in the existing columns. If a change to the calculation seems to need a new column, check that assumption first — it usually means the working belongs in `bill_items.detail` instead.

**Rent by the day is opt-in per bill.** Full month is the default because it is what nearly always happens. When chosen, `monthly_rent / days_in_month * days_occupied`, with the working recorded in the bill line, for example "11 of 30 days".

---

## Monthly workflow this supports

1. Enter this month's water and electricity meter numbers for each room — `prev` auto-fills, type only `curr`
2. Program calculates usage and multiplies by the rate from `settings`
3. Program adds `monthly_rent` from the lease plus every fee in `lease_fees`
4. A row is written to `bills` with each amount frozen in place
5. Bill can be printed or viewed, and remains an accurate record of that month forever
