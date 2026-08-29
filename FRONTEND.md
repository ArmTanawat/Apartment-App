# Frontend Spec

The screens, the design direction, and which button calls which endpoint.

Read `REQUIREMENTS.md` for what the program must do, `DATABASE_DESIGN.md` for the data, and `CLAUDE.md` for coding rules. This file covers the interface only.

**UI language is Thai.** Bills print bilingually because tenants read them; the app itself is used only by the owner and staff, so its buttons and menus are Thai.

---

## Design direction

### The idea

Thai apartment buildings keep a key board at the desk — a wooden rack with a hook per room, numbers painted above. The key hanging there means the room is empty. That board is the home screen.

It answers the program's first job (which rooms are free) at a glance, and doubles as the way into everything else: tap a room to reach its tenant, its meter, its bills.

### Colour

Black and white carries the interface. Exactly two colours carry meaning, and nothing else is coloured.

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FCFCFC` | Page background |
| `--surface` | `#FFFFFF` | Cards, panels |
| `--ink` | `#1A1A1A` | Text, buttons, active nav |
| `--muted` | `#8C8C8C` | Secondary text, the status note |
| `--line` | `#E4E4E4` | Borders, dividers |
| `--occupied` | `#2E7D46` | Room has a tenant |
| `--vacant` | `#B3382C` | Room is empty |

Earlier drafts gave three separate meanings to colour — occupied, vacant, and not-yet-metered — and the board became a code to decode rather than a thing to read. Colour now answers one question only: is anyone living here.

Red for vacant is deliberate. In a booking system green would mean available, but the reader here is the owner, and an empty room is lost income. It also puts the loudest colour on exactly what the owner is scanning for.

Colour is never the only signal. A vacant card also says ว่าง in words, so red-green colour blindness costs nothing.

Everything a room still needs — a meter reading, a bill — is a small grey note, not a colour. It is secondary information and should read that way.

### Type

| Role | Face | Notes |
|---|---|---|
| Everything Thai | **Noto Sans Thai Looped** | Looped forms (แบบมีหัว), not loopless |
| Figures | **Roboto Mono** | Meter readings, money, room numbers. Plain zero — a slashed one reads oddly on an invoice |

Looped Thai is the friendlier, more familiar shape and carries the warmth the brief asks for. Loopless Thai reads modern but colder.

Every figure is tabular so columns of money line up. Meter readings in mono because that is what a meter shows.

Thai needs more vertical room than Latin — tone marks stack above, descenders drop below. Set `line-height: 1.75` on body text and never below `1.4` on headings, or the marks collide.

Scale: 13 / 15 / 18 / 24 / 32. Weights 400, 500, 700 only.

### Layout

Slim left rail, generous everywhere else.

```
┌────────┬──────────────────────────────────────────────────────┐
│        │  ห้องพัก                          กันยายน 2026 ▾      │
│  ห้อง  │                                                       │
│  บิล   │  ชั้น 1 ──────────────────────────────────────────    │
│  ผู้เช่า│  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐            │
│  ตั้งค่า│  │101││102││103││104││105││106││107││108││109││110│   │
│        │  │สมชาย││ว่าง││มาลี││นงค์││ธนา││ว่าง││เกษม││จิรา││ปรีชา││อนงค์│
│        │  │ ○ ││   ││ ● ││ ● ││ ● ││   ││ ● ││ ○ ││ ● ││ ● │   │
│        │  └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘            │
│        │                                                       │
│        │  ชั้น 2 ──────────────────────────────────────────    │
└────────┴──────────────────────────────────────────────────────┘
```

A floor is one row. Ten rooms across, so a floor reads as a floor rather than as a block of cards that happens to wrap.

That makes each card roughly 90px wide, which changes what fits on one. The room number stays large because it is what the eye searches for. The tenant name truncates to one line. Rent comes off the card entirely — it belongs on the room page, not the board. The status note shrinks to a single small dot.

8px radius, nothing rounder — this is a working tool, not a toy.

### Signature

A floor of rooms in a single row, read like the key rack it comes from. A green edge means occupied, red means empty, and a small grey dot in the corner means something is still owed for this month — hollow for outstanding, filled for done.

The counts in the filter row carry the numbers, so the cards do not have to. Everything else on the page stays quiet.

### Motion

Almost none. Hover lifts a card by 1px. Page changes cross-fade at 120ms. A generated bill counts up its total once, over 400ms, because that number is the point of the whole program.

Respect `prefers-reduced-motion` — skip all of it.

---

## Screens

Five pages in the nav, plus a room page reached by tapping a card, plus a print layout.

A month is picked once and shared by บันทึกมิเตอร์ and บิล. It opens on the current month and cannot go past it.

ห้องพัก has no picker. Occupancy there is always today's; only its outstanding-work note follows the working month, and the page labels which is which.

