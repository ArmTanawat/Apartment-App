# Progress

Running notes on porting the prototype to React and wiring it to the backend.
Written so a fresh session can continue from this file alone.

**Status: ported, wired, product-tested, packaged as a desktop app, and
carrying reports and receipts.** The
React app in `frontend/` runs every screen against the Express server in
`backend/`, and `electron/` starts that server and shows a window pointed at
it. `fetch` appears in exactly one file.

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

**From source**, unchanged:

```
cd backend  && npm install && node server.js     # http://localhost:3001
cd frontend && npm install && npm run dev        # http://localhost:5173
```

`apartment.db` is created on first start. `npm run seed` (in `frontend/`)
empties it and fills it with the building the prototype's mock data describes,
with the months placed relative to today — that is what makes a side-by-side
comparison against `prototype/rooms.html` mean anything.

`prototype/rooms.html` is untouched and still opens by double-clicking.

### Checking it

```
npm test
```

From the repository root. It starts a server if one is not already running —
on a throwaway database, so a test run never touches the one being worked on —
runs all six suites and the two desktop-shell checks, and reports each. If a
server is already on 3001 it uses that one instead, and says so, because the
suites re-seed whatever database they find.

The suites can still be run one at a time from `frontend/`, which is what to do
when one of them fails and the detail matters:

```
cd frontend
npm run smoke            # the paths from the brief's verification list
npm run smoke:offline    # what the screens do when the server is not there
npm run smoke:stale      # what they do when the data changed underneath them
npm run smoke:share      # fees that are a percentage of something else
npm run smoke:screens    # the filter counts, the month picker, printing, previews
npm run smoke:rules      # the rules in CLAUDE.md, attacked at their boundaries
npm run smoke:receipts   # ใบเสร็จ and รายงาน
npm run check-text       # Thai baht words, and the meter figures out of a bill line
```

They need a server on 3001 and they re-seed it. `npm run seed` puts the sample
building back afterwards.

`npm run check-revive` is separate because it is slow: it launches the real app
and kills the server underneath it several times. Run it after touching
`electron/main.js`.

`smoke/coldstart.jsx` is the seventh, and needs a server started on a database
with no rooms in it — the first day of using the program. Move `apartment.db`
aside, start the server, then
`npx vite build --ssr smoke/coldstart.jsx --outDir smoke-dist && node smoke-dist/coldstart.js`.

`smoke/harness.jsx` renders the real app into jsdom and drives it with real
clicks and keystrokes against the running backend. `smoke/walk.jsx` re-seeds
first, so it starts from the same building however many times it has been run.
It prints `all passed` or names what broke. Not a test framework and there is
no watcher — run it after a change. All of them pass: 254 checks.

`smoke/walk.jsx` writes to the database. Re-seed before using the app by hand.

---

## Structure

```
frontend/src/
├── App.jsx                    view router, the rail, the offline banner
├── styles/app.css             the prototype's <style> block, lines 11-373, verbatim
├── lib/
│   ├── api.js                 THE base URL, and the two kinds of failure
│   ├── bills.js               preview, and the line-by-line staleness diff
│   ├── helpers.js             the rule-mirroring helpers, pure
│   ├── useApi.js              page-scoped fetching
│   └── useSubmit.js           what a dialog does with a write
├── state/
│   ├── DataContext.jsx        the collections, fetched; one named action per change
│   └── UiContext.jsx          view, working month, and the sticky per-screen bits
├── pages/                     one file per view (9)
└── components/
    ├── RoomCard, MonthPicker, Modal, Switch, ErrBox
    ├── BillPaper.jsx          shared by BillPage and PrintAllPage
    └── modals/                one component per prototype modal (17), + ModalHost
```

Two deviations from the structure suggested in the brief, both deliberate:

- **`state/` rather than state inside `App.jsx`.** The prototype's module-level
  variables split into two kinds: data and UI. Keeping both in one component
  would have meant threading a dozen props through every page, and the split
  is exactly where Phase 2 cut — `DataContext` is the file that got `fetch` in
  it, `UiContext` never did.
- **`components/modals/`**, six files rather than one. Seventeen dialogs.

---

## Phase 1 — port to React

Done. Every screen looks and behaves as the prototype does.

### The three things the port had to fix

- **Focus loss.** Gone. The three hand-written caret restores (tenant search,
  meter inputs, settings fields) are not ported; React's diffing keeps the
  caret. The walk checks that typing leaves the text where it was.
- **Unescaped interpolation.** Gone. Everything is JSX, and
  `dangerouslySetInnerHTML` appears nowhere — grep for it before merging.
- **Module-level mutable state.** Gone, into the two contexts.

### Things worth knowing about the port

**Text boxes that hold numbers keep their own draft string.** The prototype
never re-rendered while you typed, so a box could hold `""` or `1.` on its way
to a number. A plainly controlled input would rewrite that under the caret, so
the meter inputs, the settings boxes and the prorate-days box display a local
string and write the parsed number. The stored value and the displayed text are
deliberately allowed to differ, which is what the prototype did.

**`bumpMeter()` replaces `render()` on the meter page.** The prototype called
`render()` after any write to a reading that did not come from typing — a
rollover, a replaced meter, a corrected previous figure — which threw the
inputs away and redrew them from the data. `UiContext.meterRevision` is bumped
by exactly those actions and keys the row block. This reproduces one visible
oddity: after clicking ครบรอบ the box you just typed into goes blank and the
number has to be typed again. That is what the prototype does, so it is
preserved rather than fixed — **question 1 below**.

**Per-screen UI state lives in `UiContext`, not in the page.** `picked`, the
prorate switch, the filter chips, the tenant search box: all were module-level,
so leaving บิล to look at one bill and coming back kept the selection. Putting
them in the page component would have reset them on every mount. Changing the
month clears `picked` and `lastResult` and nothing else, as before.

---

## Phase 2 — wired to the API

Done, in the order the brief gave. The duplicated calculation went first.

### What was deleted

`buildBill()` and `utilityCharge()` — the prototype's second copy of
`backend/routes/bills.js` — are gone, along with the mock data module. Every
figure on บิล now comes from `GET /bills/preview/:leaseId/:period`, which
returns exactly what `POST` would store. `billDiff()` compares the stored
bill's line items against that response, **line by line, never on the total**:
a meter corrected down by 450 and a repair added for 450 leave the total
identical while both lines are wrong.

