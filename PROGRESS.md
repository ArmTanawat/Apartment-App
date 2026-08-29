# Progress

Running notes on porting the prototype to React and wiring it to the backend.
Written so a fresh session can continue from this file alone.

**Status: Phase 1 (port) and Phase 2 (wire to the API) are both complete.**
The React app in `frontend/` runs every screen against the real backend.
`fetch` appears in exactly one file. Electron packaging is not started.

---

## How to run it

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
cd frontend
npm run smoke            # the paths from the brief's verification list
npm run smoke:offline    # what the screens do when the server is not there
```

`smoke/harness.jsx` renders the real app into jsdom and drives it with real
clicks and keystrokes against the running backend. `smoke/walk.jsx` re-seeds
first, so it starts from the same building however many times it has been run.
It prints `all passed` or names what broke. Not a test framework and there is
no watcher — run it after a change. Both suites pass.

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

- **`PUT /leases/:id` has no overlap check** (unlike `POST /leases`), so
  แก้สัญญา keeps its client-side clash test. Nothing else would stop a start
  date being dragged back into someone else's stay. **Question 5 below.**
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

The prototype had never had a request fail, so it has no words for any of this.
Five strings were written, kept to its voice — **question 6 below**:

| Where | Text |
|---|---|
| First load | `กำลังโหลด…` |
| First load, no server | `ติดต่อเซิร์ฟเวอร์ไม่ได้` / `โปรแกรมส่วนหลังยังไม่ได้เปิด เปิดแล้วกดลองใหม่` / `ลองใหม่` |
| Banner | `ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตัวเลขที่เห็นอาจไม่ใช่ล่าสุด และยังบันทึกอะไรไม่ได้` |
| Meter row | `ยังไม่ได้บันทึก` |

---

## Backend changes

Three, all proven necessary by Phase 2, all following the pattern of their
neighbours, all recorded in `backend/README.md` and `REQUIREMENTS.md` in the
same commit. **They are the only edits to `backend/`, and the owner should look
at them first.**

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

- `PUT /settings/period/:period` returns `bills_already_generated` and a `note`
  saying those bills are unchanged. No screen shows it — **question 4**.
- `PUT /fees/onetime/:id` has no button; the prototype only adds and deletes
  one-time charges. Same as before the port.
- `GET /units/vacant` and `GET /leases/active` are unused, because the board
  and the tenant list read the fuller lists. Not gaps.

**One shape is missing rather than one route.** There is no endpoint for *all*
lease fees, and ตั้งค่า needs one to know which fee types are in use — that is
what decides whether a delete button is offered. It asks `/fees/lease/:id` once
per lease instead. Correct, and cheap on the least-visited page with fifteen
leases, but a `GET /fees/lease` would make it one request. Not added, because
nothing today needs it — **question 7**.

---

## Questions for the owner

Found while working. Nothing was changed on account of any of them.

1. **After ครบรอบ, the meter box goes blank.** You click the button, the number
   you typed disappears, and you type it again. The rollover is saved correctly
   and the second attempt bills right. Should the typed number be kept?

2. **The backend's error messages are English; the screens are Thai.** The
   policy in `HANDOFF.md` and `FRONTEND.md` is to show the message the API
   returned, so `ห้อง 203 มีผู้เช่าอยู่แล้ว — สมชาย` is now
   `Unit 203 is already rented to สมชาย (ถึง 2026-09-15)`, and a skipped room
   on บิล reads `No meter reading entered for unit 106 in 2026-08`. The
   messages are good ones and they name the right things, but they are in the
   wrong language for the person using this daily. Should the backend's error
   strings be translated? That is a backend change and a large one, so it is
   recorded rather than made.

3. **The stale-bill banner has no border.** Its CSS asks for `var(--attention)`,
   which is not defined in `:root`, so the yellow box has no outline. Copied
   verbatim. Should there be a token for it, or is the yellow enough?

4. **Switching the minimum charge off for a month that is already billed says
   nothing.** The API replies that N bills exist and are unchanged. The screens
   warn about this for a meter reading and a one-time charge but not for this
   switch. Worth adding the same warning?

5. **`PUT /leases/:id` does not check for an overlap, `POST /leases` does.**
   Correcting a start date backwards into a previous tenant's stay is refused
   only by the screen. Should the route check it too?

6. **Five new Thai strings** had to be written for states the prototype never
   had — loading, the server being unreachable, and a meter row whose save
   failed. They are in the table above. Worth a read.

7. **`GET /fees/lease` (all of them) would save ตั้งค่า about fifteen requests.**
   Not added because nothing is slow. Say if it should be.

---

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
