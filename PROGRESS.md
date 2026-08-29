# Progress

Running notes on porting the prototype to React and wiring it to the backend.
Written so a fresh session can continue from this file alone.

**Status: Phase 1 (port to React) complete. Phase 2 (wire to the API) not started.**

---

## How to run it

```
cd backend  && npm install && node server.js     # http://localhost:3001
cd frontend && npm install && npm run dev        # http://localhost:5173
```

`prototype/rooms.html` is untouched and still opens by double-clicking. Keep it
open beside the React app when checking a screen.

### The smoke walk

```
cd frontend
npx vite build --ssr smoke/walk.jsx --outDir smoke-dist && node smoke-dist/walk.js
```

`smoke/harness.jsx` renders the real app into jsdom and drives it with real
clicks and keystrokes; `smoke/walk.jsx` walks the paths from the brief's
verification list — move in and out on the same day, a reading below last
month, batch billing with a room unmetered, the staleness banner, print-all,
and the tenants and settings screens. It prints `all passed` or names what
broke. It is not a test framework and there is no watcher; run it after a
change. All 50 checks pass as of the end of Phase 1.

---

## Phase 1 — port to React

Done. Every screen renders and behaves as the prototype does.

### Structure

```
frontend/src/
├── App.jsx                    view router + the rail
├── data/mockData.js           the prototype's arrays, unchanged. DELETED IN PHASE 2.
├── styles/app.css             the prototype's <style> block, lines 11-373, verbatim
├── lib/
│   ├── helpers.js             the rule-mirroring helpers, made pure
│   └── buildBill.js           buildBill / billDiff / utilityCharge. DELETED IN PHASE 2.
├── state/
│   ├── DataContext.jsx        the collections + one named action per change
│   └── UiContext.jsx          view, working month, and the sticky per-screen bits
├── pages/                     one file per view (9)
└── components/
    ├── RoomCard, MonthPicker, Modal, Switch, ErrBox
    ├── BillPaper.jsx          shared by BillPage and PrintAllPage
    └── modals/                one component per prototype modal, + ModalHost
```

Two deviations from the structure suggested in the brief, both deliberate:

- **`state/` instead of state inside `App.jsx`.** The prototype's module-level
  variables split into two kinds: data (eleven arrays) and UI (which view, the
  working month, which filter chip is on). Keeping them in one component would
  have meant threading a dozen props through every page. Two contexts also
  draws the Phase 2 line exactly where it belongs — `DataContext` is the file
  that gets `fetch` in it, `UiContext` never does.
- **`components/modals/`**, six files rather than one. Seventeen dialogs.

### The three things the port had to fix

- **Focus loss.** Gone. The three hand-written caret restores (tenant search,
  meter inputs, settings fields) are not ported; React's diffing keeps the
  caret. Verified in the walk: typing in the search box and in a rate box
  leaves the text in place.
- **Unescaped interpolation.** Gone. Everything is JSX. `dangerouslySetInnerHTML`
  appears nowhere — grep for it before merging anything.
- **Module-level mutable state.** Gone, into the two contexts.

### Things worth knowing about the port

**Text boxes that hold numbers keep their own draft string.** The prototype
never re-rendered while you typed, so a box could hold `""` or `1.` on its way
to a number. A plainly controlled input would rewrite that under the caret.
So the meter inputs, the settings rate boxes, the example boxes and the
prorate-days box display a local string and write the parsed number to state.
The stored value and the displayed text are deliberately allowed to differ,
which is what the prototype did.

**`bumpMeter()` replaces `render()` on the meter page.** The prototype called
`render()` after any write to a reading that did not come from typing — a
rollover, a replaced meter, a corrected previous figure — which threw the
inputs away and redrew them from the data. `UiContext.meterRevision` is bumped
by exactly those actions and keys the row block, so the boxes go back to
showing what is stored. This reproduces one visible oddity: after clicking
ครบรอบ the box you just typed into goes blank and the number has to be typed
again. That is what the prototype does (`applyRollover` never reads the input
when a row already exists), so it is preserved rather than fixed. **Question
for the owner** — see below.