The worked example on ตั้งค่า was the awkward part — it prices N units with no
lease and no reading, so the preview route cannot answer it. It now calls a new
`GET /bills/example/:kind/:units`, which sits beside `utilityCharge` in
`routes/bills.js` and calls it. See the backend changes below.

### Decisions the prototype had no answer for

**A write refetches what it touched, rather than patching a local copy.**
`GET /units` already works out `is_occupied` and `leaving_on`, `GET /readings`
works out `is_entered`, `GET /leases` joins the tenant's name. Recomputing any
of that here would be a second copy of a rule that has to agree with the first
— the same trap `buildBill` was. `DataContext.load(keys)` refetches only the
collections a given action affects, so saving a meter is one request, not
twenty.

**Occupancy is the server's answer, not a second calculation.** The board
colours a card from `is_occupied`, and the move-in guard is `POST /leases`'s
overlap check — one rule, one place. The client-side `overlapping()` copy is
gone. This is what CLAUDE.md means by "the board must agree with what the forms
allow": there is now no second `>` that could drift.

The exceptions, and why:

- **A reading below last month is detected on the client** — not to decide
  whether it is allowed, but to decide what to ask. The server refuses it
  either way, with one English message for both meters; the screen has to name
  which meter it is offering to fix, in Thai, which is the rule in CLAUDE.md.
  So the number is simply not sent, and the two fixes are offered per meter.
- **`leasesInPeriod`** has no endpoint. The screens work it out from the lease
  list with the same rule `POST /bills/batch` uses when it actually bills them.

**The working month is in `localStorage`**, clamped on the way back in: a
stored month may be in the past but never in the future, because the browser
could have been left open across a month boundary.

**The meter page saves shortly after typing stops (350ms), not per keystroke,**
and flushes on the way out of the box. Writes for one room are queued so two
meters typed before the row exists cannot both POST and trip
`UNIQUE (unit_id, period)`.

### Failures

The policy from `HANDOFF.md`, applied in one place each rather than per screen:

- **`lib/api.js` separates the two kinds.** `ApiError` is the server saying no,
  with the message it wrote. `ApiDown` is the server not being there.
- **A refused action is a reason, not an error state.** `lib/useSubmit.js`
  shows the API's message inside the dialog and leaves it open, so the
  alternative it describes can be taken. Nothing is retried automatically.
- **The server being gone is said once, at the top, with a retry** — in
  `App.jsx`, driven by `down` in `DataContext`. Any read or write that hits an
  `ApiDown` raises it.
- **A failed write never looks like a success.** The sharp case is บันทึกมิเตอร์,
  which saves silently: a row whose save failed shows `ยังไม่ได้บันทึก` and the
  reason, in place of `บันทึกแล้ว`. `npm run smoke:offline` checks exactly this.

### New Thai text

The prototype had never had a request fail, so it had no words for any of it.
Five strings were needed; the owner supplied the wording, and it is in the
table under question 2 below.

---

## Backend changes

Six now. The first three were proven necessary by Phase 2; the last three came
out of the answers to the questions below. All follow the pattern of their
neighbours and all are recorded in `backend/README.md` and `REQUIREMENTS.md`.

**1. `POST /bills/batch` accepts `prorate_days`.** `POST /bills` already did.
Without it, a run asked on screen to charge 11 of 30 days silently billed a
full month for every room — the screen would say one thing and the bill
another, which is a money error. Three lines, passed straight through to
`buildBill` exactly as the single-bill route passes it.

**2. `PUT /readings/:id` tests `'water_curr' in req.body` rather than `??`.**
The same treatment `end_date` has on `PUT /leases/:id`, and for the same
reason: clearing a current reading is a real action, not an omission. It is
what emptying the box means, and what correcting a previous figure upward
leaves behind — the row keeps its previous number, has no current one, and
counts as outstanding on the checklist. With `??`, `null` read as "not
supplied" and there was no way back to that state. CLAUDE.md flags this exact
trap in the note under the `end_date` rule.

**3. `GET /bills/example/:kind/:units` is new.** The worked example on ตั้งค่า
prices N units with no lease and no reading, so `GET /bills/preview` cannot
answer it, but it must not be a second copy of the minimum-charge formula
either — explaining that formula is the whole point of the block it sits in.
It lives in `routes/bills.js` beside `utilityCharge`, declared before `/:id` so
`example` is not read as a bill id.

**4. Every error message is Thai** (question 1). Wording only.

**5. `PUT /leases/:id` checks for an overlap** (question 5), the way
`POST /leases` does, against the dates the update would leave behind and
excluding the lease being edited. Without it, correcting a start date backwards
walked a lease into the previous tenant's stay and only the screen stopped it.

**6. `GET /fees/lease` is new** (question 7) — every recurring fee on every
lease, for ตั้งค่า.

Nothing else in `backend/` was touched.

---

## Where the two sides do not line up

**Local-only, no endpoint needed and never will be:** room selection on บิล,
the range box, printing, the month picker, the board's edit-mode add buttons.

**Endpoints with no button.** The two from `HANDOFF.md` are still open and
still block nothing:

| Endpoint | What is missing |
|---|---|
| `GET /readings/history/:unitId` | No way to look at a room's readings over time, which is the natural thing to want when a number looks wrong. (`smoke/seed.mjs` uses it; no screen does.) |
| `DELETE /leases/:id` | A lease created by mistake can only be ended, leaving a record of a tenancy that never happened. |

Three more turned up while wiring, all harmless:

- `PUT /settings/period/:period` returns `bills_already_generated` and a
  `note`. บิล now says the same thing from its own bill list, so the field is
  still unread — but the screen no longer stays silent.
- `PUT /fees/onetime/:id` has no button; the prototype only adds and deletes
  one-time charges. Same as before the port.
- `GET /units/vacant` and `GET /leases/active` are unused, because the board
  and the tenant list read the fuller lists. Not gaps.

**`GET /fees/lease` was added** for ตั้งค่า, which needs to know which fee types
are attached to somebody. It used to ask once per lease.

---

## The seven questions, and what was done

All answered by the owner on 2026-08-30 and applied.

