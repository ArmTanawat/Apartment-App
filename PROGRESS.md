# Progress

The state of this project, written so a session that has never seen the repo can
continue from this file alone. It describes what exists now and why, not the
order it was built in.

**Status: finished and in use.** Every screen the prototype had runs in React
against the Express server, the whole thing is packaged as a desktop app, and
reports and receipts are built. `fetch` appears in exactly one file. The only
work not done is listed under [Open](#open) at the foot.

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

Issuing a receipt records that a numbered piece of paper was printed — not that
money arrived. There is still no paid flag, no balance and no payments table.

**The number is assigned inside the insert transaction.** Read-then-write
outside one would let two receipts a second apart take the same number, and
`UNIQUE` on `receipt_no` would turn a race into a crash rather than preventing
it.

**Voiding is not built, and there is no `DELETE /receipts/:id`.** A receipt
number identifies a document that exists in the world. Doing it properly means
marking a row void and leaving its number spent, which is a decision for the
owner.

That has a consequence worth knowing before touching the tests: **a database
that has been receipted can no longer be cleared through the API**, because
clearing means deleting bills and a receipted bill cannot be deleted. This is
why `npm test` makes its own server and its own database rather than borrowing
one.

**A bill with a receipt cannot be deleted or regenerated.** Enforced in
`DELETE /bills/:id`, which names the receipt number, and surfaced twice on
screen: the delete dialog refuses up front, and the staleness banner shows the
difference but offers no regenerate button, saying why instead.

**Issuing one asks first.** The dialog names the bill, then three things in
order: the number cannot be cancelled or reused, the bill can no longer be
deleted or regenerated, and one bill gets one receipt. When the bill is already
stale it says so first, in red, and points at ออกบิลใหม่ — that is the worst
moment to issue one, because the paper would carry figures known to be out of
date and issuing it closes the only way back.

**ใบเสร็จเดือนนี้ sits beside บิลเดือนนี้ on บิล**, built the same way: a
print-all above, a row per bill, a count at the foot. Every bill is a row,
issued or not, because that list is the month's work; an unissued row says
`ยังไม่ได้ออก` rather than a dash so it reads as something to do. The staleness
warning is worked out by the dialog itself, not passed in from whichever screen
opened it.

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

---

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
- **No receipt voiding.** See [Receipts](#receipts).
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

**Two suites fail as of 2026-09-01, and it is not the app being wrong about
money.** `npm test` reports `smoke` and `smoke:receipts` failing. Both fail
identically with the working tree clean, so nothing in this repo's recent
changes caused them, and the other eight suites pass.

- `smoke` fails one check, `still billable for the month` (`walk.jsx:62`): after
  moving a tenant out with today as the day the room comes free, the board's
  note `ยังต้องออกบิลให้` is not on the page.
- `smoke:receipts` crashes rather than asserting — `GET /bills?period=` comes
  back empty and the suite reads `[0].id` off it.

Both are about the working month, and today is the first day of one. The seed
places its months relative to today, so a suite that assumes the current month
already has something in it has nothing to find on the 1st. That is a guess and
not yet proven; the first thing to try is running `npm test` on a day that is
not the 1st, which distinguishes a test that only holds mid-month from a real
regression in either the board note or the bill list.

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
