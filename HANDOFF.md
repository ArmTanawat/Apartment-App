# Handoff

Written for whoever picks this up next, most likely Claude Code. It covers what exists, why it is shaped this way, and what the next job is.

Read `CLAUDE.md` first — it holds the rules that must not be broken. This file is the map.

---

## Where the project stands

*Written when the frontend was a prototype that had never made a request. It has since been ported to React in `frontend/` and wired to the API — see `PROGRESS.md` for where things actually stand. Everything below about why the app is shaped this way still holds, and the rules it points at have not moved.*

| Part | State |
|---|---|
| Database — 11 tables | Done |
| Backend — 50 endpoints across 8 route files | Done, curl-tested |
| Frontend — 6 screens, 9 views | Done as a prototype, then ported to React |
| Frontend wired to the API | Done |
| Electron packaging | Done — `npm run dist:win` |

The requirements in `REQUIREMENTS.md` are marked Done against the backend; the React app now satisfies them against it rather than against mock data.

---

## Files

```
apartment-app/
├── CLAUDE.md              Rules and decisions. Read first.
├── DATABASE_DESIGN.md     The 11 tables and why each is shaped that way
├── REQUIREMENTS.md        69 requirements, all Done
├── FRONTEND.md            Design direction, screen specs, endpoint map
├── HANDOFF.md             This file
├── backend/
│   ├── db.js              Creates every table, seeds 15 settings
│   ├── server.js          Mounts routers, runs a backup on start
│   ├── backup.js          Copies the database, keeps 30
│   ├── README.md          Every endpoint listed
│   └── routes/
│       ├── tenants.js     5 endpoints
│       ├── units.js       6
│       ├── leases.js      7
│       ├── readings.js    6
│       ├── fees.js        12
│       ├── bills.js       6
│       ├── settings.js    4
│       └── backups.js     2
└── archive/              not in git; kept on disk only
    ├── rooms.html         The whole frontend, 2780 lines, mock data
    └── board.html         An early board-only sketch, superseded
```

`board.html` was the first palette experiment. It is kept only as a record of how the visual direction was chosen and can be deleted.

---

## The screens

All six live in `archive/rooms.html` as one file with a small view router. `render()` switches on `view.name`.

### ห้องพัก — `boardHTML()`

The room board. A card per room, grouped by floor, ten across.

Colour carries one meaning only: green for occupied, red for vacant. Everything still outstanding — a meter not read, a bill not issued — is a small grey note. Earlier drafts gave colour three jobs at once and the board became a code to decode.

**No month picker.** Occupancy is always today's. The outstanding-work note follows the shared working month, and the page says so in words, because mixing the two frames silently is how someone trusts the wrong number.

The pencil at top right reveals an add button at the end of each floor, plus one for a new floor.

### ห้อง — `roomHTML(id)`

Reached by tapping a card, not in the nav. A full page rather than a drawer, because six blocks do not fit in 400px.

Current tenant, recurring fees, this month's meter, one-time charges, past bills. Move in, move out, cancel a scheduled move-out, edit the lease, edit the tenant.

**Fees and charges are scoped to leases that occupied the room during the working month, not to the lease active today.** A tenant who left on the 10th still gets a bill for that month, and a repair found afterwards is theirs to pay. Filtering by "who is here now" makes that impossible, silently.

### บันทึกมิเตอร์ — `meterHTML()`

One row per room, split into a water line and an electricity line. Only the current number is typed; the previous one is filled from the last completed month.

Enter moves down the column. Saving happens per meter as you type — there is no submit button, because the walk round the building can span two days.

A number below last month is a typo, a replaced meter, or a dial that wrapped. The three bill differently, so the screen asks rather than guessing, and asks separately for water and electricity.

### บิล — `billsHTML()`, `billHTML(id)`, `printAllHTML()`

Room selection by floor, by range, or all. Two switches live here rather than in settings, because both are decisions about this month's bills: the minimum charge, and charging rent by the day.

Preview is computed live from the selection. Generating reports both sides — how many were made, and each room that was skipped with its reason.