**1. Every error message the backend returns is now Thai.** All 81 of them,
across the eight route files, plus the skip reasons in the `POST /bills/batch`
response and the 500 handler in `server.js`. Wording only — no rule, no status
code and no shape changed, so nothing on the frontend needed touching. They
keep the same specificity: `ห้อง 203 มีผู้เช่าอยู่แล้ว — สมชาย ใจดี (ถึง 2026-09-15)`,
not `Conflict`. `backend/README.md` has a section saying so, because a new
route added later has to be written the same way.

**2. The five new strings** are the owner's wording:

| Where | Text |
|---|---|
| First load | `กำลังโหลด…` |
| First load, no server | `ติดต่อเซิร์ฟเวอร์ไม่ได้` / `กรุณาลองใหม่` / `ลองใหม่` |
| Banner | `ติดต่อเซิร์ฟเวอร์ไม่ได้ ตัวเลขที่เห็นอาจไม่ใช่ล่าสุด และยังบันทึกอะไรไม่ได้` |
| Meter row | `ยังไม่ได้บันทึก` |

**3. A meter fix keeps the number already in the box.** เปลี่ยนมิเตอร์ and
ครบรอบ now write the fix and the figure together, so 151 → 5 on a four-digit
dial reads 9854 units the moment the button is pressed. It turned out simpler
than what it replaced rather than harder: `applyRollover` and `applyNewMeter`
are one `applyFix` differing in two arguments, and the round trip where the
user retyped the number is gone.

The figure only goes along if the fix rescues it — if some combination still
gave negative usage the server would refuse the whole write, and the fix is the
part worth keeping. That cannot normally happen; it is guarded because losing
both would be silent.

**4. บิล warns when the month is already billed**, in the same words and the
same place บันทึกมิเตอร์ does: `งวดนี้ออกบิลไปแล้ว N ใบ การเปลี่ยนสวิตช์ตรงนี้จะยังไม่
เปลี่ยนบิลที่ออกไป ถ้าต้องการให้มีผล ต้องลบบิลเดิมแล้วออกใหม่`. It shows whenever
bills exist for the working month, not only after a switch is flipped — the
same rule the meter page uses.

**5. `PUT /leases/:id` runs the overlap check `POST /leases` runs.** Same
comparison, same `end_date >` meaning, excluding the lease being edited. The
client-side copy in แก้สัญญา is deleted: the point of moving it was to stop
having two of it.

**6. `--attention` and `--attention-soft` are tokens now**, and `.stale` reads
both — the yellow was hardcoded beside the undefined border. Added to the
colour table in `FRONTEND.md` with a note that they are not a third room state:
colour still answers one question about a room, and this banner is about a
bill.

**7. `GET /fees/lease` returns every recurring fee on every lease.** ตั้งค่า
asks once instead of once per lease. Until the answer is in, no delete button
is offered — offering to delete a fee type that turns out to be in use is worse
than not offering.

### The two gaps from HANDOFF.md, closed differently

**`DELETE /leases/:id` now has a button.** แก้สัญญา offers ลบสัญญานี้, which
opens a dialog that says what deleting is for and what to use instead.

The two are not alternatives. ย้ายออก records that someone lived here and left,
which is true and belongs in the history. ลบสัญญา says it never happened, which
is what a ย้ายเข้า on the wrong person or the wrong room needs — and แก้สัญญา
cannot help, because it changes only วันเข้าอยู่, ค่าเช่า and มัดจำ, never the
tenant or the room.

Using ย้ายออก to clean up a mis-click was measured against the running server
rather than reasoned about. A lease created and ended on the same day still
counts as having been in the room that month, so:

```
batch for that room -> [{"unit_number":"104","tenant_name":"ปรีชา ดวงแก้ว","total":4550}]
```

A full month's rent, billed to someone who never moved in. And once that bill
exists the lease can no longer be deleted at all — so the button is worth
having and worth reaching for early. It also leaves a nought-day tenancy on the
tenant's page for good and blocks ever deleting that room or that tenant.

The dialog refuses up front when the lease has bills, naming the count, the way
ลบห้อง and ลบผู้เช่า do — the route refuses too, but saying it before the button
is pressed is what lets the way out be offered instead of an error.

**`GET /readings/history/:unitId` stays unused, deliberately.** The room page
now names the month its meter and charges belong to — `มิเตอร์ งวด 2026-07`,
matching the ค่าใช้จ่ายครั้งเดียว card beside it — and carries a month picker, so
any past month is one click away instead of a trip to บันทึกมิเตอร์ and back.
The card used to say `มิเตอร์เดือนนี้` whatever month was being shown.

That answers "what did this room read in July". It does not answer "is 9854
units unusual for this room", which needs several months at once and is the
screen the endpoint is for. Stepping the picker is enough for now.

Because the room page now has a picker, it also says which figures follow it:
`ผู้เช่าและสัญญาเป็นสถานะวันนี้` in the subtitle, and งวด on the two cards that
move. Two frames on one page is the thing `CLAUDE.md` says must never be left
silent, and it is why the board still has no picker at all.

### When the screen is holding ids the server no longer has

Found by the owner, reproduced, and fixed. The report was "ไม่พบสัญญาเช่านี้ when
I press เพิ่มค่าใช้จ่ายครั้งเดียว", and the cause was mine: `npm run seed` deletes
every lease and recreates it with a new id, and it had been run twice with the
app open in a browser. Every id on that screen was stale.

A reload cured it, but the app said nothing that would suggest one. Worse, the
guess "the ids are stale" turned out to expose two crashes rather than one:

- **Every dialog looks its subject up by id and reads fields off it.** Thirteen
  of them would have thrown on a subject that had gone.
- **So do the two detail pages.** `RoomPage` does `units.find(...)` then
  `u.id`; deleting the room from elsewhere took the page down with a
  `TypeError`, not a message. This one only turned up because the check written
  for the dialogs was pointed at a page as well.

Three changes, none of them large:

- `DataContext.guard` re-reads the collections when a write is **refused** —
  the server answered, so it is reachable, and the refusal may be because the
  screen is pointing at something that is gone. It is skipped when the server
  is simply unreachable, where re-reading would fail too.
- `ModalHost` maps each dialog to the record it is about, and shows
  `ข้อมูลนี้ไม่มีอยู่แล้ว` instead of opening one whose subject has gone. One
  table in one file rather than a guard in thirteen dialogs.
- `App.jsx` does the same for ห้อง and ผู้เช่า, the two pages reached by id.