| Page | The one job |
|---|---|
| ห้องพัก | Which rooms are free, and what still needs doing |
| บันทึกมิเตอร์ | Type this month's numbers |
| บิล | Make the bills, look at old ones |
| ผู้เช่า | Find a person, keep their details for the bill |
| ตั้งค่า | Rates, fee types, backups |

---

### 1. ห้องพัก — the board

**Flow.** Open the app and land here. The board answers the question that brought you: is anything free, and is there work left this month.

Tapping a card opens that room's page. A vacant card offers ย้ายเข้า directly.

**On screen.** Room cards grouped by floor. Colour says occupied or vacant. A small grey note says what is outstanding — ยังไม่จดมิเตอร์, ยังไม่ออกบิล, or เรียบร้อย. Filters across the top with counts.

| Action | Call |
|---|---|
| Load the board | `GET /units` |
| Filter ว่าง | `GET /units/vacant` |
| Outstanding notes | `GET /readings?period=` and `GET /bills?period=` |
| เพิ่มห้อง | `POST /units` |

`GET /units` already returns `is_occupied` and the tenant's name. The two extra calls supply the meter and bill state; merge them by `unit_id` on the client.

---

### 2. ห้อง 203 — the room page

Not in the nav. A full page rather than a panel, because there is too much here to work inside a 400px drawer.

**Flow.** Everything about one room, and the place where things happen to it — someone moves in or out, something breaks.

**On screen.** Four blocks: current tenant with their recurring fees; this month's meter; one-time charges; past bills.

| Action | Call |
|---|---|
| The room | `GET /units/:id` |
| Who is here | `GET /leases` filtered by unit |
| Recurring fees | `GET /fees/lease/:leaseId` |
| Meter history | `GET /readings/history/:unitId` |
| Past bills | `GET /bills` filtered by lease |
| ย้ายเข้า | `POST /leases` |
| ย้ายออก | `PUT /leases/:id/end` |
| Add or remove a recurring fee | `POST /fees/lease`, `DELETE /fees/lease/:id` |
| ค่าใช้จ่ายครั้งเดียว | `POST /fees/onetime` |

**One-time charges belong to a lease, not a room.** In a handover month a room has two: the tenant who left and the one who arrived. A repair on the 10th is the departing tenant's. So the form asks who is being charged whenever the month holds more than one lease, and skips the question when there is only one.

**Moving in is rejected when the dates overlap an existing lease.** The API returns the current tenant's name and the date they leave. Show that sentence.

---

### 3. บันทึกมิเตอร์ — meter entry

**Flow.** Done while walking the building, possibly over two days. Leaving halfway and coming back is normal, so nothing is a wizard and nothing is lost.

**On screen.** One row per occupied room. Rooms already entered collapse to a summary with an แก้ไข link. Rooms still missing show two boxes with the previous reading filled in — only the current number is typed. A count at the top: `จดแล้ว 12 จาก 16 ห้อง`.

Vacant rooms are hidden.

| Action | Call |
|---|---|
| The list | `GET /readings?period=` |
| Prefill previous | `GET /readings/previous/:unitId/:period` |
| Save | `POST /readings` |
| Correct | `PUT /readings/:id` |

`is_entered: false` marks the rooms still needing a number — that flag is the whole checklist.

Saving is per row, as the number is typed. No submit button for the page, so closing it never loses anything.

A reading below last month's is refused with a plain reason. Do not block typing; check on save.

---

### 4. บิล — bills

**Flow.** Sat at the desk after the meters are done. Choose rooms, check the numbers, generate. Then it is the place old bills are found and printed.

**On screen.** Two halves. The top makes bills for the chosen month; the bottom lists bills already made, with a total.

**Making bills**

Room selection three ways — a range (`101` ถึง `109`), individual ticks, or เลือกทั้งหมด. All three produce the same list of rooms.

Two switches sit here, not in ตั้งค่า, because both are decisions about this month's bills:

- คิดขั้นต่ำค่าน้ำค่าไฟ — on by default
- คิดค่าเช่าตามวันที่อยู่จริง — off by default

Preview before saving. The result reports both sides:

```
ออกบิลแล้ว 16 ใบ

ข้าม 2 ห้อง
  ห้อง 104   ยังไม่ได้จดมิเตอร์
  ห้อง 108   ออกบิลเดือนนี้ไปแล้ว
```

Never a plain success message when rooms were skipped.

**A handover month produces two bills for one room.** Both appear in the result, each with its tenant's name. This is correct, not a duplicate.

| Action | Call |
|---|---|
| Preview | `GET /bills/preview/:leaseId/:period` |
| Generate | `POST /bills/batch` |
| Generate one | `POST /bills` |
| Minimum on/off | `PUT /settings/period/:period` |
| History | `GET /bills?period=` |
| One bill | `GET /bills/:id` |
| Delete | `DELETE /bills/:id` |