Opening a saved bill compares it against a fresh calculation. **The comparison is line by line, never on the total.** A meter corrected down by 450 and a repair added for 450 leave the total identical while both lines are wrong.

`billPaper()` renders the invoice and is shared by the single view and the print-all view, so the screen and the printer cannot disagree. Print CSS hides everything else and breaks a page between invoices; saving as PDF is the browser's own dialog.

### ผู้เช่า — `tenantsHTML()`, `tenantHTML(id)`

The least-visited page. Its real job is the data that prints on an invoice — name, phone, address — so the table shows exactly those three and flags what is missing.

Also the only place a tenant holding several rooms is visible, since the board is organised by room.

### รายงาน — `ReportsPage`

Two printable reports over the working month, chosen with a chip.

**สรุปยอดรวมประจำเดือน** is one row per bill with totals at the foot. Rooms with no bill are not rows — there is nothing to put in the columns — but they are counted and named underneath, split into "has a tenant, not billed yet" and "no tenant this month". A room quietly missing from a month's takings is the thing the report exists to make visible.

**รายงานมิเตอร์** is one row per room: previous, current and units used for each utility, in tabular figures so a wrong digit stands out of the column. Every room appears, including ones read but not yet billed — which is exactly when an error is still worth catching — and ones with no reading, marked rather than dropped.

Neither needed an endpoint. Both are built from `GET /bills?period=` and `GET /readings?period=`, which the other screens already load.

There is no "unusual usage" highlight. No threshold was obviously right — usage doubles between seasons here — and a hint that fires every April is worse than none.

### ใบเสร็จ — `ReceiptPage`, `PrintAllReceiptsPage`

Receipts have their own card on บิล, beside บิลเดือนนี้ and shaped the same way: a row per bill of the month, a print-all above it, a count at the foot. That is where they are issued, because issuing them is what happens over the days after the bills go out, one room at a time as people pay — not something buried inside a single bill.

A row leads to its receipt either way: straight there when it has one, through the confirmation first when it does not. Unissued rows say `ยังไม่ได้ออก` rather than showing a dash, so the row reads as an action rather than a blank.

The bill screen still offers **ออกใบเสร็จ** / **พิมพ์ใบเสร็จ** for when you are already looking at one bill. There is no receipt without a bill, so a vacant or unbilled room never enters the flow and there is nothing to skip.

The paper is `BillPaper` again, with `receipt` passed: same tenant, same lines, same total, and four differences that each matter — the title and number, a signature line for ผู้รับเงิน, its own note about this payment, and a received-payment footer with **no bank details**, because the money has already arrived.

The bills list gains a receipt-number column and a print-all for receipts beside the one for invoices.

### ตั้งค่า — `settingsHTML()`

Building name, address and phone, with a live preview of the invoice header. Bank details and a free-text note, with a preview of the footer. Water and electricity rates shown as a worked example that recalculates as you type. Meter digit counts. Fee types with an active toggle. Backups with a date and a button.

---

## What to do next

### 1. Wire the frontend to the API

The prototype holds its data in module-level arrays — `units`, `tenants`, `leases`, `readings`, `bills`, `leaseFees`, `charges`, `feeTypes`, `settings`, `periodSettings`. Every one of them maps to an endpoint that already exists and returns the same shape.

**Delete the duplicated calculation.** `buildBill()` at line 1308 and `utilityCharge()` at line 1693 in `archive/rooms.html` are copies of the logic in `routes/bills.js`. They were written so the prototype could show real numbers, and they currently agree with the backend on every case tested. They will not stay in agreement. Replace them with `GET /bills/preview/:leaseId/:period`.

`billDiff()` should compare the saved bill against that preview response rather than against a locally computed one.

Suggested order, one screen at a time, checking against a running server:

1. **ห้องพัก** — `GET /units` already returns `is_occupied`, `leaving_on` and the tenant name. The outstanding-work note needs `GET /readings?period=` and `GET /bills?period=` merged by `unit_id` on the client.
2. **ห้อง** — the most endpoints, but each is a plain call.
3. **บันทึกมิเตอร์** — `GET /readings?period=` is already the checklist; `is_entered: false` marks what is left.
4. **บิล** — replace the local calculation with preview and `POST /bills/batch`.
5. **ผู้เช่า**, **ตั้งค่า** — small.