The two together mean a stale screen now corrects itself: the write is
refused, the collections re-read, the dialog swaps to a card explaining it,
and the page behind it is right by the time it is closed. `npm run smoke:stale`
holds all of it, including a check that an ordinary refusal — deleting a lease
that has bills — still shows its real reason rather than a "gone" card.

**Not covered:** a screen that is stale and is not written to just stays stale
until something reloads it. There is no polling, and for a single-user local
app there should not be.

### Fees that are a share of the bill

Asked for as "a fee that moves with the room's water or electricity" — a
service charge of 100% of the electricity, say. The owner's first question was
whether it was frontend-only. It is not, and it is the clearest example so far
of why: it prices a bill, so it belongs in `buildBill()` and nowhere else.
Putting the arithmetic on the client would have rebuilt the exact duplication
Phase 2 existed to delete.

**Schema.** `fee_types.percent_of` and `.percent`, both nullable, plus the same
two on `lease_fees`. `CLAUDE.md` warns that a change to how a charge is
calculated should not need a column, and that still holds for the bill tables —
the computed baht lands in `bill_items.amount` and the working in
`bill_items.detail`, as it always has. What is new is a *kind* of fee type, and
`fee_types` is explicitly "data, not code", so that is where it belongs.

The pair is copied onto `lease_fees` at attach time for the same reason
`lease_fees.amount` and `leases.monthly_rent` are copied: repricing the
catalogue must not rewrite what an existing tenant agreed to.

**`db.js` gained a migration.** `CREATE TABLE IF NOT EXISTS` does nothing to a
table that already exists, so four columns had to be added with a guarded
`ALTER TABLE`. There was no mechanism for that before; `addColumn(table,
column, declaration)` is a no-op on a fresh database and on every start after
the first. Any future column needs it too.

**`subtotal` excludes other shares.** Two shares on one bill would otherwise
each depend on the other, and the answer would come out differently depending
on which was worked out first. Excluding them means every share is a share of
the same figure, whatever order they are in.

**A share prints as `รายเดือน Monthly`, with no working** — the owner's call.
The tenant is being asked to pay an amount; the arrangement behind it is
between them and the owner. It is the one line on a bill that does not show
how it was reached, so the basis cannot be recovered from the bill afterwards,
only from the fee attached to the lease at the time. `REQUIREMENTS.md` 6.3 was
narrowed to match rather than left claiming every line shows its working.

Wording is frozen into `bill_items` at generation, so any bill already issued
keeps whatever it was printed with. Only bills made from now on are short.

**`fee-basis.js`** holds the five bases and their Thai labels. `routes/fees.js`
needs them to refuse a basis it does not know and `routes/bills.js` to price
one; two copies would drift, and the drifting one would be pricing a bill.
`GET /fees/basis` serves the same map to the screens, so the dropdown cannot
offer something the server would refuse.

**On screen.** A disclosure — `การตั้งค่าขั้นสูง` — under ค่าตั้งต้น in the fee
type dialog, holding a switch and `คิดตาม __ % ของ [dropdown]`. It opens
already showing when the fee being edited is one. Three other places had to
stop assuming a fee has a fixed baht amount: the fee catalogue on ตั้งค่า, the
recurring list on ห้อง, and the dialog that attaches one to a tenant, which
asks for the percentage instead of an amount.

**A share cannot be billed without a meter reading** — but that was already
true of every bill, since `buildBill` refuses without one. The "treat it as
zero" case the owner offered for is not reachable on a real bill.

### A round of product testing

Asked for on 2026-08-30. Two suites were written for it —
`smoke/rules.mjs`, which goes after the rules in `CLAUDE.md` at their
boundaries rather than down the middle, and `smoke/screens.jsx`, which covers
the parts of the screens the main walk goes past. Plus `smoke/coldstart.jsx`,
run once by hand against an empty database.

**One real bug, and it was a money bug.**

A reading row can hold a previous figure with no current one — that is the
state left when the box is emptied, or when a previous figure is corrected
upward. The checklist counted it correctly as still to do. `buildBill` did not
check for it, and `null` went through the arithmetic as zero:

```
100 → null   billed as -100 units
  minimum on : ค่าน้ำ 100 บาท    "-100 หน่วย — ขั้นต่ำ 100 บาท (100 → null)"
  minimum off: ค่าน้ำ -900 บาท   a negative line on the invoice
```

A 4,100 baht bill came out as 3,695 with the minimum on and 2,640 with it off,
with visible nonsense printed on the page the tenant is handed. `buildBill` now
refuses, with the wording the prototype used for exactly this case
(`ยังจดมิเตอร์งวด ... ไม่ครบ`), and all three ways in — preview, `POST /bills`
and the batch — agree.

It had been noted as a question at the end of Phase 1 and never answered. Worth
recording that it got *more* reachable afterwards, not less: making
`PUT /readings/:id` able to clear a current reading is what turned "hard to
produce" into "empty the box on บันทึกมิเตอร์".

**The cold start works.** An empty database through to a printed bill — add a
floor, add the first room, move a tenant in creating them on the way, take the
first meter reading with no previous month to draw on, generate, print. Nothing
crashed and nothing divided by zero. This had never been run before.

**Everything else held.** The `end_date` boundary in all six places including
the new check on `PUT /leases/:id`; the minimum charge at, either side of, and
switched off; rounding to two decimals on an awkward rate; a bill never
overwritten; a batch that keeps going; a handover month billing both tenants;
rent by the day at 1, at the month's length, and refused outside; a wrapped
dial billing 17 units rather than 12; every deletion guard; the cascade;
percentage fees including 0% and one share never counting another; and twelve
kinds of input the routes should refuse.

**Two of the failures were the tests, not the app.** A fee type created inline
was not registered for cleanup, so the second run tripped over its own UNIQUE
name — the cleanup now goes by name. And `className.includes('on')` matched the
word `gone`, which is what `classList.contains` is for.

**Not covered.** The print layout is asserted structurally — one `.paper` per
bill, siblings inside `.papers`, chrome marked `.noprint` — but nobody has
looked at a printed page. The `date('now','localtime')` rule cannot be tested
without moving the machine clock past midnight UTC. Neither can be reached
from here.

## Packaging it as a desktop app

Done. `electron/main.js` starts `backend/server.js` as a child process, waits
for `/health`, and shows a window pointed at it. Nothing about what the app
does moved: no screen, no wording, no rule, no endpoint. The server is still
the only thing that knows anything.

### The four things that break

