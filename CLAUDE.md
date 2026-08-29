# Apartment Management App

Local software for managing a small apartment building. Three jobs: see which rooms are free, enter monthly water and electricity readings, and generate a bill for each tenant.

Read `HANDOFF.md` for where the project stands and what to do next. Read `DATABASE_DESIGN.md` for schema reasoning, `FRONTEND.md` for the screens. The source files are the truth for structure — `db.js` for tables, `prototype/rooms.html` for the frontend — not any document.

**Current state: the backend is finished and tested; the frontend is a prototype on mock data that has never called it.** The next job is wiring the two together, which includes deleting the duplicated bill calculation in `rooms.html`.

## Stack

- Backend: Node.js + Express, SQLite via `better-sqlite3`
- Frontend: currently one plain HTML file with vanilla JS (`prototype/rooms.html`). React was the original plan and is still a reasonable target, but the prototype outgrew being a sketch and is now the working design — port it rather than restart.
- Runs locally on one machine. Backend on port 3001, frontend on 5173.
- Eventually wrapped in Electron as desktop software. Keep the API URL in one place so it stays a one-line change.

## Structure

```
backend/
├── db.js              creates apartment.db and all tables
├── server.js          starts the server, mounts routers, nothing else
└── routes/            one file per topic
```

Route files use `express.Router()` and declare paths relative to their mount point (`/` and `/:id`, never `/tenants/:id`). The prefix belongs in `server.js` only.

Adding a feature means one new file in `routes/` plus two lines in `server.js`. Do not put route logic in `server.js`.

## Rules the database cannot enforce

These must be checked in route handlers. Both were deliberate decisions, not oversights.

**One active lease per unit.** A unit may not have two overlapping leases. No foreign key or UNIQUE constraint can express this because it compares dates across other rows. `POST /leases` checks for an existing active lease before inserting and returns 400 naming the current tenant. Without this check SQLite accepts the insert silently.

**Round money when writing a bill.** `Math.round(x * 100) / 100` on every amount going into `bills`. `REAL` is exact for whole and half baht, but an awkward rate can produce a long trailing decimal.

**Never overwrite an existing bill.** Generating for a month already billed returns an error naming the room, and the batch route skips it and carries on. The user deletes the old bill first if a correction is needed. Silently replacing a bill destroys the only record of what was actually charged, with no warning.

**A failed room in a batch must not stop the others.** Generating for twenty rooms where two lack meter readings produces eighteen bills and reports the two by room number. Collect failures and return them alongside the successes rather than throwing on the first one.

**`end_date` is the day the room becomes free, not the last night slept.** A lease ending on the 16th and one starting on the 16th do not overlap. Moving out today makes the room vacant today, and a new tenant can start the same day.

Every date comparison must use this meaning. In practice that means `end_date > date` everywhere — the vacancy query, the active-lease lookup, the overlap guard in `POST /leases`, and the lease selection in `POST /bills/batch`. A single `>=` among them splits the system in two: the board reports a room as vacant while the overlap guard refuses to let anyone move in, with no error to trace. Grep for `end_date` before changing any of them.

**A bill is stored, so correcting one means deleting and regenerating it.** There is no in-place edit. Changing a meter reading or adding a charge does not touch a bill already saved, and reprinting it produces the same figures as before.

The screen hides this. Opening a bill quietly fetches `GET /bills/preview/:leaseId/:period` alongside it and compares. When they differ, a banner says the data changed after this bill was made, and one button does the whole correction — delete, regenerate, done. The user never sees a delete step.

**Compare the line items, not the total.** Two mistakes can cancel out: a meter corrected down by 450 and a repair added for 450 leave the total identical while both lines are wrong. A total-only check reports "nothing changed" on a bill that is wrong twice over.

A regenerated bill has a new id. If the old one was printed and handed over, say so — it needs reprinting.

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

## Conventions

**Route order.** Literal paths before parameterised ones. `/units/vacant` must be declared before `/units/:id` or Express reads "vacant" as an id. This bug is silent and confusing — watch for it whenever a new literal route is added.

**Errors.** Return a JSON object with an `error` key and a message a non-technical user can act on. Name the specific thing: `Unit 101 is already rented to Somchai Jaidee`, not `Conflict`.

