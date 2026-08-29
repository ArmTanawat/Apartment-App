# Functional Requirements

What the program must do. Read `DATABASE_DESIGN.md` for the schema and `CLAUDE.md` for conventions.

Status column: **Done** means built and tested. **To build** means agreed but not yet written.

---

## Rooms and tenants

| # | Requirement | Status |
|---|---|---|
| 1.1 | Add, edit, and delete rooms (number, floor, base rent) | Done |
| 1.2 | Add, edit, and delete tenants (name, phone, ID, address, note) | Done |
| 1.14 | Search tenants by name or phone | Done |
| 1.15 | See which tenants are missing details the bill needs | Done |
| 1.3 | Move a tenant into a room, recording start date, rent, and deposit | Done |
| 1.10 | Correct a lease after move-in — start date, rent, deposit | Done |
| 1.11 | Capture phone, address, and ID when creating a tenant during move-in | Done |
| 1.12 | Edit a tenant's own details from the room they occupy | Done |
| 1.13 | Add a charge to a tenant who has already moved out, for their final month | Done |
| 1.4 | Rent defaults to the room's base rent but can be overridden | Done |
| 1.5 | Move a tenant out by setting an end date | Done |
| 1.6 | One tenant may rent several rooms at once | Done |
| 1.7 | A room may not have two active leases at the same time | Done |
| 1.16 | Correcting a lease may not move it into another tenant's stay | Done |
| 1.8 | See every room with its current tenant, or empty | Done |
| 1.9 | See only the empty rooms | Done |

A room is empty when it has no active lease. Nothing is marked by hand.

Deleting is blocked when history depends on it: a tenant with leases, a room with leases, a lease with bills. Ending a lease is the normal action.

## Deposits

| # | Requirement | Status |
|---|---|---|
| 2.1 | Record the deposit taken at move-in | Done |
| 2.2 | Deposit is returned in full at move-out | Outside the program |

Damage is charged as a normal one-time charge on a monthly bill, so the deposit is never partially deducted. No refund tracking is needed.

## Meter readings

| # | Requirement | Status |
|---|---|---|
| 3.1 | Enter water and electricity readings per room per month | Done |
| 3.2 | Previous reading fills in automatically from last month | Done |
| 3.3 | See at a glance which rooms are still missing a reading | Done |
| 3.4 | Correct a reading that was typed wrong | Done |
| 3.5 | Reject a current reading lower than the previous one | Done |
| 3.8 | Handle a meter that wrapped past its last digit | Done |
| 3.9 | Handle a meter that was replaced and restarted at zero | Done |
| 3.10 | Correct a previous reading upward without first inflating the current one | Done |
| 3.12 | Clear a current reading, leaving the room outstanding on the checklist | Done |
| 3.11 | Fix water and electricity independently when both read low | Done |
| 3.6 | One reading per room per month, no duplicates | Done |
| 3.7 | View reading history for a room | Backend done, no UI |

## Fees

| # | Requirement | Status |
|---|---|---|
| 4.1 | Create, rename, reprice, and retire fee types | Done |
| 4.2 | Attach recurring fees to a tenant, charged every month | Done |
| 4.3 | Override the amount of a recurring fee per tenant | Done |
| 4.4 | Cancel a recurring fee, affecting future bills only | Done |
| 4.5 | Add a one-time charge that appears on one month only | Done |
| 4.6 | Edit or delete any fee or charge | Done |
| 4.7 | See which fee types are attached to somebody, so an unused one can be deleted | Done |

Recurring and one-time are separate. The question when adding a charge is always: does this happen again next month?

## Utility rates

| # | Requirement | Status |
|---|---|---|
| 5.1 | Set the price per unit for water and for electricity | Done |
| 5.2 | Set a minimum charge for water: a flat amount covering the first N units | Done |
| 5.3 | Set a minimum charge for electricity, with its own separate figures | Done |
| 5.4 | Turn the minimum charge on or off for a given month, for the whole building at once | Done |
| 5.5 | All figures editable — the threshold, the flat amount, and the per-unit rate | Done |
| 5.11 | Show a worked example of what N units cost, from the same code that prices a bill | Done |
| 5.6 | Set how many digits the water and electricity meters have | Done |
| 5.7 | Set the building's own name | Done |
| 5.8 | Set the building's address and phone, printed as the invoice header | Done |
| 5.9 | Set bank details printed at the foot of the invoice | Done |
| 5.10 | Set a free-text note printed on every bill | Done |

### How the minimum charge works

Water and electricity each have their own threshold, flat amount, and rate. Using water as the example, with a threshold of 5 units, a flat amount of 100 baht, and a rate of 9 baht:

| Units used | Charge | Working |
|---|---|---|
| 3 | 100 | Under the threshold, flat amount only |
| 5 | 100 | At the threshold, flat amount only |
| 8 | 127 | 100 + (3 units above the threshold x 9) |

When the minimum is switched off for a month, the charge is simply units x rate.

The switch is one setting for the whole building for that month, not per room.

Rates in force are read at bill generation and the resulting baht amount is frozen onto the bill. Changing a rate later never alters a bill already generated.

## Bills

| # | Requirement | Status |
|---|---|---|
| 6.1 | Generate a bill for one tenant for one month | Done |
| 6.2 | Bill includes rent, water, electricity, recurring fees, one-time charges | Done |
| 6.3 | Each line shows its working, e.g. units used, meter start and end | Done |
| 6.4 | Preview the figures before saving | Done |
| 6.5 | One bill per tenant per month, no duplicates | Done |
| 6.6 | View bill history by month or by tenant | Done |
| 6.7 | Delete a bill generated by mistake | Done |
| 6.8 | Generate bills for several rooms at once | Done |
| 6.9 | Choose rooms by range, by tick list, or select all | Done |
| 6.10 | Charge rent by the day instead of the full month, when chosen | Done |
| 6.15 | Rent by the day applies to a batch as well as to a single bill | Done |
| 6.12 | Detect a bill whose underlying data changed after it was issued | Done |
| 6.13 | Correct a bill in one action — delete and regenerate | Done |
| 6.14 | Print every bill for a month in one pass | Done |
| 9.1 | One working month shared by the meter and bill pages | Done |
| 9.2 | Open on the current month; never navigate past it | Done |
| 9.3 | Look back at any earlier month's readings and bills | Done |
| 6.11 | Printable bill | Done |

### Generating for several rooms

Selection is by room. Three ways to choose, all producing the same list:

- **Range** — from 101 to 109, or 101 to 601 for everything
- **Tick list** — pick individual rooms
- **Select all**

Rooms with no active lease are skipped. Rooms with no meter reading for that month are reported as errors and skipped, without stopping the others: a batch of 20 where 2 are missing readings generates 18 bills and names the 2 that failed.

### Regenerating after a mistake

A room already billed for that month is **not** silently replaced. The batch reports it as already billed and skips it. To correct a bill, delete it first, then generate again.

This is deliberate. Overwriting silently would destroy a record with no warning, and a bill is the only evidence of what was actually charged.

### Rent by the day

Full month is the default because it is what nearly always happens. When chosen for a bill, rent is charged as:

```
monthly_rent / days_in_month x days_occupied
```

The bill line records the working, for example "11 of 30 days". Nothing changes in the schema — `rent_amount` stores the calculated figure like any other.

## Bill language

| # | Requirement | Status |
|---|---|---|
| 7.1 | Bill labels print in Thai and English, e.g. `ค่าน้ำ Water` | Done |
| 7.2 | The working under each line is Thai | Done |
| 7.3 | Fee names print exactly as typed, so new ones should be typed bilingually | Done |
| 7.4 | Periods stay Gregorian internally; a Buddhist year is a display choice | Done |

Wording is frozen into `bill_items` when a bill is generated. Renaming a fee afterwards does not alter a bill already issued.

## Backups

| # | Requirement | Status |
|---|---|---|
| 8.1 | Copy the database to a dated file on every server start | Done |
| 8.2 | Keep the most recent 30 copies and delete older ones | Done |
| 8.3 | Restore by copying a backup file over `apartment.db` | Done |
| 8.4 | See the list of existing backups and when the last one was made | Done |
| 8.5 | Make a backup on demand, before a batch of changes | Done |

The backups sit on the same machine as the database, so the folder should also be copied to a USB drive or cloud folder from time to time. A backup on the same failed disk is not a backup.

## Known gaps

| # | Gap | Note |
|---|---|---|
| G1 | No screen for a room's meter history | `GET /readings/history/:unitId` exists and is unused |
| G2 | A lease created by mistake cannot be deleted, only ended | `DELETE /leases/:id` exists and is unused |

Neither blocks anything. Both are listed so they are not mistaken for dead code on the server.

## Not in scope

| Item | Note |
|---|---|
| Payment tracking | Bills are recorded; whether they were paid is tracked outside the program on paper |
| Outstanding balance carried onto the next bill | Not shown. Depends on payment tracking |
| Multi-building support | One building only |
| Tenant login | Staff use only |
| Online payment | No |

Adding payment tracking later needs no restructuring: a `payments` table would point at `bills.id`, and an outstanding balance becomes "bills with no matching payment".