**1. Where the data lives.** `db.js` and `backup.js` wrote to
`path.join(__dirname, …)` in four places, which inside `app.asar` is
read-only. `backend/data-dir.js` now works the two paths out once, from
`APARTMENT_DATA_DIR` when the main process passes it and `__dirname` when it
does not — so `node server.js` still writes beside the code exactly as before.
Verified: the packaged app created its database and its backups folder under
`userData` and nothing was written into the bundle.

**2. The native module — not what the brief expected, and worse.**
better-sqlite3 v13 is a **Node-API** module. Its prebuilt binaries carry no ABI
version in their names, and one of them works on any runtime offering the
Node-API level it was built against. There is nothing to rebuild, and running
`@electron/rebuild` against it actively breaks it: the source build leaves a
half-finished `build/` directory that `node-gyp-build` then prefers over the
working prebuild. electron-builder's own automatic rebuild does the same, which
is why `npmRebuild` is off.

What does matter is the Node-API *level*. v13 declares `NAPI_VERSION=10`.
Electron 33 bundles Node 20, which offers 9 — and loading the module then does
not fail with a message. **It segfaults**, killing the server child before it
prints anything, so the app shows its "stopped unexpectedly" page and nobody
can tell why. Electron 43 bundles Node 24 and offers 10.

`npm run check-runtime` compares the two numbers and then actually loads the
module under Electron, and the build refuses to continue if either fails. It
was tested against a doctored `NAPI_VERSION` and caught it. **Anyone downgrading
Electron, or swapping better-sqlite3 for a module that is not Node-API, has to
read that check before deleting it.**

**3. One origin.** Express serves `frontend/dist`, so the pages and the API
share an origin: `cors` is gone, `API_BASE` is `''`, every request is a
relative path, and the window has one address. `vite.config.js` proxies the
nine API paths in development so the same relative paths work there — its list
is the mount points in `server.js`, and a new router needs a line in both.

**4. The port.** `PORT` defaults to 3001 for `node server.js` and the main
process passes 0, which asks the OS for a free one. The server prints
`APARTMENT_SERVER_PORT=…` on its own line and the main process reads it, since
nothing can know that port in advance. It binds to 127.0.0.1 rather than every
interface: one person's program on one machine, with no login, has no business
answering the local network. Verified with 3001 already taken — the app started
on 56265 and the other thing on 3001 was undisturbed.

### Starting up, and failing to

No splash screen and no progress bar. The window is created hidden, the server
is started, `/health` is polled for up to ten seconds, and only then does the
window load the app and appear — so the first thing anyone sees is a working
app rather than something that flashes and vanishes.

When that fails the window still appears, with `electron/error.html`: Thai,
plain words, one button that retries and one that opens the log for whoever
gets called for help. It names which of three things happened, because "an
error occurred" is no use to the person who has to act on it:

| | |
|---|---|
| `port` | เปิดช่องทางเชื่อมต่อภายในเครื่องไม่ได้ |
| `database` | เปิดไฟล์ข้อมูลไม่ได้ |
| `crashed` | ตัวโปรแกรมส่วนหลังหยุดทำงานกะทันหัน |

The classification reads the server's own output. `listen EACCES` rather than
bare `EACCES`, because a permission error on a *file* is a database problem and
telling the user to close another copy of the app would send them the wrong
way. The decision is written to the log too, since the log is what the person
the error page tells them to call will be reading.

`npm run check-error-page` renders it for each reason and for a reason it does
not recognise, and checks there is no English anywhere on it.

### What was verified, and how

Everything below was run against the **packaged application** — the built
bundle, launched the way the owner launches it, with its own database under
`userData`.

| Check | Result |
|---|---|
| Install and launch by double-click, no terminal | Window opened, server started, database created under `userData` |
| Add a room, a tenant, a lease and a meter reading, quit fully, relaunch | All four still there, and the bill with them |
| The database is where it should be | `userData/apartment.db`, and a dated copy in `userData/backups` on the next launch |
| Generate a bill | 3,900 rent + 163 water + 1,315 electricity = 5,378, and it survived the relaunch |
| Print | Structure verified by `smoke:screens` against the packaged backend: one `.paper` per bill, siblings inside `.papers`, chrome marked `.noprint` |
| Launch twice | One server child before and after, the first window still serving, one port line in the log |
| Port 3001 occupied | Something else was answering on 3001 throughout; the app ran on 57637 |
| Database corrupted | `SqliteError: file is not a database` → the Thai `database` page, app still up, no orphan server |
| The retry button | Driven through the DevTools protocol: the page said `เปิดไฟล์ข้อมูลไม่ได้`, the database was restored, `ลองใหม่` was pressed, and the window moved to `http://127.0.0.1:57705/` with the server answering |
| Server exits some other way | `Cannot find module` → the Thai `crashed` page |
| Nothing left running after quit | No app process, no server child, the port released |
| All six test suites | Passed against the packaged backend, on a database created seconds earlier |
| Windows installer | `Apartment Manager Setup 1.0.0.exe`, 110 MB, x64, `win32-x64.node` unpacked, no development database inside |

**Still untested: Windows itself.** The installer was built but not installed —
there is no Windows machine here. Everything above was verified on macOS, on
the same code and the same asar. What that leaves unproven is the installer
flow, the Start-menu shortcut, and `%APPDATA%` as the data directory.

**A correction to what this file said an hour ago.** It claimed the packaged
bundle could not be launched here and blamed the sandbox. That was wrong. The
cause was `ELECTRON_RUN_AS_NODE=1` left set in my own shell from the Node-API
tests: it makes any Electron binary run as Node, and with no script to run it
reads stdin, finds nothing and exits 0 in silence. Every "packaged app will not
start" result was that variable. Clearing it, the app starts and everything
above passes. The lesson is the one the app already tries to teach — an empty
exit code with no output is not evidence of anything, and I treated it as
evidence of the sandbox.

**The one intermittent failure, chased down.** The first run of `npm run smoke`
against the packaged backend failed once and then passed five times. It turned
out to be perfectly reproducible on a *brand-new* database: `GET /backups`
returns nothing on a first launch, because `backup.js` runs before the database
is opened and there is nothing yet to copy. That is right, and it is what the
owner sees on day one — the panel says `ยังไม่มีสำเนา` and offers the button.
The test had assumed a database that had been started twice. Fixed in the test.