Status codes: 400 for bad input or a broken business rule, 404 for a missing record, 201 on create, 204 on delete.

**Deletion is blocked when history depends on it.** A tenant with leases, a unit with leases, and a lease with bills cannot be deleted. Ending a lease is the normal action; deleting is only for correcting a mistake. Check the dependency and return a 400 explaining what to do instead, rather than letting SQLite throw a raw foreign key error.

**Partial updates use `??`, not `||`.** `deposit ?? existing.deposit` — with `||` a deposit of `0` would be treated as absent and overwritten.

**`db.pragma('foreign_keys = ON')` must stay in `db.js`.** SQLite disables foreign key enforcement by default. Without that line every `REFERENCES` clause is decorative.

## Frontend notes

Not built yet. These are decided in advance because the backend already behaves this way.

**Warn before editing a month that is already billed.** Changing a recurring fee, a one-time charge, or a meter reading affects only bills generated afterwards. A bill already saved keeps its own stored line items and does not change — which is correct, because it records what was actually charged.

So when the user edits anything for a period that already has a bill, say so plainly: "A bill for September already exists. This change will apply from next month." Offer to delete and regenerate the bill if the correction should apply to that month. Never silently leave the user thinking a fix took effect on a bill that it did not touch.

**Cancelling a recurring fee is a delete, not a flag.** `DELETE /fees/lease/:id` stops future charges. Past bills keep showing the fee because the tenant did pay it then. The UI should not present this as "the fee never existed" — it stops from now on.

**Use the preview endpoint before saving.** `GET /bills/preview/:leaseId/:period` returns the same figures `POST /bills` would store, without writing anything. Show it, let the user confirm, then post.

**The readings screen is a checklist.** `GET /readings?period=YYYY-MM` returns every room, with nulls for rooms not yet entered. Render those as empty inputs; the filled ones are already done. Call `GET /readings/previous/...` to prefill the previous-reading boxes so only one number is typed per utility.

**The batch billing screen reports partial success.** Selecting twenty rooms may produce eighteen bills and two failures. Show both: the count generated, and each failed room with its reason ("no meter reading for September", "already billed"). Do not show a plain success message when some rooms were skipped.

**Room selection offers three routes to the same list.** A range (101 to 109), a tick list, or select all. The range is a filter over the room list on the client — the API takes an explicit array of rooms either way.

**API base URL lives in one constant.** Everything goes through it, so wrapping the app in Electron later is a one-line change.

**Bills are bilingual, and the wording is frozen at generation.** System labels are Thai then English — `ค่าเช่า Rent`, `ค่าน้ำ Water`, `ค่าไฟ Electricity`. The working in `detail` is Thai only, because a bilingual version of every line would double the bill's length for no gain. Fee names come from `fee_types.name` and `one_time_charges.description`, typed by the user, so seeded fee types are written bilingually as the example to follow.

These strings land in `bill_items` and are never touched again. Editing a label later does not change a bill already generated — which is correct, and also means getting the wording right matters more than it looks.

**Periods stay Gregorian in the database.** `'2026-09'` sorts and compares correctly as text. Displaying a Buddhist year is a formatting function on the frontend, not a stored value.

**The database is backed up on every server start.** `backup.js` copies `apartment.db` into `backups/` with a timestamp and keeps the last 30. It runs before the database is opened, so the copy is of a settled file. The whole database being one file is what makes this trivial — and without it, a corrupted file loses every bill ever generated, since no server holds a copy.

**Label the move-out date for what it is.** Not วันย้ายออก, which is ambiguous about whether the room is free that day, but ห้องว่างตั้งแต่วันที่. The stored value is the day the room becomes available, and the label should say so rather than leaving the user to guess. Offer ว่างวันนี้ and สิ้นเดือนนี้ as shortcuts, since those are almost every case.

**A scheduled move-out must be visible.** `GET /units` returns `leaving_on` and `is_leaving` for a room whose tenant has a future end date. The room is still occupied, but it is about to come free, and a landlord looking for something to rent needs to see that. Show the date on the card and offer a กำลังจะว่าง filter.

**Cancelling a scheduled move-out sends `end_date: null` explicitly.** `PUT /leases/:id` checks for the key with `in` rather than `??`, so a null clears it. Omitting the key keeps the existing date. Anywhere else that uses `??` for partial updates, clearing is not possible — check before assuming a field can be blanked.