Things the prototype has no answer for yet, because nothing could fail:

- What the screen shows while a request is in flight
- What happens when the server is not running
- Whether to refetch after a write or update the local copy
- Where the working month lives so a page reload does not lose it

### When the two sides do not line up

Wiring will surface places where a button has no endpoint, or an endpoint has no button. Neither is automatically a bug, and the two are handled differently.

**A button with no endpoint** means either the feature was designed and never built on the server, or the button does something purely local. Check which before writing anything:

- Purely local — `data-pickfloor`, `data-printall`, `data-addfloor`, the month picker. These are selection, printing, and navigation. They need no endpoint and never will.
- Genuinely missing — add the route, following the pattern in the neighbouring file, and add it to `backend/README.md` and `REQUIREMENTS.md` in the same commit. Do not fake it on the client.

**An endpoint with no button** is usually a gap in the screens, not dead code. Two existed when this was written. Both were settled on 2026-08-30, and the note is kept because they were settled differently:

| Endpoint | What was missing, and what happened |
|---|---|
| `GET /readings/history/:unitId` | The room page showed only the working month's meter and called it "มิเตอร์เดือนนี้" whatever month that was. It now names its งวด and carries a month picker, so any past month is one click away. The endpoint stays unused: one room across many months is a different screen, and stepping the picker turned out to be enough. |
| `DELETE /leases/:id` | A lease created by mistake could only be ended, which leaves a record of a tenancy that never happened — and bills a full month to someone who never moved in, since a lease that starts and ends inside a month still counts as having been in the room. แก้สัญญา now offers ลบสัญญานี้. Ending is right for a real move-out; deleting is right for a typo. |

Receipts add three routes — `GET /receipts?period=`, `POST /receipts`, `PUT /receipts/:id` — and deliberately no `DELETE`. `GET /bills/:id` now carries the bill's receipt when it has one, which is how the bill screen knows which button to offer and why the staleness banner refuses to regenerate.

Neither blocked the wiring.

### Failures

The prototype has never had a request fail, so it has no answer for any of this. Decide once and apply it everywhere rather than per screen.

**Show the message the API returned.** The backend writes errors for a person to read — `Unit 203 is already rented to สมชาย (ถึง 2026-09-15)` — and passing that through beats inventing wording that says less. Only fall back to a generic line when there is no message at all.

**A refused action is not a failure.** A tenant with leases cannot be deleted by design; a room already billed is skipped on purpose. Present the reason and the alternative, not an error state.

**Distinguish "the server said no" from "the server is not there".** A 400 is a rule being enforced and belongs beside the field that caused it. A network failure means the backend is not running, affects everything, and belongs at the top of the page with a way to retry. Treating both the same teaches the user to ignore both.

**Never leave a write in doubt.** If a save fails, the screen must not keep showing the new value as though it worked. Either roll the display back or mark the row as unsaved — the meter page is the sharp case, since it saves silently as you type and an unnoticed failure means a missing reading discovered at billing time.

**Reads that fail can retry; writes that fail must not, automatically.** Repeating a `POST /bills` after a timeout can produce two bills. The unique constraints will catch most of it, but the safe rule is to let the user decide.

### 2. Then Electron

Done. `electron/main.js` starts the Express server as a child process and opens a window at the port the OS gave it. The frontend needs no base URL at all now: Express serves the built pages itself, so the app and the API share one origin and every request is a relative path. See `PROGRESS.md` for what broke on the way, particularly the Node-API version check that has to stay.

---

## Vanilla or React

The prototype is one 2780-line file — 85% JavaScript, 13% CSS. It works, the design is settled, and it needs no build step, which made every round of feedback fast.

Three things about it will get worse once requests are involved, and they are the argument for porting:

**`render()` rebuilds the whole page.** Every state change replaces `main.innerHTML`, which throws away focus, caret position and scroll. Three places already work around this by hand — the tenant search box, the meter inputs, and the settings fields all restore focus after redrawing. With a response arriving mid-typing there will be more, and each one is a small piece of code that exists only to undo the rendering strategy.

**User data goes into HTML unescaped.** Around forty places interpolate a name or description straight into a template string. A tenant called `A & B จำกัด` or a fee description containing `<` will render wrong. It is a display bug rather than a security one on a single-user local app, but it is the kind that appears months later on one specific record.

**State is module-level variables.** Fine while everything is synchronous. Once a save is in flight while the user changes month, deciding which response still matters becomes manual.

React fixes all three by construction: diffing preserves focus, JSX escapes by default, and state belongs to the component that owns it.

**The recommendation is to port, not rewrite.** The screens are decided and the behaviour is proven, so this is translation work — one component per view, keeping the same layout, the same wording, and the same rules. Do it before wiring the API rather than after, or the wiring gets done twice.

**Staying vanilla is defensible** if the build step is unwelcome. The honest version of that path is to stop replacing `innerHTML` wholesale and update only what changed, plus an escaping helper used at every interpolation — which is most of what a framework does, written by hand.

## Splitting the file

Worth doing either way, and trivial: 364 lines of CSS in a `<style>` block move to `styles.css` with one `<link>`. Nothing else changes and the file still opens by double-clicking.

If the port to React happens, the split comes for free — one file per component, and either CSS modules or a single stylesheet carried over. The design tokens at the top of the current `<style>` block are already written as CSS variables and should stay that way; every colour in the app reads from them, which is what made trying four palettes in an afternoon possible.

Do not split the JavaScript by hand into script files. If it is worth splitting, it is worth having a bundler, and that decision arrives with React.

## Decisions that took work to reach

These are in `CLAUDE.md` in full. The short version, because reversing any of them quietly breaks something:

**Occupancy is derived from lease dates, never stored.** No `is_occupied` column to drift.

**`end_date` is the day the room becomes free**, not the last night slept. Every comparison uses `> `, and all six of them must agree — one `>=` among them makes the board show a room as vacant that the overlap guard refuses to fill.

**Every date comparison uses `date('now','localtime')`.** SQLite's `now` is UTC and Thailand is seven hours ahead, so plain `now` reports yesterday until 7am.

**Bills store what they charged.** Nothing is recomputed on read, which is why correcting one means deleting and regenerating rather than editing.

**Rent is copied onto the lease at move-in.** Raising a room's price never rewrites an existing tenant's terms or a past bill.

**Recurring and one-time charges are separate tables.** The question when adding anything is: does this happen again next month?

**Fee types are data, not code.** Retire with `is_active = 0`; deleting would orphan old bills.

**`settings.value` is TEXT and numeric settings convert on read.** One table holds both a rate and the building's name. Miss the conversion and `'9' + 1` gives `'91'` inside a bill.

---

## Bugs found by using it, worth not reintroducing

Every one of these came from clicking around rather than reading code.

- `date('now')` returning yesterday until 7am
- The overlap guard and the vacancy query disagreeing by one character
- A scheduled move-out that could be set but never cancelled, because `??` read `null` as "not supplied"
- Batch billing picking one lease when a handover month has two
- A wrong water reading discarding a correct electricity reading beside it
- Meter digit count guessed from the reading — a five-digit dial showing 500 looks like three digits and would add 1000 instead of 100000

---

## Not in scope

Payment tracking. Bills are recorded; whether anyone paid is tracked on paper. The bank details in settings are text printed on an invoice, nothing more.

Multi-building. Tenant login. Online payment.

Adding payments later needs no restructuring: a `payments` table pointing at `bills.id`, and an outstanding balance becomes "bills with no matching payment".

---

## Running it

```
cd backend
npm install
node server.js          # http://localhost:3001
```

`apartment.db` is created on first start. Delete it to begin from nothing. A backup is copied into `backend/backups/` on every start, keeping the last 30.

The prototype is a single file — open `archive/rooms.html` in a browser. It needs no server, and changes nothing.