**Windows is built for x64 explicitly.** electron-builder otherwise targets the
architecture of whatever machine runs it, and the first Windows build came out
arm64 — an installer that would simply not run on the building's PC.

### Left alone deliberately

- **No icon.** The default Electron icon is used. A real one is a file, not a
  decision, and there was none to use.
- **`productName` is ASCII** ("Apartment Manager"), so the install path and the
  executable are. The window title is the Thai building name, from the page.
- **No auto-update, telemetry or crash reporting**, and no signing certificate
  anywhere. macOS is built unsigned; Windows is built unsigned and Windows will
  warn on first run until it is signed.

### If the server dies while the app is open

Asked about, decided, and built. The main process supervises the server child
and starts it again when it dies on its own.

**On the same port.** This is the part that is easy to get wrong. The window is
loaded at `http://127.0.0.1:<port>/` and the page asks for relative paths, so a
server that comes back on a different port leaves the window talking to
nothing. Reloading the window would fix the address and throw away whatever was
half-typed into a form, which is the one thing worth protecting here. Taking
the old port back means the page never knew: its own banner is showing, its
`ลองใหม่` now works because there is something to answer it, and nothing the
user was doing is lost.

A fresh port and a reload is the fallback, for the unlikely case that something
grabbed the old one in the seconds it was free.

**With a cap.** Restarts are counted over a minute, with a longer wait each
time. After three, it stops and shows the error page. A server that will not
stay up is a problem for somebody to look at, not one to paper over for ever,
and a crash loop that never surfaces is worse than a message.

`npm run check-revive` covers all four paths. It launches the real app with its
own `--user-data-dir`, kills the server underneath it, and checks with the
DevTools protocol what the window is showing. It is slow, so it is not part of
`npm test`; run it after touching `electron/main.js`.

**It found a real bug on its first honest run.** `revive()` returned early
while `boot()` still held its guard — and that guard was held across
`win.loadURL`, which is exactly the window the check was killing in. A server
that died while the page was still loading was never recovered, silently. The
guard now covers only starting the server, and is released before the window is
told to load anything. Three consecutive clean runs since.

The route there is worth remembering: the check failed intermittently, and my
first two explanations were both about the check rather than the app — a stale
`pkill` pattern that also matched the development server, and a sleep that was
too short. Both were true and neither was the cause. Reading what the app
actually logged took a minute and pointed straight at it.

### Changing the name and the icon

Both are one line or one file, and both were tested rather than assumed.

**The name** is `build.productName` in `package.json`. It becomes the installer,
the executable, the app bundle and the Start-menu shortcut. **Thai works** — a
build with `บ้านสวนพลู` produced `บ้านสวนพลู Setup 1.0.0.exe` and
`บ้านสวนพลู.exe`, and the macOS bundle ran normally.

Changing it does **not** move the data. The folder under `userData` is keyed on
`name` in `package.json` (`apartment-app`), which is why that one should be
left alone — renaming it would orphan an existing database.

The title in the window's own bar is separate again: it comes from `<title>` in
`frontend/index.html`.

**The icon** goes in `build/icon.png`, 512×512 or larger, square.
`electron-builder` converts it for both platforms — a 1254×1254 PNG became
`Contents/Resources/icon.icns` in the bundle, with `CFBundleName` reading
`Apartment Manager`.

**Neither shows up under `npm start`, and that caught the owner out.** Running
from source there is no bundle of ours: Electron lends the app its own, so the
Dock icon and the menu-bar name are Electron's, and `build/icon.png` is never
read — it is a build input, not a runtime one.

`electron/main.js` now closes most of that gap when unpackaged: it calls
`app.setName()` with `productName` so the menu items read the right thing, and
`app.dock.setIcon()` on macOS so the Dock shows the real icon. The name is set
*after* the data directory is captured and the path is set back explicitly,
because `getPath('userData')` derives from the name and letting it move would
orphan an existing database. Verified: the data stayed in `apartment-app`.

What cannot be fixed from source is the bold application-menu title on macOS.
It comes from the bundle's `Info.plist` at launch, so under `npm start` it says
`Electron` whatever the app does at runtime. The packaged app is correct.

## รายงาน and ใบเสร็จ

Two screens added last. Neither changed how a bill is calculated.

### Reports needed no endpoint, and got none

Both are built from what the other screens already load — `GET /bills?period=`
for the summary, `GET /readings?period=` for the meter report. A report that
needed its own endpoint would have been a sign it was computing something,
and neither does.

**The summary accounts for what it does not list.** A room with no bill is not
a row — there is nothing to put in the columns — but the foot says how many
were left out and names them, split into "has a tenant, not billed yet" and
"no tenant this month". A room quietly missing from a month's takings is the
thing this report exists to make visible, and leaving it out silently would
defeat it.

**The meter report lists every room**, including ones read but not yet billed
— which is exactly when a wrong number is still worth catching — and ones with
no reading at all, marked rather than dropped. Figures are tabular and
right-aligned so a wrong digit stands out of the column, which is the whole
job.

**There is no unusual-usage highlight.** The brief allowed one and allowed
leaving it out if no threshold was obviously right. None is: usage here doubles
between seasons, so anything that would catch a broken meter in November fires
on every room in April. A hint that cries wolf is worse than none, and the
columns already do the work.

### Receipts

A receipt is a document. Issuing one records that a numbered piece of paper was
printed — not that money arrived. There is still no paid flag, no balance and
no payments table.

**Voiding is deliberately not built.** A receipt number identifies a document
that exists in the world, so deleting a row and inserting another would print
the same number on two pieces of paper. Doing it properly means marking a row
void and leaving its number spent, which is a decision for the owner. There is
no `DELETE /receipts/:id`.

That decision had a consequence worth recording: **a database that has been
receipted can no longer be cleared through the API**, because clearing means
deleting bills and a receipted bill cannot be deleted. `seed.mjs` used to reset
whatever database it found. It now cannot — which is right — so `npm test`
always starts its own server, on its own temporary database, on a random free
port, and the suites read that port from `APARTMENT_TEST_PORT`. The tests never
borrow a database anybody is using. That is better than what it replaced,
where a test run wiped the development data by design.

**The number is assigned inside the insert transaction.** Read-then-write
outside one would let two receipts a second apart take the same number, and
`UNIQUE` on `receipt_no` would then turn a race into a crash rather than
preventing it.