**Meter readings are editable from two places.** The บันทึกมิเตอร์ page for the monthly walk-through, and the room page for fixing one room on its own. Both call the same `POST /readings` and `PUT /readings/:id`. Duplicating the entry point is worth it — going to a list of sixteen rooms to correct the one already open is friction for no reason.

**A departed tenant is still reachable for the billing month.** The room page scopes fees and charges to every lease that occupied the room during the period, not to the lease active today. A tenant who left on the 10th still gets a bill for that month, and a repair found afterwards is theirs — so the charge form has to reach their lease. Filtering by `activeLease` alone silently makes that impossible.

**A reading below last month has three possible causes and they bill differently.** A typo, a replaced meter, or a dial that wrapped past its last digit. The API refuses the reading rather than guessing, and the screen asks which it was.

A replaced meter starts at zero, so the previous reading is set to 0 and usage is just the new number. A wrapped dial keeps counting from where it was, so `water_rollover` / `elec_rollover` holds the meter's capacity and usage is `(curr + rollover) - prev`. For 9995 → 12 on a four-digit meter that is 17 units; treating it as a replacement would bill 12 and lose 5.

**A reading may hold a previous figure with no current one.** `water_curr` and `elec_curr` are nullable. That is the state left after the previous figure was corrected upward and the meter has to be read again — refusing the correction until the current number is inflated first is backwards.

A row in that state counts as not entered on the checklist, produces no usage, and is skipped when the next month looks for its previous reading. `is_entered` therefore means both current numbers are present, not merely that a row exists.

**Save each meter on its own.** A water figure that is wrong must not discard an electricity figure typed correctly beside it. Returning early from a save because one of them failed loses the other, and the loss is invisible until the screen redraws.

**`settings.value` is TEXT, and numeric settings are converted on read.** One table holds both a rate and the building's name. `routes/settings.js` keeps the list of numeric keys and does the conversion once, so nothing downstream has to remember that `9` arrived as a string — `'9' + 1` would give `'91'` and a bill would be silently wrong.

**A meter's digit count lives in settings, not in the reading.** `water_meter_digits` and `electricity_meter_digits` give the dial's capacity for a rollover — five digits wrap at 100000. Counting the digits in the reading itself is wrong for any meter showing a padded number: a five-digit dial reading 500 looks like three digits and would add 1000 instead of 100000.

**Water and electricity are corrected separately.** Both can be below last month at once, and a rollover or a replacement applies to one meter, not the room. Any fix offered for a low reading has to name which meter it acts on.

**Every date comparison uses `date('now','localtime')`, never `date('now')`.** SQLite's `now` is UTC. Thailand is seven hours ahead, so between midnight and 7am plain `date('now')` returns yesterday — a room whose lease ends today would still show as occupied all morning, and `/units/vacant` would miss it. The same applies to `datetime('now')` on `bills.created_at`, which would otherwise record a time seven hours off.

The program reads the machine's clock and needs no network, so this works offline. It does mean a wrong system clock produces wrong dates, and there is nothing to check that against.

**One working month, shared by every page that has one.** บันทึกมิเตอร์ and บิล both act on it, and changing it on one changes it on the other. It starts at the current month.

**The board has no month picker.** It shows who is in which room *today* — occupancy, move-in, move-out are all live facts, and a board showing August would make its own buttons meaningless. It does use the working month for one thing: the note saying what is still outstanding. The page says which of the two each figure refers to, because mixing them silently is how a reader ends up trusting the wrong number.

**The working month never goes past the current one.** Nothing can be read or billed for a month that has not happened, and a reading typed into next month is a data error that surfaces weeks later. Going back is unlimited.

**The board must agree with what the forms allow.** If a room shows vacant, moving someone in must succeed. Any date rule used to colour a card has to be the same rule the form validates against.

## Testing

No test framework yet. Verify routes with curl against a running server. When testing a rule, test both sides — that valid input succeeds and that invalid input is actually blocked. A guard that was never seen to reject something has not been tested.

Delete `apartment.db` to start from a clean state; it is recreated on the next server start.

## Not in scope

Payments are a future addition. The design accommodates it — a `payments` table would point at `bills.id` — but do not build it. Multi-building support, tenant login, and online payment are not planned.
