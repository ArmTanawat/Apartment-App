# Progress

Running notes on porting the prototype to React and wiring it to the backend.
Written so a fresh session can continue from this file alone.

**Status: Phase 1 (port) and Phase 2 (wire to the API) are both complete, and
the seven questions they raised have been answered and acted on.** The React
app in `frontend/` runs every screen against the real backend. `fetch` appears
in exactly one file. Electron packaging is not started.

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
npm run smoke:stale      # what they do when the data changed underneath them
```

`smoke/harness.jsx` renders the real app into jsdom and drives it with real
clicks and keystrokes against the running backend. `smoke/walk.jsx` re-seeds
first, so it starts from the same building however many times it has been run.
It prints `all passed` or names what broke. Not a test framework and there is
no watcher — run it after a change. All three suites pass.

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
