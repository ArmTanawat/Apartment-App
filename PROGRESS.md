# Progress

The state of this project, written so a session that has never seen the repo can
continue from this file alone. It describes what exists now and why, not the
order it was built in.

**Status: finished and in use.** Every screen the prototype had runs in React
against the Express server, the whole thing is packaged as a desktop app, and
reports and receipts are built. `fetch` appears in exactly one file. The only
work not done is listed under [Open](#open) at the foot.

**Receipts changed shape on 2026-09-05** and this is the branch it happened on
(`editablereceipt`). They no longer carry a running number, they can be
cancelled, and correcting a bill carries its receipt with it. The reasoning and
what it cost are under [Receipts](#receipts); an existing database migrates
itself on the next server start.

---

## How to run it

**As a desktop app**, which is how the owner uses it:

```
npm run setup     # installs all three package.json files
npm start         # builds the frontend and opens the app
npm run dist:win  # one Windows installer, in release/
```

`npm run dist:win` runs the install, the checks, the frontend build and the
packaging in that order, so a rebuild in six months does not depend on
remembering it.

**From source:**

```
cd backend  && npm install && node server.js     # http://localhost:3001
cd frontend && npm install && npm run dev        # http://localhost:5173
```

`apartment.db` is created on first start. `npm run seed` (in `frontend/`) fills
it with a sample building, with the months placed relative to today. It cannot
clear a database that has receipts in it — see [Receipts](#receipts) — and says
so rather than throwing.

`archive/rooms.html` is the pre-React prototype. It is out of git and out of the
working tree's search path, kept on disk only because it still opens by
double-clicking. Nothing depends on it.

### Checking it

```
npm test
```

From the repository root. It starts its own server on its own temporary
database on a random free port, which the suites read from
`APARTMENT_TEST_PORT`, so a test run never touches the database being worked
on. It runs all suites and the two desktop-shell checks and reports each.

One at a time, from `frontend/`, which is what to do when one fails and the
detail matters:

```
npm run smoke            # the main walk through the screens
npm run smoke:offline    # what the screens do when the server is not there
npm run smoke:stale      # what they do when the data changed underneath them
npm run smoke:share      # fees that are a percentage of something else
npm run smoke:screens    # filter counts, the month picker, printing, previews
npm run smoke:rules      # the rules in CLAUDE.md, attacked at their boundaries
npm run smoke:receipts   # ใบเสร็จ and รายงาน
npm run check-text       # Thai baht words, and meter figures out of a bill line
```

Two checks are outside `npm test` on purpose:

- `npm run check-revive` launches the real app and kills the server underneath
  it several times. Slow. Run it after touching `electron/main.js`.
- `smoke/coldstart.jsx` needs a server on a database with no rooms in it — the
  first day of using the program. Move `apartment.db` aside, start the server,
  then `npx vite build --ssr smoke/coldstart.jsx --outDir smoke-dist && node
  smoke-dist/coldstart.js`.

---

## Structure

```
backend/            Express + SQLite; see backend/README.md for every endpoint
├── db.js           tables, and addColumn() for guarded migrations
├── data-dir.js     works out where the database and backups live
├── fee-basis.js    the five percentage bases and their Thai labels
└── routes/         one file per topic (9)

frontend/src/
├── App.jsx                    view router, the rail, the offline banner
├── styles/app.css             the prototype's <style> block, verbatim
├── lib/
│   ├── api.js                 THE base URL, and the two kinds of failure
│   ├── bills.js               preview, and the line-by-line staleness diff
│   ├── helpers.js             the rule-mirroring helpers, pure
│   ├── useApi.js              page-scoped fetching
│   └── useSubmit.js           what a dialog does with a write
├── state/
│   ├── DataContext.jsx        the collections, fetched; one named action per change
│   └── UiContext.jsx          view, working month, and the sticky per-screen bits
├── pages/                     one file per view
└── components/
    ├── RoomCard, MonthPicker, Modal, Switch, ErrBox
    ├── BillPaper.jsx          shared by BillPage and PrintAllPage
    └── modals/                one component per dialog (17), + ModalHost

electron/
├── main.js                    starts the server child, supervises it, shows the window
└── error.html                 the Thai failure page
```

Two deviations from the structure originally suggested, both deliberate:

- **`state/` rather than state inside `App.jsx`.** The prototype's module-level
  variables split into two kinds, data and UI. Keeping both in one component
  would have meant threading a dozen props through every page. `DataContext` is
  the file that got `fetch` in it; `UiContext` never did.
- **`components/modals/` is six files, not one.** Seventeen dialogs.

---

## How the frontend is put together

**A write refetches what it touched, rather than patching a local copy.**
`GET /units` already works out `is_occupied` and `leaving_on`, `GET /readings`
works out `is_entered`, `GET /leases` joins the tenant's name. Recomputing any
of that on the client would be a second copy of a rule that has to agree with
the first. `DataContext.load(keys)` refetches only the collections a given
action affects, so saving a meter is one request, not twenty.

**Occupancy is the server's answer, not a second calculation.** The board
colours a card from `is_occupied`, and the move-in guard is `POST /leases`'s
overlap check. There is no client-side `overlapping()`, and so no second `>`
that could drift from the rule in `CLAUDE.md`.

Two deliberate exceptions:

- **A reading below last month is detected on the client** — not to decide
  whether it is allowed, but to decide what to ask. The server refuses it
  either way with one message for both meters; the screen has to name which
  meter it is offering to fix. So the number is not sent, and the two fixes are
  offered per meter.
- **`leasesInPeriod` has no endpoint.** The screens work it out from the lease
  list using the same rule `POST /bills/batch` uses when it bills them.

**Text boxes that hold numbers keep their own draft string.** A box can hold
`""` or `1.` on its way to a number; a plainly controlled input would rewrite
that under the caret. The meter inputs, the settings boxes and the prorate-days
box display a local string and write the parsed number, so the stored value and
the displayed text are allowed to differ.

**Every date is typed into `DateField`, never a bare `<input type="date">`.**
Added 2026-09-26. The stored value is unchanged and must stay `YYYY-MM-DD`;
what moved is the display. A native date box takes its format from the
browser's locale, so on a machine set to US English it reads `mm/dd/yyyy`, and
on a Thai form `05/06` is a real date read either way round with nothing on
screen to say which. The component shows and accepts `dd/mm/yyyy` in a text box
of its own and keeps the native input beside it, one pixel wide and invisible,
purely so `showPicker()` has something to open — the calendar that appears is
still Chromium's. A wrong or half-typed date is not written and the box snaps
back to what is saved when it loses focus, so it can never show one date while
the form holds another. `31/02` is refused rather than rolled forward to
3 March, which is what `new Date()` does on its own. If `showPicker` is ever
missing the plain native box comes back whole.

**← → to the thing beside this one, on ห้อง, บิล and ใบเสร็จ.** Added
2026-09-26. `Pager` takes the list it is to walk, rather than working one out:
rooms in `units` order, which is the board's; bills in `bills` order, which is
`ORDER BY period DESC, unit_number` and so is the order บิลเดือนนี้ prints. A
second ordering here is how a pager comes to disagree with the list the user
came from.

It rides in `.pagebar` beside the back button, stuck to the top of the window.
`position:fixed` was tried first and taken out: the window opens at 1280 wide,
which leaves the content column reaching within 30px of the right edge, so a
floating button sits on top of a figure. Sticky stays inside the column and
still never scrolls away, which is the whole point on a page three screens tall.

Both ends disable rather than wrap or disappear — a control that moves is one
that gets mis-clicked — and the empty `.num` holds its width so the pair does
not resize at the ends.

**ใบเสร็จ pages between receipts, not between bills.** It fetches
`/receipts?period=` and steps only through bills that have one. Stepping
through all of them would land on `บิลใบนี้ยังไม่ได้ออกใบเสร็จ`, and early in
the month that is most of the list.

**บิลเดือนนี้ and ใบเสร็จเดือนนี้ fold away,** open on arrival, held in
`UiContext` like every other per-screen bit so leaving for one bill and coming
back keeps them as they were. A folded card keeps its summary on the heading
line — `4 ใบ · 21,882.00`, `ออกแล้ว 0 จาก 4 ใบ` — because the count and the
total are most of what the scroll to the bottom was for. The whole title is the
button; a chevron on its own is a target the size of a full stop.

`smoke:screens` covers both: the pager's two ends and that one card folding
leaves the other alone.

**`UiContext.meterRevision` replaces the prototype's `render()`** on the meter
page. It is bumped by the writes that do not come from typing — a rollover, a
replaced meter, a corrected previous figure — and keys the row block.

**Per-screen UI state lives in `UiContext`, not in the page.** `picked`, the
prorate switch, the filter chips, the tenant search box. In a page component
they would reset on every mount; leaving บิล to look at one bill and coming back
keeps the selection. Changing the month clears `picked` and `lastResult` and
nothing else.

**The working month is in `localStorage`**, clamped on the way in: a stored
month may be in the past but never in the future, because the browser can be
left open across a month boundary.

**The meter page saves 350ms after typing stops**, not per keystroke, and
flushes on the way out of the box. Writes for one room are queued so two meters
typed before the row exists cannot both POST and trip
`UNIQUE (unit_id, period)`.

**No `dangerouslySetInnerHTML` anywhere.** Grep for it before merging.

### When a write fails

- **`lib/api.js` separates the two kinds.** `ApiError` is the server saying no,
  with the message it wrote. `ApiDown` is the server not being there.
- **A refused action is a reason, not an error state.** `lib/useSubmit.js` shows
  the API's message inside the dialog and leaves it open, so the alternative it
  describes can be taken. Nothing is retried automatically.
- **The server being gone is said once, at the top, with a retry** — in
  `App.jsx`, driven by `down` in `DataContext`.
- **A failed write never looks like a success.** The sharp case is
  บันทึกมิเตอร์, which saves silently: a row whose save failed shows
  `ยังไม่ได้บันทึก` and the reason in place of `บันทึกแล้ว`.
  `npm run smoke:offline` checks exactly this.

### When the screen holds ids the server no longer has

A reseed under an open tab leaves every id on screen stale. Three pieces handle
it, and `npm run smoke:stale` holds all of them:

- `DataContext.guard` re-reads the collections when a write is **refused** —
  the server answered, so it is reachable, and the refusal may be because the
  screen points at something gone. Skipped when the server is simply
  unreachable, where re-reading would fail too.
- `ModalHost` maps each dialog to the record it is about and shows
  `ข้อมูลนี้ไม่มีอยู่แล้ว` rather than opening one whose subject has gone. One
  table in one file rather than a guard in seventeen dialogs.
- `App.jsx` does the same for ห้อง and ผู้เช่า, the two pages reached by id.

An ordinary refusal — deleting a lease that has bills — still shows its real
reason rather than a "gone" card.

**Not covered:** a stale screen that is never written to stays stale until
something reloads it. There is no polling, and for a single-user local app there
should not be.

---

## Backend

`backend/README.md` lists every endpoint and is the file to read for one. What
follows is only what a reader of the original design would not expect.

**`GET /bills/example/:kind/:units`** prices N units with no lease and no
reading, for the worked example on ตั้งค่า. `GET /bills/preview` cannot answer
it, and a copy of the minimum-charge formula on the client would defeat the
point of the block it sits in. It lives in `routes/bills.js` beside
`utilityCharge`, declared before `/:id` so `example` is not read as a bill id.

**`POST /bills/batch` accepts `prorate_days`**, as `POST /bills` already did.
Without it a run asked on screen to charge 11 of 30 days billed a full month.

**`PUT /readings/:id` tests `'water_curr' in req.body`, not `??`.** Clearing a
current reading is a real action: it is what emptying the box means, and what
correcting a previous figure upward leaves behind. Same treatment `end_date`
has on `PUT /leases/:id`, for the same reason.

**`PUT /leases/:id` runs the overlap check `POST /leases` runs**, against the
dates the update would leave behind and excluding the lease being edited.
Without it, correcting a start date backwards walked a lease into the previous
tenant's stay.

**`GET /fees/lease`** returns every recurring fee on every lease, so ตั้งค่า asks
once rather than once per lease. Until that answer is in, no delete button is
offered — offering to delete a fee type that turns out to be in use is worse
than not offering.

**Every error message is Thai.** All 81 of them, across the route files, plus
the skip reasons in the `POST /bills/batch` response and the 500 handler in
`server.js`. They keep the same specificity —
`ห้อง 203 มีผู้เช่าอยู่แล้ว — สมชาย ใจดี (ถึง 2026-09-15)`, not `Conflict`. A
route added later has to be written the same way; `backend/README.md` says so.

**`buildBill` refuses a half-entered reading.** A row can hold a previous figure
with no current one. `null` used to go through the arithmetic as zero and bill
negative usage — with the minimum on, a wrong line; with it off, a negative one
printed on the page the tenant is handed. Preview, `POST /bills` and the batch
all refuse it now, with the wording the prototype used
(`ยังจดมิเตอร์งวด ... ไม่ครบ`).

**`db.js` has `addColumn(table, column, declaration)`.** `CREATE TABLE IF NOT
EXISTS` does nothing to a table that already exists, so added columns need a
guarded `ALTER TABLE`. It is a no-op on a fresh database and on every start
after the first. Any future column needs it.

### The yearly meter report

Added 2026-09-10, beside the two monthly reports rather than changing either.

**It is the one report with an endpoint of its own,** `GET /readings/year/:year`.
The other two are built from collections the screens already hold; a year of
every room would be twelve requests, and the usage behind each figure has the
rollover rule in it. Returning finished numbers keeps that rule in `usage()` in
`routes/readings.js`, where `GET /readings` and `/history` already read it — a
second copy on the client would be the mistake `buildBill()` was moved off the
frontend to avoid. `smoke:rules` feeds it a wrapped dial and checks the answer
is 17 units rather than 12, which is the check that would catch a reimplementation.

The response is `{ year, years, rooms:[{unit_id, unit_number, floor, water:[12],
elec:[12]}] }`. `years` lists the years that have readings so the picker needs
no second call, with the current year always included.

**Nothing was added to the schema.** The report is a different arrangement of
`meter_readings`, not new data.

**Every cell is a number, 0 included.** A month with no reading and a month
entered but unfinished both come back as 0. A blank would read as something to
look into when the answer is that nothing was recorded.

**Its own year, not the working month narrowed.** `reportYear` is separate state
in `UiContext`; the month picker is swapped for a year picker while this report
shows. The working month belongs to บันทึกมิเตอร์ and บิล and moving one would
move the other, which is the two-frames-on-one-page problem the room page
already had to say out loud.

**A row opens two charts, one per meter,** hand-drawn SVG in `UsageChart.jsx` —
twelve points and one shape, where a charting library would be the largest
dependency in the app. Separate scales per meter because 18 units of water
against 146 of electricity flattens the water line to nothing on a shared axis;
each chart names its own peak so the scale is never guessed at. Pastel blue for
water, pastel orange for electricity, as `--water-line/-fill` and
`--elec-line/-fill`.

`Modal` gained a `wide` variant for it — a chart at form width is unreadable,
and widening every dialog to suit one would make the forms worse.

### The board's colour note on an empty room

Added 2026-09-10. `units.mark` — `'reserved'`, `'locked'` or NULL — set from two
small dots in the corner of an empty card on ห้องพัก, through
`PUT /units/:id/mark`.

**Colour now has four answers to the same one question:** can somebody be put in
this room today. Green no, red yes, amber promised to somebody (จองแล้ว), black
cannot be re-let yet after a tenant left without notice (ล็อค). That is a change
to what `FRONTEND.md` said — it used to say two — but not to the principle: they
are four answers to one question, not four questions.

**It is a note and no rule reads it.** `/units/vacant`, the overlap guard and the
batch all ignore it, so a marked room is still vacant and can still be moved
into; `POST /leases` clears the mark when somebody does. Making it a rule would
be a second definition of "empty" beside the one lease dates give, which is the
failure the derived-occupancy rule exists to prevent. `smoke:rules` asserts a
locked room is still returned by `/units/vacant` and can still be let.

**One column, not two flags,** because a room held for somebody is not a room
nobody may enter. Setting one replaces the other, and the route refuses any
other value rather than storing something nothing renders.

**The dots stop the click reaching the card,** so pressing one changes the
colour and pressing anywhere else opens the room. Only empty cards have them.
Every empty card also says its state in words, so the black and the red are not
a distinction anybody has to make by eye.

### The three sums taken at move-in

Added 2026-09-09. `leases` gained `guarantee` (เงินประกันสัญญาเช่าห้อง) and
`advance_rent` (ค่าเช่าล่วงหน้า) beside the `deposit` (มัดจำ) it already had.
Both `REAL DEFAULT 0`, edited in ย้ายเข้า and แก้สัญญาเช่า.

**Three columns rather than one** because they are settled differently at
move-out: มัดจำ comes back in full with damage billed apart, เงินประกัน is held
against the lease, ค่าเช่าล่วงหน้า is rent already paid for a month to come.
Summing them would lose the distinction at the only moment anybody needs it.

**Recorded, never charged.** `buildBill()` takes `monthly_rent` off a lease and
nothing else. `smoke:rules` asserts none of the three appears on a bill rather
than trusting it — the failure mode is a tenant billed for their own deposit.

**Not shown on the room page either.** มัดจำ is on the ผู้เช่าปัจจุบัน card and
these two deliberately are not; they live in the dialog, under a line saying
they are kept and not charged.

**Blank is zero.** The form does not make either be typed, and a lease created
before the columns existed reads as nothing taken, which is what it means.

### What a tenant record holds

Added 2026-09-09. `tenants` gained `id_card_issued`, `id_card_expires`,
`line_id` and `vehicle_plate`; `note` was already there but had no field on any
screen, so nothing ever wrote to it.

**None of it reaches an invoice.** Only `full_name`, `phone` and `address` do
— the rest is the landlord's own record of who is in the building, gathered
under a `เก็บไว้ดูเอง` heading that says so. `smoke:rules` checks that none of
it leaks onto a bill.

**It is read back on the tenant page,** in a card of its own below the invoice
one. Until 2026-09-26 it was written on three forms and displayed on none, so
the only way back to a หมายเหตุ or a วันหมดอายุบัตร was to open the edit dialog
and look. Its own card rather than more rows on the one above, because that
card's heading is a promise about what prints on an invoice.

**The card dates are stored and not watched.** Nothing compares them against
today and nothing warns when one passes: there is no action the program could
usefully ask for, and a warning nobody can act on is worse than none.

**The vehicle plate is on the tenant, not the lease.** A car belongs to a
person, and a tenant renting three rooms has one car between them rather than
three. One free-text box, so two cars go in it and nothing counts them. The
parking *fee* is unrelated and stays in `lease_fees`, charged per room.

**`PUT /tenants/:id` stopped being a full replace,** which it had to before the
column count went up. It used to `SET` every column from the body, so a caller
sending only a phone number blanked everything beside it — latent until now
only because `note` was the sole unsent field and nothing wrote it. It now
tests `k in req.body` the way `end_date` does on `PUT /leases/:id`: an absent
key keeps its value, a present one is written, and an empty string clears it.
Both sides are in `smoke:rules`.

**Adding another such field is one line in three places** — the column in
`db.js`, an `addColumn` beside it, and the name in `OPTIONAL` in
`routes/tenants.js`, which both the insert and the update build their SQL from.
Then a field in `TenantExtra` in `TenantModals.jsx`, which เพิ่มผู้เช่า,
แก้ข้อมูลผู้เช่า and the new-tenant half of ย้ายเข้าห้อง all render, so one
edit reaches all three. A row on the `เก็บไว้ดูเอง` card in `TenantPage.jsx` if
it is worth reading back.

### Fees that are a share of the bill

A fee priced as a percentage of something else — a service charge of 100% of
the electricity, say. It prices a bill, so it lives in `buildBill()` and nowhere
else.

`fee_types.percent_of` and `.percent`, both nullable, plus the same two on
`lease_fees`. The pair is copied onto `lease_fees` at attach time for the same
reason `lease_fees.amount` and `leases.monthly_rent` are copied: repricing the
catalogue must not rewrite what an existing tenant agreed to. The computed baht
still lands in `bill_items.amount` and the working in `bill_items.detail` — this
is a new *kind* of fee type, not a new kind of bill line.

**`subtotal` excludes other shares.** Two shares on one bill would otherwise
each depend on the other and come out differently depending on which was worked
out first.

**A share prints as `รายเดือน Monthly`, with no working** — the owner's call. It
is the one line on a bill that does not show how it was reached, so the basis
cannot be recovered from the bill afterwards, only from the fee attached to the
lease at the time. `REQUIREMENTS.md` 6.3 was narrowed to match. Wording is
frozen at generation, so bills already issued keep what they were printed with.

**`fee-basis.js` holds the five bases and their Thai labels.** `routes/fees.js`
needs them to refuse a basis it does not know, `routes/bills.js` to price one,
and `GET /fees/basis` serves the same map to the screens so the dropdown cannot
offer something the server would refuse.

On screen it is a disclosure — `การตั้งค่าขั้นสูง` — under ค่าตั้งต้น in the fee
type dialog. Three other places had to stop assuming a fee has a fixed baht
amount: the fee catalogue on ตั้งค่า, the recurring list on ห้อง, and the dialog
that attaches one to a tenant.

---

## Reports and receipts

Neither changed how a bill is calculated. Both รายงาน screens are built from
`GET /bills?period=` and `GET /readings?period=` — a report that needed its own
endpoint would be a sign it was computing something.

**The summary accounts for what it does not list.** A room with no bill is not a
row, but the foot says how many were left out and names them, split into "has a
tenant, not billed yet" and "no tenant this month". A room quietly missing from
a month's takings is the thing the report exists to make visible.

**The meter report lists every room**, including ones read but not yet billed —
which is exactly when a wrong number is still worth catching — and ones with no
reading at all, marked rather than dropped.

**There is no unusual-usage highlight, deliberately.** Usage here doubles between
seasons, so any threshold that catches a broken meter in November fires on every
room in April.

### Receipts

Issuing a receipt records that a piece of paper was printed — not that money
arrived. There is still no paid flag, no balance and no payments table.

**A receipt carries no number.** This is the decision the rest of the design
hangs off, and it replaced a first version that did have one — a count within
the year, `2026-0001`, assigned inside the insert transaction.

The number was not the problem in itself; the promise it made was. A number
printed on paper in a tenant's file is something the program can never
afterwards contradict, and everything awkward about the first version followed
from honouring it: a receipt could not be cancelled, and the bill under it could
not be corrected, because either would leave that paper disagreeing with the
database. A wrong meter reading found after issuing was unfixable.

Dropping the number drops the promise. The row is now a marker saying "the paper
for this bill has been printed", plus a note; the room, the period, every line
and the total are read off the bill each time the page is drawn.

**What was traded away:** auditability. A numbered book has a sequence, and a
gap in it is a question. This has neither. The owner weighed that against being
unable to correct a bill and chose this — the building is small and receipts are
handed over in person.

**Cancelling is an ordinary delete.** `DELETE /receipts/:id`, and the bill goes
back to `ยังไม่ได้ออก`. The note goes with it: it described that issuing, and
there is no second issuing it would still be true of.

**A corrected bill takes its receipt with it,** through `ON DELETE CASCADE` on
`receipts.bill_id`. Correcting a bill is a delete and an insert, so the old
receipt goes and the user issues again against the new figures. Without the
cascade the delete fails on the foreign key and a receipted bill is
uncorrectable, which is exactly the behaviour this replaced.

**Migrating an old database** needs a table rebuild, not an `ALTER TABLE`:
SQLite will not drop a column a UNIQUE constraint is built on, and cannot add
`ON DELETE CASCADE` to a foreign key that exists. `dropReceiptNumbers()` in
`db.js` does it by SQLite's own documented procedure — foreign keys off, one
transaction, `foreign_key_check` before committing — guarded on the old column
so it runs once. Rows, ids, notes and timestamps survive; only the numbers go.

**`seed.mjs` can clear a receipted database again.** It could not while a
receipt held its bill down, and had to stop and explain that the only way to
reset was to delete the file. `npm test` still makes its own server and its own
database, which is right for other reasons — the suites re-seed whatever they
find.

**Issuing one still asks first,** but for a different reason. Nothing is spent
and nothing is frozen, so the only question that matters is whether the tenant
has actually paid — which the program cannot detect, and which printing a
receipt for is the mistake worth stopping. When the bill is already stale it
says so first, in red, and points at ออกบิลใหม่: recoverable now, but still a
page printed twice and a tenant who has to be told why.

**ใบเสร็จเดือนนี้ sits beside บิลเดือนนี้ on บิล**, built the same way: a
print-all above, a row per bill, a count at the foot. Every bill is a row,
issued or not, because that list is the month's work; an unissued row says
`ยังไม่ได้ออก` rather than a dash so it reads as something to do. The staleness
warning is worked out by the dialog itself, not passed in from whichever screen
opened it.

### โหมดผู้ดูแล, and what the papers say now

Added 2026-09-09.

**The printed pages.** Both now head the document `งวดที่ 2026-09` rather than
the bare period. A receipt adds `ออกเมื่อ` with the date only underneath it —
the time was dropped, because the minute a piece of paper was printed is not
something anybody reads off it. The standing line
`ได้รับเงินตามรายการข้างต้นเรียบร้อยแล้ว` is gone entirely, which leaves the
receipt's footer holding only its note; with no note the footer is not rendered
at all, so an empty rule does not print under the total.

**`settings.developer_mode`,** 0 or 1, off by default and off on a database
that predates it. Off, the receipt page has no ยกเลิกใบเสร็จ button and no
paragraph explaining that a receipt can be taken back, and the issue dialog
reads `· ไม่สามารถยกเลิกได้ / · ถ้าแก้บิลแล้วออกใหม่ ต้องทำก่อนออกใบเสร็จ`.
On, all three come back. The switch is its own card on ตั้งค่า.

**It hides buttons and nothing else.** `DELETE /receipts/:id` is unchanged and
still works, and a corrected bill still takes its receipt with it through the
cascade. The intent is that a receipt reads as final to whoever is issuing them
while staying correctable by whoever knows where the switch is — so the off
wording describes the screen, not the program. Worth knowing before treating
`ไม่สามารถยกเลิกได้` as a rule: it is not one, and `CLAUDE.md` still says a
receipt can be cancelled, which is still true.

`smoke:receipts` drives both states, and turns the mode on by clicking the
switch on ตั้งค่า rather than by writing the setting through the API, so the
card itself is covered.

**ออกใบเสร็จทุกห้อง — a month of receipts in one press.** Added 2026-09-26,
beside พิมพ์ทั้งหมด in the ใบเสร็จเดือนนี้ card, and gone once there is nothing
left to issue. A building's rent is collected in one sitting and answering the
same dialog forty times was most of an afternoon.

`POST /receipts/batch` takes a period and issues one receipt for every bill of
that month that has none. It follows the batch rule `POST /bills/batch` set:
one room failing does not stop the rest, and every skip is named by room. The
only ordinary skip reason is `ออกใบเสร็จไปแล้ว` — a bill never gets a second
receipt. A month with no bills is a 400 naming the month, not a successful run
of nothing.

**No note is written by the batch.** A note describes one payment, and there is
nothing true of all of them. They are typed afterwards on the receipts that
need one.

**The dialog costs a request per bill, on purpose.** It runs the same staleness
check `IssueReceiptModal` runs, for every pending bill, and names the rooms
whose figures have been overtaken. That is the warning worth multiplying: a
mis-press here hands out forty pieces of paper, not one. It also prints the
count and the total before the press, so the number on the button can be
checked against the money actually counted.

What it cannot check is whether anybody paid — that is the question the program
has never been able to answer, so the dialog says in words that pressing it
asserts every room on the list has, and that a room which has not should be
issued singly.

**A clean run closes the dialog;** the list's own tally catches up. Anything
skipped keeps it open and names the rooms. The receipts list is the screen's
own fetch rather than part of `bills`, so the batch calls `bumpDetail()` and
`BillsPage` has `detailRevision` in that fetch's deps — without it the table
would still read ยังไม่ได้ออก on receipts that exist.

`smoke:receipts` presses it end to end, including that cancelling issues
nothing and that no bill ends up with two receipts; `smoke:rules` covers the
three things the route refuses.

**ยกเลิกใบเสร็จ is a grey button** (`btn quiet`), not a red one. Cancelling
spends nothing and destroys nothing — the bill and its figures are untouched —
so the red it had was overstating it.

### On the printed page

**`bahtText()` is display only** — derived from the number already on the page,
because storing it would give one document two places to disagree with itself.
The rule a generic implementation gets wrong is เอ็ด, and it reaches across
group boundaries: 1,000,001 is หนึ่งล้านเอ็ด. The test table is in
`frontend/smoke/text.mjs`; change the table before the function.

**`meterFields()` lifts previous, current and units used out of
`bill_items.detail`**, not out of `meter_readings`. Taking them from the reading
would print today's figures on an old bill the moment a reading was corrected.
Anything that does not parse falls back to the sentence as it always was, which
is what keeps older bills readable.

**The rate working under a utility line is no longer printed.** Removed
2026-09-26. `ก่อนหน้า 112 · ปัจจุบัน 150 · ใช้ไป 38 หน่วย` stayed; the sentence
beneath it — `38 หน่วย — 100 บาท สำหรับ 5 หน่วยแรก แล้ว 33 × 9` — went. It
restated the price list under every utility line of every bill, in the one place
nobody goes to check a rate, and two of them on a page is most of what made a
bill look busy. `meterFields()` still returns `working`, so `check-text` keeps
asserting the whole sentence is accounted for; only the paper dropped it. The
fallback for a line that does not parse is untouched and still prints the
sentence whole — that is not the working coming back, it is the only way those
figures reach the page at all when they cannot be lifted out.

`smoke:receipts` and `smoke` check both sides: the labelled figures are there,
and `หน่วยแรก` is not.

**The building's own lines print black,** not muted grey — its address and
phone in the header, and the whole footer: how to pay, `settings.bill_note`,
and a receipt's own note. Muted is a screen convention for what can be skimmed
past, and a bill goes through a home printer and into somebody's pocket. The
tenant block's labels (`.pto dt`) and the column headings stay grey; they label
the page rather than say anything.

---

### The typefaces are files in this project

Added 2026-09-26, after the app changed typeface on a machine it had been
running on for weeks.

**They used to be loaded from Google Fonts** — one `<link>` in `index.html`.
A program whose premise is that it runs offline was asking the internet how it
should look. The way that failed is why this is worth the words: not at once,
but weeks in. Google serves the stylesheet with a cache life of about a day and
the `.woff2` files with one of about a year, so a machine that went offline
kept the font files and lost the `@font-face` rules that name them. The page
still rendered, in whatever the system had.

**What it fell to is not Sarabun,** although the stack names it — Sarabun is a
Google font too, not one Windows or macOS ships. It fell past that to
`system-ui`: Leelawadee UI on Windows, Thonburi on macOS. Both are a different
width from Noto Sans Thai, so the printed bill's columns moved with the screen,
which is the part that mattered.

**`src/styles/fonts.css` is Google's own css2 output** with the URLs pointed at
`frontend/public/fonts/`. The `unicode-range` lines are theirs and still do
their job: opening the board fetches three of the five files, not all five.
132KB in total, inside `frontend/dist`, which `electron-builder` already
packages.

**Only thai, latin and latin-ext are kept.** Roboto Mono's cyrillic, greek and
vietnamese subsets were dropped — it dresses `.num` alone, which is room
numbers, dates and money. Anything outside those ranges falls to the next font
in the stack, exactly as it did before.

**Both are variable fonts,** so the three Noto weights name one file and the
browser instances it. That is why 400, 500 and 700 point at the same `.woff2`
and it is not a copy-paste mistake.

**`check-fonts` is a build-time guard,** in `npm test`. Nothing on a screen can
catch this class of fault — the page renders, just wrong — so it is checked
where re-adding the link or losing a file fails a build instead of surfacing as
a phone call a month later. Both sides are covered: the check was watched to
fail on a restored Google link and on a deleted `.woff2`.

## The desktop app

`electron/main.js` starts `backend/server.js` as a child process, waits for
`/health`, and shows a window pointed at it. No screen, wording, rule or
endpoint moved to make this work; the server is still the only thing that knows
anything.

**Where the data lives.** `backend/data-dir.js` works the paths out once, from
`APARTMENT_DATA_DIR` when the main process passes it and `__dirname` when it
does not — so `node server.js` still writes beside the code. Packaged, the
database and `backups/` are under `userData`, and nothing is written into the
bundle.

**The native module is Node-API, and `npm run check-runtime` guards it.**
better-sqlite3 v13 declares `NAPI_VERSION=10`. There is nothing to rebuild, and
running `@electron/rebuild` against it actively breaks it — the source build
leaves a half-finished `build/` that `node-gyp-build` then prefers over the
working prebuild. This is why `npmRebuild` is off.

What matters is the Node-API *level*. Electron 33 bundles Node 20, which offers
9, and loading the module then **segfaults** rather than failing with a message:
the server child dies before printing anything and the app shows its "stopped
unexpectedly" page with no way to tell why. Electron 43 bundles Node 24 and
offers 10. `check-runtime` compares the two numbers and then loads the module
under Electron, and the build refuses to continue if either fails. **Anyone
downgrading Electron, or swapping better-sqlite3 for a module that is not
Node-API, has to read that check before deleting it.**

**One origin.** Express serves `frontend/dist`, so the pages and the API share
an origin: `cors` is gone, `API_BASE` is `''`, and every request is a relative
path. `vite.config.js` proxies the nine API paths in development so the same
relative paths work there — its list is the mount points in `server.js`, and **a
new router needs a line in both**.

**The port.** `PORT` defaults to 3001 for `node server.js`; the main process
passes 0 and asks the OS for a free one. The server prints
`APARTMENT_SERVER_PORT=…` on its own line and the main process reads it. It
binds to 127.0.0.1, not every interface: one person's program on one machine,
with no login, has no business answering the local network.

**Starting up, and failing to.** No splash screen. The window is created hidden,
the server is started, `/health` is polled for up to ten seconds, and only then
does the window load and appear. When that fails the window still appears, with
`electron/error.html` — Thai, plain words, one button that retries and one that
opens the log. It names which of three things happened:

| | |
|---|---|
| `port` | เปิดช่องทางเชื่อมต่อภายในเครื่องไม่ได้ |
| `database` | เปิดไฟล์ข้อมูลไม่ได้ |
| `crashed` | ตัวโปรแกรมส่วนหลังหยุดทำงานกะทันหัน |

The classification reads the server's own output and matches `listen EACCES`
rather than bare `EACCES`, because a permission error on a *file* is a database
problem and telling the user to close another copy of the app would send them
the wrong way. The decision is written to the log, because the log is what
whoever gets called for help will be reading.
`npm run check-error-page` renders each reason plus an unrecognised one and
checks there is no English on it.

**If the server dies, the main process starts it again on the same port.** The
window is loaded at `http://127.0.0.1:<port>/` and asks for relative paths, so a
server that came back on a different port would leave the window talking to
nothing, and reloading to fix the address would throw away whatever was
half-typed into a form. Taking the old port back means the page never knew: its
own banner is showing, its `ลองใหม่` now works, and nothing in progress is lost.
A fresh port and a reload is the fallback if something grabbed the old one.

Restarts are capped — counted over a minute, with a longer wait each time, and
after three it stops and shows the error page. A server that will not stay up is
a problem for somebody to look at. `npm run check-revive` covers all four paths.
The guard in `boot()` covers only starting the server and is released before the
window is told to load anything; holding it across `win.loadURL` meant a server
that died while the page was still loading was never recovered, silently.

**Changing the name or the icon.** The name is `build.productName` in
`package.json` — it becomes the installer, the executable, the app bundle and
the Start-menu shortcut, and Thai works (`บ้านสวนพลู Setup 1.0.0.exe` builds and
runs). **Leave `name` alone**: the folder under `userData` is keyed on it
(`apartment-app`), and renaming it would orphan an existing database. The window
title bar is separate again — `<title>` in `frontend/index.html`.

The icon goes in `build/icon.png`, 512×512 or larger, square; electron-builder
converts it for both platforms.

Neither shows up under `npm start`, which has caught the owner out: running from
source there is no bundle of ours, so the Dock icon and menu-bar name are
Electron's and `build/icon.png` is never read — it is a build input, not a
runtime one. `electron/main.js` closes most of that gap when unpackaged with
`app.setName()` and `app.dock.setIcon()`, setting the name *after* the data
directory is captured and putting the path back explicitly, because
`getPath('userData')` derives from the name. The bold application-menu title on
macOS comes from the bundle's `Info.plist` at launch and cannot be fixed from
source; the packaged app is correct.

**Windows is built for x64 explicitly.** electron-builder otherwise targets the
architecture of the machine running it, and the first Windows build came out
arm64 — an installer that would not run on the building's PC.

**Left alone deliberately:** no icon file (the default Electron one is used), no
auto-update, no telemetry, no crash reporting, and no signing certificate.
macOS is built unsigned; Windows is built unsigned and will warn on first run
until it is signed.

---

## Where the two sides do not line up

**Local-only, no endpoint needed and never will be:** room selection on บิล, the
range box, printing, the month picker, the board's edit-mode add buttons.

**Endpoints with no button, all harmless:**

| Endpoint | Why |
|---|---|
| `GET /readings/history/:unitId` | Answers "is 9854 units unusual for this room", which needs several months at once. The room page's month picker answers "what did this room read in July", which is what was actually wanted. Left unused deliberately. `smoke/seed.mjs` uses it. |
| `PUT /fees/onetime/:id` | The screens add and delete one-time charges but do not edit one, exactly as the prototype did. |
| `PUT /settings/period/:period` | Returns `bills_already_generated` and a `note`; บิล says the same thing from its own bill list, so the field is unread. |
| `GET /units/vacant`, `GET /leases/active` | The board and the tenant list read the fuller lists. Not gaps. |

---

## Deliberate omissions

Things a later session might take for bugs. Each was decided, not overlooked.

- **No payments, paid flag or balance.** Out of scope, as `CLAUDE.md` says.
- **No receipt number, and no sequence to audit.** Deliberate, and the reason
  cancelling and correcting work at all. See [Receipts](#receipts).
- **No unusual-usage highlight on the meter report.** No threshold is right.
- **No polling.** A stale screen that is never written to stays stale.
- **`GET /readings/history/:unitId` has no screen.**
- **The room page shows two time frames at once** — tenant and lease are today,
  meter and one-time charges follow its month picker. It says so in the
  subtitle (`ผู้เช่าและสัญญาเป็นสถานะวันนี้`) and puts งวด on the two cards that
  move. This is why the board has no picker at all.
- **After ครบรอบ, the meter box you typed into goes blank** and the number has
  to be typed again — no longer true for the fix itself, which now writes the
  figure with it, but the redraw is still what the prototype did.

---

## Open

**The two suites that failed on 2026-09-01 were a calendar effect, now
confirmed.** `smoke` and `smoke:receipts` both failed on the 1st and both pass
unchanged on the 5th. The seed places its months relative to today, so on the
first day of a month the working month has nothing in it yet and a suite that
assumes otherwise finds nothing. Nothing was wrong with the app. Neither suite
has been made robust to the date — running `npm test` on the 1st will fail the
same way again, and fixing that means seeding the working month rather than
relying on it having been filled.

**Windows has never been installed on.** The x64 installer builds
(`Apartment Manager Setup 1.0.0.exe`, 110 MB, `win32-x64.node` unpacked, no
development database inside) but there is no Windows machine here. Unproven:
the installer flow, the Start-menu shortcut, and `%APPDATA%` as the data
directory. Everything else was verified against the packaged app on macOS.

**The print layout has never been looked at on paper.** It is asserted
structurally — one `.paper` per bill, siblings inside `.papers`, chrome marked
`.noprint` — but nobody has held a printed page.

**The `date('now','localtime')` rule is untested.** It cannot be reached without
moving the machine clock past midnight UTC.

**Thai wording waiting on a native speaker.** None of it is wrong as far as I
can tell; all of it is worth a second pair of eyes before it reaches a tenant.

1. **1,000,001 → หนึ่งล้านเอ็ด.** เอ็ด applied whenever a trailing 1 has
   anything before it, across the ล้าน boundary as well as within a group. It
   cannot occur on a bill in this building, but the rule it encodes affects 101
   and 1,001, which can.
2. **0.50 → ศูนย์บาทห้าสิบสตางค์**, where ห้าสิบสตางค์ alone may read better.
   Not reachable on a real bill, since a bill with no baht has no lines.
3. **ได้รับเงินตามรายการข้างต้นเรียบร้อยแล้ว** as the receipt footer.
4. **ผู้รับเงิน** as the signature label.
5. **ห้องที่ไม่ได้อยู่ในรายงานนี้** as the heading for the rooms the summary
   leaves out.