**Per-screen UI state lives in `UiContext`, not in the page.** `picked`,
`prorateOn`, the filter chips, the tenant search box: all were module-level, so
leaving บิล to look at one bill and coming back kept the selection. Putting them
in the page component would have reset them on every mount. Changing the month
clears `picked` and `lastResult` and nothing else, as before.

**The two seeded bills** the prototype generated at the bottom of its script are
now the starting value of `bills` in `DataContext`.

**`--attention` is undefined.** `.stale` in the prototype's CSS reads
`border: 1px solid var(--attention)`, and no such token exists in `:root`, so
the banner has no border. Copied verbatim, border and all. **Question for the
owner** — see below.

---

## Phase 2 — wire to the API

Not started. The plan, unchanged from `HANDOFF.md`:

1. Delete `lib/buildBill.js` first and replace it with
   `GET /bills/preview/:leaseId/:period`. `billDiff()` compares the stored
   bill's line items against that response — line by line, never the total.
2. Then one screen at a time: BoardPage, RoomPage, MeterPage, Bills/BillPage,
   TenantsPage and SettingsPage.
3. `data/mockData.js` is deleted when the last screen is wired.

The API base URL goes in one constant so Electron is a one-line change.

### Failures

Apply the policy in `HANDOFF.md`, not a new one per screen: show the message
the API returned; a refused action is not a failure; distinguish "the server
said no" from "the server is not there"; never leave a failed write looking
successful; reads may retry, writes must not retry automatically.

---

## Where the two sides do not line up

Nothing found yet that needs a new route. The two known gaps from `HANDOFF.md`
(`GET /readings/history/:unitId` and `DELETE /leases/:id` have no screen) are
still open and still do not block anything.

Purely local, no endpoint needed and never will be: room selection on the bills
page, the range box, printing, the month picker, the board's edit-mode add
buttons.

---

## Questions for the owner

Found while porting. Nothing was changed on account of any of them.

1. **After ครบรอบ, the meter box goes blank.** You click the button, the number
   you typed disappears, and you type it again. The rollover is saved correctly
   and the second attempt bills right. Should the typed number be kept?

2. **The stale-bill banner has no border.** Its CSS asks for `var(--attention)`,
   which is not defined, so the yellow box has no outline. Should there be a
   token for it, or is the yellow enough?

3. **A reading with a previous number but no current one produces a nonsense
   bill on the server, not an error.** `backend/routes/bills.js` refuses to
   build a bill when there is no reading row at all, but a row whose
   `water_curr` is null gets through and bills a negative usage. The prototype
   checks for it and refuses (`ยังจดมิเตอร์ไม่ครบ`), so the two disagree. That
   state is reachable: correcting a previous figure upward clears the current
   one on purpose. This is a backend change, so it is recorded here rather than
   made. It will matter in Phase 2, when the screen stops doing its own check.

4. **`PUT /readings/:id` cannot clear a current reading.** It merges with `??`,
   so `water_curr: null` reads as "not supplied" and the old number stays —
   the same trap `PUT /leases/:id` avoids by testing with `in`. The correction
   in point 3 is exactly the case that needs it, so Phase 2 will have to
   `DELETE` and re-`POST` the row, or the route needs the same `in` treatment
   `end_date` got.

---

## Log

**Phase 1.** Read the docs and all 2780 lines of the prototype, confirmed the
backend answers on 3001, scaffolded Vite + React in `frontend/`, lifted the CSS
and the mock data unchanged, then ported the nine views and seventeen modals.
Built the jsdom walk to check the paths in the brief rather than eyeballing.

Nothing broke that was worth recording except three of my own wrong assumptions
about the mock data while writing the walk (11 rooms are occupied, not 8; 104
is the vacant room, not 103; a wrap on a four-digit dial from 151 to 5 is 9854
units). The app was right in all three.