**A bill with a receipt cannot be deleted or regenerated.** Enforced in
`DELETE /bills/:id`, which names the receipt number, and surfaced twice on
screen: the delete dialog refuses up front, and the staleness banner shows the
difference but offers no regenerate button, saying why instead.

### The three things the invoice was missing

**The total in Thai words.** `bahtText()`, written against the table in the
brief before the function existed, plus fourteen more cases. It is display
only — deriving it from the number already on the page, because storing it
would give one document two places to disagree with itself.

The rule that a generic implementation gets wrong is เอ็ด, and it reaches
across group boundaries: 1,000,001 is หนึ่งล้านเอ็ด, even though within its own
group of six the 1 stands alone. That case is flagged below.

**Meter figures as labelled fields.** `meterFields()` lifts previous, current
and units used out of `bill_items.detail` and prints them as their own columns,
with the charge explanation kept beside them — it is what lets a tenant follow
the arithmetic rather than trust it.

Read out of the *stored working*, not out of `meter_readings`, deliberately. A
bill records what it charged: taking the numbers from the reading would print
today's figures on an old bill the moment a reading was corrected, which is the
same mistake as recomputing an amount. Bills issued before this existed parse
identically, and anything that does not parse falls back to the sentence as it
always was.

**Where a receipt is printed from.** The bill screen offers ออกใบเสร็จ, then
พิมพ์ใบเสร็จ once one exists. The bills list gained a receipt-number column and
a print-all beside the one for invoices.

### Verified against the packaged app

| Check | Result |
|---|---|
| Three receipts in a row | `2026-0001 2026-0002 2026-0003` — consecutive, no gap, no repeat |
| A second receipt for the same bill | Returned `2026-0001`, status 200, still three receipts |
| Deleting a receipted bill | `ลบบิลนี้ไม่ได้ เพราะออกใบเสร็จเลขที่ 2026-0001 ไปแล้ว` |
| Deleting a bill with no receipt | Still 204, unchanged |
| A meter changed behind a receipted bill | Banner appears, names the changed line, offers no regenerate button and says why |
| Printing | One paper per receipt, signature line on each, bank details on none |
| Reports over an awkward month | Summary listed 4 bills and accounted for all 10 rooms it left out (7 unbilled, 3 with no tenant); meter report listed all 14 rooms, 7 with figures and 7 marked unread |
| Baht text | `.00`, `.50`, `123,456.75`, `100,000` and `250,000.05` all read correctly |

### Issuing a receipt asks first

Added after the fact, at the owner's request, and it should have been there
from the start. Every other irreversible action in this app stops and explains
— ลบห้อง, ลบผู้เช่า, ลบสัญญา, ลบบิล — and issuing a receipt is the same kind of
thing wearing different clothes: a number is spent and the bill behind it is
frozen for good. Nothing about the button looked destructive, which is exactly
why it needed saying out loud.

The dialog names the bill, then three things in order: the number cannot be
cancelled or reused, the bill can no longer be deleted or regenerated, and one
bill gets one receipt.

**When the bill is already stale it says so first, in red.** That is the worst
moment to issue one — the paper would carry figures known to be out of date,
and issuing it closes the only way back to correcting them. The wording points
at ออกบิลใหม่ first.

`seed.mjs` also stopped failing with a raw stack trace. A database that has
been receipted cannot be cleared, which is the same rule working correctly; it
now says that, and says that `npm test` is unaffected because it makes its own.

### Receipts got a card of their own

The first cut buried receipts inside a bill: open บิล, click a row, open the
bill, press ออกใบเสร็จ. The owner called the flow odd, and they were right —
issuing receipts is not something you do while looking at one bill. It happens
over the days after the bills go out, one room at a time as people pay, and it
wants the same shape as the thing it follows.

So **ใบเสร็จเดือนนี้** now sits beside **บิลเดือนนี้** on บิล, built the same
way: a print-all above, a row per bill, a count at the foot.

```
บิลเดือนนี้            พิมพ์ทั้งเดือน 4 ใบ
  ห้อง  ผู้เช่า          ออกเมื่อ              ยอด
  101   นภา วงศ์ดี      2026-08-31 15:43:27  6,628.00
  รวม 4 ใบ                                  22,563.00

ใบเสร็จเดือนนี้         พิมพ์ทั้งหมด 3 ใบ
  ห้อง  ผู้เช่า          เลขที่        ออกเมื่อ              ยอด
  101   นภา วงศ์ดี      2026-0001    2026-08-31 15:46:00  6,628.00
  203   เกษม บุญมา      ยังไม่ได้ออก  —                    5,355.00
  ออกแล้ว 3 จาก 4 ใบ                                      17,208.00
```

Every bill is a row, issued or not, because that list is the month's work. An
unissued row says `ยังไม่ได้ออก` rather than a dash, so it reads as something
to do. A row always leads to its receipt: straight there when it has one,
through the confirmation when it does not.

Two things fell out of it:

- **The bills card went back to being about bills.** The `ใบเสร็จ` column added
  a phase earlier was the same information in two tables on one screen once
  the card existed.
- **The staleness warning moved into the dialog.** It used to be passed in from
  the bill screen, which knew. A row in a list does not, and a warning that
  depends on which button opened it is not a warning. The dialog now works it
  out itself.

`ReceiptPage`'s back button also said `← บิล` while going to the single bill.
It goes to บิล now, which is what the label says and where both cards are.

### Thai wording I was not certain about

Worth a read by a native speaker before this reaches a tenant.

1. **1,000,001 → หนึ่งล้านเอ็ด.** The brief flagged this exact case. I applied
   เอ็ด whenever a trailing 1 has anything before it, across the ล้าน boundary
   as well as within a group. It cannot occur on a bill in this building, but
   the rule it encodes affects 101 and 1,001, which can.
2. **0.50 → ศูนย์บาทห้าสิบสตางค์**, where ห้าสิบสตางค์ alone may read better.
   Not reachable on a real bill, since a bill with no baht has no lines.
3. **ได้รับเงินตามรายการข้างต้นเรียบร้อยแล้ว** as the receipt footer, replacing
   the invoice's payment instructions.
4. **ผู้รับเงิน** as the signature label.
5. **ห้องที่ไม่ได้อยู่ในรายงานนี้** as the heading for the rooms the summary
   leaves out.

### Still open