Deleting warns that regenerating is the only way back, and that this is how a mistake is corrected.

---

### 5. ผู้เช่า — tenants

**Flow.** The least visited page. Most tenants hold one room and are reached from the board instead. This exists to find someone by name, to keep the details that print on their bill, and to see the rare tenant holding several rooms.

**On screen.** A searchable list. Tapping a name shows their details and every room they hold.

| Action | Call |
|---|---|
| List | `GET /tenants` |
| Detail | `GET /tenants/:id` |
| Rooms held | `GET /leases` filtered by tenant |
| เพิ่ม / แก้ไข | `POST /tenants`, `PUT /tenants/:id` |
| ลบ | `DELETE /tenants/:id` |

Name, phone, and address print on the bill, so the edit form should say so.

Deleting a tenant who holds leases is refused by design. Show the reason and offer ย้ายออก instead.

---

### 6. ตั้งค่า — settings

**Flow.** Opened rarely. Rates change once a year, fee types less often.

**Rates** are shown as a worked example, not six naked boxes:

```
ค่าน้ำ
  5 หน่วยแรก   เหมา  100  บาท
  หน่วยถัดไป         9  บาท
  ใช้ 8 หน่วย = 127 บาท
```

The last line updates as the numbers change, so the effect is visible before saving. Water and electricity are separate blocks with their own figures.

Changing a rate shows a quiet note: bills already generated keep their amounts.

**The building's own details** — name, address, phone — sit at the top, with a live preview of the invoice header they produce. Only the name is required; a blank address prints as a blank rather than a placeholder.

**Fee types** are a list with add, rename, reprice, and a ใช้งาน toggle. Retiring rather than deleting, because old bills reference them. The form should hint at bilingual naming: `ค่าส่วนกลาง Facility fee`.

**Backups** show the date of the last copy, how many exist, and a สำรองข้อมูลเดี๋ยวนี้ button. Copies happen automatically when the server starts; without this block there is no way to know that is true.

| Action | Call |
|---|---|
| Rates | `GET /settings`, `PUT /settings` |
| Fee types | `GET`/`POST`/`PUT`/`DELETE /fees/types` |
| Backup list | `GET /backups` |
| Backup now | `POST /backups` |

A note that backups sit on the same machine, and the folder should be copied elsewhere from time to time.

---

### 7. Print layout

Opened from a single bill. Not a nav page.

`GET /bills/:id` already returns everything needed — tenant name, phone, address, room, period, and the itemised lines with their working. The layout is a print stylesheet over that data.

Labels are already bilingual and frozen into the record, so nothing is translated at print time.

---

**A bill is checked against a fresh preview whenever it is opened.** Call `GET /bills/:id` and `GET /bills/preview/:leaseId/:period` together and compare.

**Compare the line items, not the total.** Two mistakes can cancel out — a meter corrected downwards by 450 and a repair added for 450 leave the total identical while both lines are wrong. Comparing totals alone reports "nothing changed" on a bill that is wrong twice over.

When the items differ, show a banner saying the data changed after this bill was made, with a link to see exactly which lines moved. Offer two choices: keep the bill as issued, or regenerate.

**Correcting a bill is: fix the data, then regenerate.** In that order. Deleting first and fixing afterwards means an abandoned correction leaves no bill at all. So editing a reading or adding a charge is allowed at any time, the old bill stays intact and stale, and one confirmed action deletes and recreates it.

A regenerated bill has a new id. If the old one was already printed and handed over, say so — it needs reprinting.

**Editing anything for a month that already has bills shows the same warning**, wherever it happens. On the meter page: *เดือนนี้ออกบิลไปแล้ว 1 ใบ การแก้นี้จะยังไม่เปลี่ยนบิล*, with a link to it. Same for a one-time charge added from the room page.

## Rules that apply everywhere

**Show the API's error text.** The backend returns sentences meant for a person — `Unit 203 is already rented to สมชาย (ถึง 2026-09-15)`. Passing them through beats inventing generic wording.

**A refused delete is not a failure.** A tenant with leases cannot be deleted by design. Present the reason and the alternative.

**One API base URL, in one constant.** Wrapping in Electron later should be a one-line change.

**Periods are `'2026-09'` in every request.** Display formatting is separate; a Buddhist year is a display function.

**Money is right-aligned with thousands separators, two decimals, tabular figures.**

---

## Build order

1. **ห้องพัก + ห้อง** — the board and the room page. Together they exercise the grid, forms, API calls, and error handling, and are useful on their own.
2. **บันทึกมิเตอร์** — simple rows, but it is the monthly workhorse.
3. **บิล** — the most logic, and best written once the first two have settled the patterns.
4. **ผู้เช่า**, **ตั้งค่า** — small.
5. **Print** — last, once a real bill exists to print.

Building the first item and using it against real data before specifying the rest in more detail will produce better answers than deciding everything now.
