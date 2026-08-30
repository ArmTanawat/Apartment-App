# Apartment Management — Backend

## Run it

```
cd backend
npm install
node server.js
```

Server starts at http://localhost:3001
The database file `apartment.db` is created automatically on first run.

## Files

- `db.js` — creates apartment.db and all tables
- `backup.js` — copies the database to backups/ on every start, keeps the last 30
- `routes/backups.js` — list backups and trigger one on demand
- `server.js` — starts the server, mounts the route files
- `routes/tenants.js` — /tenants endpoints
- `routes/units.js` — /units endpoints (including /units/vacant)
- `routes/leases.js` — /leases endpoints (including the double-booking check)

## Endpoints so far

### Tenants
- `GET /tenants` — list all
- `GET /tenants/:id` — one tenant
- `POST /tenants` — create
- `PUT /tenants/:id` — update
- `DELETE /tenants/:id` — delete (blocked if they have leases)

### Units
- `GET /units` — all rooms with occupancy status and any scheduled move-out
- `GET /units/vacant` — empty rooms only
- `GET /units/:id` — one unit
- `POST /units` — create
- `PUT /units/:id` — update
- `DELETE /units/:id` — delete (blocked if it has leases)

### Leases
- `GET /leases` — all leases with tenant and unit names
- `GET /leases/active` — current residents only
- `GET /leases/:id` — one lease, with its fees
- `POST /leases` — move a tenant in (blocks double-booking)
- `PUT /leases/:id/end` — move a tenant out
- `PUT /leases/:id` — correct lease details (send `end_date: null` to cancel a scheduled move-out); refuses a change that would overlap another lease on the same room
- `DELETE /leases/:id` — delete (blocked if it has bills)

### Meter readings
- `GET /readings?period=2026-08` — all rooms for a month (null = not entered yet)
- `GET /readings/previous/:unitId/:period` — last month's numbers, for auto-fill
- `GET /readings/history/:unitId` — every reading for one room
- `POST /readings` — record a month (send `water_rollover`/`elec_rollover` when a dial wrapped)
- `PUT /readings/:id` — correct a reading (send `water_curr: null` / `elec_curr: null` explicitly to clear one)
- `DELETE /readings/:id`

### Fees
- `GET /fees/basis` — what a percentage fee can be a percentage of, with its Thai labels
- `GET /fees/types` — the fee catalogue (`?all=true` includes retired)
- `POST /fees/types` — add a new kind of fee
- `PUT /fees/types/:id` — rename, reprice, or retire
- `DELETE /fees/types/:id` — only if never used
- `GET /fees/lease` — every recurring fee on every lease
- `GET /fees/lease/:leaseId` — recurring fees for a tenant
- `POST /fees/lease` — attach a recurring fee
- `PUT /fees/lease/:id` — change the amount
- `DELETE /fees/lease/:id` — stop charging it
- `GET /fees/onetime/:leaseId?period=2026-08` — one-time charges
- `POST /fees/onetime` — add a charge for one month only
- `PUT /fees/onetime/:id`
- `DELETE /fees/onetime/:id`

### Bills
- `GET /bills?period=2026-08` — bills for a month, or all
- `GET /bills/:id` — one bill with its printable line items
- `GET /bills/preview/:leaseId/:period` — calculate without saving (`?prorate=true&days=11`)
- `GET /bills/example/:kind/:units` — what N units of water or electricity cost at today's rates, for the worked example on the settings screen
- `POST /bills` — generate and save
- `POST /bills/batch` — generate for several rooms at once, reporting each room it skipped and why
- `DELETE /bills/:id`

### Settings
- `GET /settings` — utility rates, minimum charges, and meter digit counts
- `PUT /settings` — update one or several, e.g. `{"water_rate": 10}`
- `GET /settings/period/:period` — is the minimum applied this month?
- `PUT /settings/period/:period` — turn the minimum on or off for a month

### Backups
- `GET /backups` — list existing copies, newest first
- `POST /backups` — make a copy now

### Other
- `GET /health` — check the server is alive

## Monthly workflow

1. `GET /readings?period=2026-09` to see which rooms still need numbers
2. For each room, `GET /readings/previous/...` to prefill, then `POST /readings`
3. Add any one-time charges via `POST /fees/onetime`
4. Set whether the minimum applies: `PUT /settings/period/2026-09`
5. `POST /bills/batch` with the chosen rooms

## Fees that are a share of the bill

A fee type is either a fixed amount or a share of something else on the same
bill — a service charge that moves with the electricity, say. Set `percent_of`
and `percent` on the fee type and `default_amount` is ignored; send
`percent_of: null` to turn it back into a fixed fee.

`percent_of` is one of `water`, `electricity`, `rent`, `utilities` (the two
together) or `subtotal`. Both are copied onto `lease_fees` when the fee is
attached, exactly as `amount` is, so repricing the catalogue never rewrites
what an existing tenant agreed to.

A share prints as `รายเดือน Monthly`, the same as a fixed fee: the working is
deliberately left off, so the bill shows the amount and not the arrangement
behind it.

`subtotal` is rent, both utilities, the fixed recurring fees and that month's
one-time charges — and never another share. That exclusion is what makes it
well defined: two shares on one bill are both a share of the same figure, so
neither depends on which was worked out first.

`fee-basis.js` holds the list and the labels, because `routes/fees.js` needs it
to refuse a basis it does not know and `routes/bills.js` needs it to work the
amount out. Two copies would drift, and the one that drifted would be pricing
a bill.

## How the minimum charge works

Water and electricity have separate figures. With a threshold of 5 units, a flat
amount of 100 baht, and a rate of 9 baht:

| Units used | Charge |
|---|---|
| 3 | 100 |
| 5 | 100 |
| 8 | 127 (100 + 3 x 9) |

Switched off for a month, the charge is simply units x rate.

## Backups

Every server start copies `apartment.db` into `backups/` with a timestamp, keeping
the most recent 30. To restore, stop the server, copy a backup file over
`apartment.db`, and start again.

The database is a single file, so a backup is a plain file copy. Copy the folder
to a USB drive or cloud folder occasionally — a backup on the same failed disk is
not a backup.

## Errors are in Thai

Every message a `400` or `404` carries is written in Thai, because it is shown
to the user as it arrives. They name the specific thing —
`ห้อง 203 มีผู้เช่าอยู่แล้ว — สมชาย ใจดี (ถึง 2026-09-15)`, not `Conflict`.

The skip reasons in the `POST /bills/batch` response are read on screen the
same way, so they are Thai too.

## Bills are bilingual

Labels print as Thai then English: `ค่าเช่า Rent`. The working under each line is
Thai only. Fee names are whatever was typed, so type new fee types the same way.

Wording is frozen into `bill_items` when a bill is generated. Renaming a fee later
does not alter a bill already issued.

## Still to build

- Frontend (React)
- Printable bill output