`PUT /fees/onetime/:id` has no button — the screens add and delete one-time
charges but do not edit one, exactly as the prototype did.

Electron is the remaining piece of work.

## Log

**Phase 1.** Read the docs and all 2780 lines of the prototype, confirmed the
backend answers on 3001, scaffolded Vite + React in `frontend/`, lifted the CSS
and the mock data unchanged, ported the nine views and seventeen modals. Built
the jsdom walk to check the paths in the brief rather than eyeballing.

Nothing broke that was worth recording except three of my own wrong assumptions
about the mock data while writing the walk (11 rooms are occupied, not 8; 104
is the vacant room, not 103; a wrap on a four-digit dial from 151 to 5 is 9854
units). The app was right all three times.

**Phase 2.** Deleted the duplicated calculation first, then wired BoardPage,
RoomPage, MeterPage, the bill screens, and ผู้เช่า and ตั้งค่า, in that order.
Added `smoke/seed.mjs` so the walk starts from a known building, and
`smoke/offline.jsx` for the failure policy, which is otherwise the one part of
the work nothing exercises.

What broke and how it was fixed:

- **The settings worked example had nothing to call.** The brief says to
  replace `utilityCharge()` with the preview endpoint, but the preview needs a
  lease and a meter reading and the example has neither. Added
  `GET /bills/example/:kind/:units` beside the function it calls, rather than
  keeping a copy of the formula on the client.
- **`POST /bills/batch` ignored the day count** the บิล screen collects, so
  "11 of 30 days" would have billed a full month. Added `prorate_days`.
- **`PUT /readings/:id` could not clear a current reading**, which both the
  emptied box and the corrected-previous-figure case need. Changed `??` to the
  `in` test `end_date` already uses.
- Three wrong selectors in the walk, all mine: it clicked ค่าธรรมเนียมประจำ's
  *+ เพิ่ม* instead of ค่าใช้จ่ายครั้งเดียว's, and it typed into the building's
  phone box thinking it was the water threshold — the first `.rateline
  input.num` on the page belongs to อพาร์ตเมนต์. The app was right both times.

**The seven questions.** All answered and applied on 2026-08-30. The
translation was the bulk of it — 81 messages, mechanical, no logic touched.

Two of the others turned out smaller than expected. Keeping the typed number
through a meter fix (3) replaced two near-identical functions with one, because
writing the fix and the figure in the same request is what removes the retype.
Moving the overlap check onto `PUT /leases/:id` (5) deleted more frontend code
than it added backend code.

Two checks were added to the walk that would have caught the thing each change
was about: that no Latin text reaches a dialog, and that the box still holds
its number after ครบรอบ.

**The two gaps.** Closed on 2026-08-30 after the owner pushed back on both.
They were right that a past month's meter was already reachable — but only by
changing the month on another page and coming back, to a card that then
mislabelled itself. A picker on the room page and a งวด on the card is the
whole fix.

They were also right to ask what deleting a lease even means, given แก้สัญญา
exists. The answer was worth checking against the server rather than asserting:
a mis-clicked ย้ายเข้า "fixed" with ย้ายออก bills a full month to someone who
never moved in, and after that the lease cannot be deleted at all.

**"ไม่พบสัญญาเช่านี้".** Reported by the owner while adding a one-time charge.
Not reproducible on seeded data, nor through any sequence of the features that
had just changed — two repro passes found nothing. It only appeared once the
guess was stated properly: the screen is holding ids the server no longer has,
which is what a reseed under an open tab does. Deleting one lease behind the
app's back reproduced it exactly.

Worth remembering that the second crash — the room page itself, not the dialog
— was found by pointing the new check at a page rather than by reading code.

**Percentage fees.** The owner asked whether this was frontend-only before
asking for it to be built, which was the right question — the answer changed
the shape of the work from one dialog to a schema change, a migration, a rule
in `buildBill()`, and four screens that had been assuming every fee has a baht
amount.

The part worth thinking about was not the arithmetic but `subtotal`: two shares
on one bill are only well defined if neither counts the other, and that is a
decision that cannot be seen on the printed page afterwards.

**Product testing.** Six suites, 254 checks, one real bug: a half-entered meter
reading billed as negative usage. Found by asking what happens in the state the
checklist already knew about but the calculation did not.

The two suites that found nothing are still the ones worth keeping — the cold
start, because it is the only path a new building takes and it had never once
been run, and the chip counts, because a count that disagrees with the list
under it is the kind of thing nobody notices until they are relying on it.

**Packaging.** The brief predicted the native-module problem and was right that
it would be the one that passes every test here and fails on the owner's
machine — but the cause was not the ABI. better-sqlite3 v13 is Node-API, so the
rebuild step the brief asked for is unnecessary, and running it breaks the
module. What bites instead is the Node-API *level*: Electron 33 offers 9 where
the module needs 10, and the result is a segfault with no message rather than
the clean "compiled against a different Node.js version" error anyone would
recognise. `npm run check-runtime` exists so that cannot ship.

I then spent a while concluding the packaged app could not be launched here,
and wrote that down as a sandbox restriction. It was `ELECTRON_RUN_AS_NODE=1`
still set in my own shell from those same Node-API tests. An Electron binary
with that set runs as Node, and with nothing to run it exits 0 without a word —
which I read as the environment refusing rather than as my own doing. Once
cleared, every check on the list passed, including pressing ลองใหม่ on the error
page and watching the window come back.

What remains untested is Windows: the installer was built but there is no
Windows machine here to install it on.

**The supervisor.** The owner chose the full version — restart on the same
port, capped, error page when it will not stay up — over the five-line one that
just shows the error page. The right call: the same port is what keeps a
half-typed form on screen, and that is the whole reason to prefer restarting
over reloading.

The check written for it caught a bug in it within minutes, in a window I had
not thought about: the server dying while the first page was still loading. My
first two theories were both about the check being wrong. They were both true
and neither was the cause, and reading the app's own log would have got there
sooner than either.

**Reports and receipts.** The interesting constraint was not the receipt
numbering, which the brief specified precisely, but what the no-voiding rule
did to the test setup: once a database has receipts it cannot be cleared, and
`seed.mjs` had been clearing whatever it found. Isolating the tests onto their
own database was the honest fix and left them better than before.

The judgement call was the unusual-usage highlight. The brief allowed it and
allowed skipping it. There is no threshold here that catches a broken meter in
November without firing on every room in April, so it is not there.
