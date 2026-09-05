# Apartment Management App

Local software for one small apartment building. It shows which rooms are free, takes the monthly water and electricity readings, bills each tenant, and issues a receipt.

`PROGRESS.md` is the resume point: what is built, what is open. `FRONTEND.md` holds the screens and the rules that govern them, `DATABASE_DESIGN.md` the schema and its reasoning, `REQUIREMENTS.md` what the program must do, `backend/README.md` every endpoint. The source is the truth for structure — `backend/db.js` for tables, `frontend/src/` for screens — not any document.

## Stack

- Backend: Node.js + Express, SQLite via `better-sqlite3`, port 3001
- Frontend: React under Vite in `frontend/`, one file per view, port 5173 in dev
- Desktop: `electron/` starts the server and points a window at it
- Runs locally on one machine, offline

## Structure

`backend/server.js` starts the server and mounts routers, nothing else. Route files under `backend/routes/` use `express.Router()` and declare paths relative to their mount point (`/` and `/:id`, never `/tenants/:id`). The prefix belongs in `server.js` only.

Adding a feature means one new file in `routes/` plus two lines in `server.js`. Do not put route logic in `server.js`.

## Rules the database cannot enforce

These must be checked in route handlers. Both were deliberate decisions, not oversights.

**One active lease per unit.** A unit may not have two overlapping leases. No foreign key or UNIQUE constraint can express this because it compares dates across other rows. `POST /leases` checks for an existing active lease before inserting and returns 400 naming the current tenant. Without this check SQLite accepts the insert silently.

**Round money when writing a bill.** `Math.round(x * 100) / 100` on every amount going into `bills`. `REAL` is exact for whole and half baht, but an awkward rate can produce a long trailing decimal.

**Never overwrite an existing bill.** Generating for a month already billed returns an error naming the room, and the batch route skips it and carries on. The user deletes the old bill first if a correction is needed. Silently replacing a bill destroys the only record of what was actually charged, with no warning.

**A failed room in a batch must not stop the others.** Generating for twenty rooms where two lack meter readings produces eighteen bills and reports the two by room number. Collect failures and return them alongside the successes rather than throwing on the first one.

**`end_date` is the day the room becomes free, not the last night slept.** A lease ending on the 16th and one starting on the 16th do not overlap. Moving out today makes the room vacant today, and a new tenant can start the same day.

Every date comparison must use this meaning. In practice that means `end_date > date` everywhere — the vacancy query, the active-lease lookup, the overlap guard in `POST /leases`, and the lease selection in `POST /bills/batch`. A single `>=` among them splits the system in two: the board reports a room as vacant while the overlap guard refuses to let anyone move in, with no error to trace. Grep for `end_date` before changing any of them.

**A receipt has no number, and that is what makes the rest of it work.** It is the paper form of one bill: the room, the period, every line and the total are read off the bill when the page is drawn, and the only thing stored on the receipt itself is a note. Nothing is printed on it that the program would later be contradicting, so a receipt can be cancelled and issued again, and a corrected bill produces a corrected receipt. Adding an identifier to `receipts` takes all of that back.

**Cancelling a receipt is an ordinary delete.** `DELETE /receipts/:id` removes the row, the bill goes back to `ยังไม่ได้ออก`, and issuing again is the same act as the first time. The note goes too — it described that issuing, and there is no second issuing it would still be true of.

**A receipt goes with its bill, through `ON DELETE CASCADE`.** Correcting a bill is a delete and an insert, so the receipt for the old bill is taken with it and the user issues afresh against the new figures. Without the cascade the delete fails on the foreign key and a receipted bill becomes uncorrectable. Both screens warn before the press: the tenant may be holding the printed page, which needs replacing.

**A bill is stored, so correcting one means deleting and regenerating it.** There is no in-place edit. Changing a meter reading or adding a charge does not touch a bill already saved, and reprinting it produces the same figures as before.

The screen hides this. Opening a bill quietly fetches `GET /bills/preview/:leaseId/:period` alongside it and compares. When they differ, a banner says the data changed after this bill was made, and one button does the whole correction — delete, regenerate, done. The user never sees a delete step.

**Compare the line items, not the total.** Two mistakes can cancel out: a meter corrected down by 450 and a repair added for 450 leave the total identical while both lines are wrong. A total-only check reports "nothing changed" on a bill that is wrong twice over.

A regenerated bill has a new id. If the old one was printed and handed over, say so — it needs reprinting.

## Conventions

**Route order.** Literal paths before parameterised ones. `/units/vacant` must be declared before `/units/:id` or Express reads "vacant" as an id. This bug is silent and confusing — watch for it whenever a new literal route is added.

**Errors.** Return a JSON object with an `error` key and a message a non-technical user can act on. Name the specific thing: `Unit 101 is already rented to Somchai Jaidee`, not `Conflict`.

Status codes: 400 for bad input or a broken business rule, 404 for a missing record, 201 on create, 204 on delete.

**Deletion is blocked when history depends on it.** A tenant with leases, a unit with leases, and a lease with bills cannot be deleted. Ending a lease is the normal action; deleting is only for correcting a mistake. Check the dependency and return a 400 explaining what to do instead, rather than letting SQLite throw a raw foreign key error.

**Partial updates use `??`, not `||`.** `deposit ?? existing.deposit` — with `||` a deposit of `0` would be treated as absent and overwritten.

**`db.pragma('foreign_keys = ON')` must stay in `db.js`.** SQLite disables foreign key enforcement by default. Without that line every `REFERENCES` clause is decorative.

**Dates.** Every comparison uses `date('now','localtime')`, never `date('now')`. `DATABASE_DESIGN.md` carries the rule and why plain `now` is wrong here.

## Working efficiently

This is a Thai-language app; its files cost several times more tokens than their size
in English suggests. Read narrowly.

- Grep for the symbol before opening a file, and read only the region around the hit.
- Never read a file whole to learn what an endpoint returns. `backend/README.md` lists
  every endpoint, and one curl against a running server settles anything it does not.
- `DATABASE_DESIGN.md`, `HANDOFF.md` and `FRONTEND.md` are reference. Read the section
  that answers the question, not the document.
- Start a fresh session for unrelated work rather than carrying context across. Write
  what you did to `PROGRESS.md` first so the next session resumes from that file
  instead of rereading the codebase.
- `PROGRESS.md` is the resume point. Keep it current enough that a session which has
  never seen this repo could continue from it alone.

## Testing

`npm test` from the repository root runs the suites; `PROGRESS.md` says what each one covers. When testing a rule, test both sides — that valid input succeeds and that invalid input is actually blocked. A guard that was never seen to reject something has not been tested.

Delete `backend/apartment.db` to start from a clean state; it is recreated on the next server start.

## Not in scope

Payments are a future addition. The design accommodates it — a `payments` table would point at `bills.id` — but do not build it. Multi-building support, tenant login, and online payment are not planned.
