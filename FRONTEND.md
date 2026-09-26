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

Black and white carries the interface. Colour carries one question and nothing else is coloured.

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FCFCFC` | Page background |
| `--surface` | `#FFFFFF` | Cards, panels |
| `--ink` | `#1A1A1A` | Text, buttons, active nav |
| `--muted` | `#8C8C8C` | Secondary text, the status note |
| `--line` | `#E4E4E4` | Borders, dividers |
| `--occupied` | `#2E7D46` | Room has a tenant |
| `--vacant` | `#B3382C` | Room is empty |
| `--reserved` | `#C9A227` | Empty room somebody has asked for — จองแล้ว |
| `--locked` | `#1A1A1A` | Empty room that cannot be re-let yet — ล็อค |
| `--attention` | `#C9A227` | Border of the banner saying a saved bill no longer matches its data |
| `--attention-soft` | `#FFF8E6` | That banner's background |

The last two are not a room state at all. The banner they belong to is about a
bill that was issued before its data changed — it has to be noticed, and it says
nothing about whether anyone is living anywhere. It appears at most a few times
a month. `--reserved` happens to be the same yellow as `--attention`; that is a
coincidence of palette, not a shared meaning, and they are separate tokens so
either can move without dragging the other.

Earlier drafts gave three separate meanings to colour — occupied, vacant, and not-yet-metered — and the board became a code to decode rather than a thing to read. Colour answers one question only, and the four room colours are four answers to it rather than four questions: **can somebody be put in this room today.** Green, no — somebody lives here. Red, yes. Amber, no — it is promised to somebody. Black, no — the last tenant left without notice and the room cannot legally be re-let yet.

The two extra answers are the landlord's own note, set from the board and stored on the room. No rule reads them: a marked room is still vacant to `/units/vacant`, still billable, and can still be moved into — moving somebody in simply clears the note. Anything that made them a rule would be a second definition of "empty" sitting beside the one the lease dates give, which is the mistake `CLAUDE.md` spends four paragraphs on.

Red for vacant is deliberate. In a booking system green would mean available, but the reader here is the owner, and an empty room is lost income. It also puts the loudest colour on exactly what the owner is scanning for.

Colour is never the only signal. Every empty card says its state in words — ว่าง, จองแล้ว, ล็อค — so red-green colour blindness costs nothing, and black against red is not a distinction anybody should have to make by eye.

The widget that sets the note is two dots in the corner of an empty card, filled when on. They stop the click from reaching the card, so pressing a dot changes the colour and pressing anywhere else opens the room. They are only on empty cards, because neither note means anything about a room somebody is living in.

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

**← → step to the room beside this one.** In `.pagebar` beside the back button, stuck to the top of the window so it is still reachable from the bottom of a page three screens tall. The order is the board's — floor, then room number — and both ends disable rather than wrap. บิล and ใบเสร็จ carry the same pair, stepping through the month's bills in the order บิลเดือนนี้ lists them; ใบเสร็จ steps only through bills that have a receipt.

**Moving in is rejected when the dates overlap an existing lease.** The API returns the current tenant's name and the date they leave. Show that sentence.

**เพิ่มผู้เช่าใหม่ is the first line of the tenant list, above every name.** Filling a building is one room at a time and most ย้ายเข้า are somebody's first, so the line wanted most often must not be the one that gets further to scroll to as the list grows. The names that follow sit under a heading of their own.

**The new-tenant form here is the whole tenant record,** the same `TenantExtra` block เพิ่มผู้เช่า uses. Somebody registered while moving in is not a thinner record than somebody added from the ผู้เช่า page.

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

**ออกใบเสร็จทุกห้อง sits beside พิมพ์ทั้งหมด,** and goes when there is nothing left to issue. It asks the same question the single dialog asks — has this tenant paid — once, for the month, and says so in words: pressing it asserts every room on the list has paid, and a room that has not should be issued on its own. Before the press it prints the count and the total, so the button can be checked against the money counted, and it names any room whose bill has been overtaken since it was made. A bill that already has a receipt is skipped, never given a second one.

**บิลเดือนนี้ and ใบเสร็จเดือนนี้ fold away.** Open when the screen arrives, so a small building never meets this; forty rooms puts eighty rows between the generate card and the bottom of the page, and most visits are about one of the two. A folded card keeps its summary on the heading line — `4 ใบ · 21,882.00` — because the count and the total are most of what the scroll was for. Which is folded survives leaving the screen and coming back, like every other per-screen switch.

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

**Two cards: what prints, and what is kept.** วันออกบัตร, วันหมดอายุบัตร, ไอดีไลน์, เลขทะเบียนรถ and หมายเหตุ reach no invoice, no receipt and no report, so they are read back under a `เก็บไว้ดูเอง` heading of their own rather than as more rows under a heading that promises what an invoice carries. Both cards edit through the same dialog.

**A name another tenant already has is refused,** on เพิ่มผู้เช่า and on แก้ไข alike — `tenants.full_name` is not `UNIQUE` in the schema, because two people really can share a name, so this warning is the screen's. Blocking it only on the add form left the same clash one rename away.

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

### 8. รายงาน — the three reports

Chips choose which one. All three print as the same paper an invoice does, with the building's header at the top and everything else marked `.noprint`.

| Report | Frame | Built from |
|---|---|---|
| สรุปยอดรวมประจำเดือน | the working month | `GET /bills?period=` |
| รายงานมิเตอร์ | the working month | `GET /readings?period=` |
| รายงานมิเตอร์รายปี | its own year | `GET /readings/year/:year` |

**The yearly report has its own frame, and its own picker.** It is not the working month widened — that month belongs to บันทึกมิเตอร์ and บิล, and moving one would move the other. The month picker is swapped for a year picker while this report is showing, built from the same markup so it is not a second thing to learn, and capped forward at the current year for the reason the month picker caps at the current month.

**One room is two rows, น้ำ above ไฟ, and twelve columns ม.ค. to ธ.ค.** Every room appears and every cell holds a number. A month nobody read is `0`, never blank: the report is a grid to run an eye down, and a gap reads as "look into this" when the answer is that nothing was recorded. The rule under a room goes below the pair, not between its two halves.

**Pressing a row opens that room's year as two charts** — an area under a line, water in pastel blue and electricity in pastel orange. The table answers "what did 203 use in March"; the shape across twelve months is what shows a leak, or a meter that stopped, and that is what a row of figures is worst at.

The two meters get a chart each rather than sharing one, because a room using 18 units of water against 146 of electricity flattens the water line to nothing on a shared axis — and the water line is exactly what somebody is looking at when they wonder whether a tap is running. Each chart names its own peak, so the scale is never guessed at. The charts are hand-drawn SVG: twelve points and one shape, where a charting library would be the largest dependency in the app.

---

## Rules that apply everywhere

**Show the API's error text.** The backend returns sentences meant for a person — `Unit 203 is already rented to สมชาย (ถึง 2026-09-15)`. Passing them through beats inventing generic wording.

**A refused delete is not a failure.** A tenant with leases cannot be deleted by design. Present the reason and the alternative.

**One API base URL, in one constant.** Wrapping in Electron later should be a one-line change.

**Periods are `'2026-09'` in every request.** Display formatting is separate; a Buddhist year is a display function.

**Money is right-aligned with thousands separators, two decimals, tabular figures.**

**The printed sheet has a margin, and a bill may run onto a second.** 12mm of page margin plus 6mm/8mm of padding inside the paper — the first is the real page margin and reaches a second sheet, the second is inside the document and cannot be overridden from the Print dialog. A bill that does not fit runs on rather than being squeezed, but a break may not land inside a line item, between รวมทั้งสิ้น and the line above it, or inside the signature block; the column headings repeat on the continued page. About two more fee lines fit on a sheet before that happens.

**The typefaces are files in this project, never fetched.** Noto Sans Thai and Roboto Mono live in `frontend/public/fonts/` and are declared in `src/styles/fonts.css`. They used to come from Google Fonts, which made an offline program depend on the internet for how it looks — and it failed weeks in rather than at once, because Google's stylesheet expires long before its font files do. The fallback is a different width, so the printed bill moves with it. `npm test` runs `check-fonts` to keep it that way.

**Dates are stored `'2026-09-15'` and shown `15/09/2026`.** A date is never typed into a bare `<input type="date">`: that box takes its format from the browser's locale and reads `mm/dd/yyyy` on an English machine, where `05/06` is a date either way round and nothing on the screen says which. `DateField` shows and accepts วัน/เดือน/ปี and opens the same native calendar from the button beside it. Nothing about what is sent changes.

---

## Screen behaviour rules

These were decided in advance because the backend already behaves this way. Each one records a real bug or a real decision; they are binding, not suggestions.

**Warn before editing a month that is already billed.** Changing a recurring fee, a one-time charge, or a meter reading affects only bills generated afterwards. A bill already saved keeps its own stored line items and does not change — which is correct, because it records what was actually charged.

So when the user edits anything for a period that already has a bill, say so plainly: "A bill for September already exists. This change will apply from next month." Offer to delete and regenerate the bill if the correction should apply to that month. Never silently leave the user thinking a fix took effect on a bill that it did not touch.

**Cancelling a recurring fee is a delete, not a flag.** `DELETE /fees/lease/:id` stops future charges. Past bills keep showing the fee because the tenant did pay it then. The UI should not present this as "the fee never existed" — it stops from now on.

**Use the preview endpoint before saving.** `GET /bills/preview/:leaseId/:period` returns the same figures `POST /bills` would store, without writing anything. Show it, let the user confirm, then post.

**The readings screen is a checklist.** `GET /readings?period=YYYY-MM` returns every room, with nulls for rooms not yet entered. Render those as empty inputs; the filled ones are already done. Call `GET /readings/previous/...` to prefill the previous-reading boxes so only one number is typed per utility.

**The batch billing screen reports partial success.** Selecting twenty rooms may produce eighteen bills and two failures. Show both: the count generated, and each failed room with its reason ("no meter reading for September", "already billed"). Do not show a plain success message when some rooms were skipped.

**Room selection offers three routes to the same list.** A range (101 to 109), a tick list, or select all. The range is a filter over the room list on the client — the API takes an explicit array of rooms either way.

**API base URL lives in one constant.** Everything goes through it, so wrapping the app in Electron later is a one-line change.

**Bills are bilingual, and the wording is frozen at generation.** System labels are Thai then English — `ค่าเช่า Rent`, `ค่าน้ำ Water`, `ค่าไฟ Electricity`. The working in `detail` is Thai only, because a bilingual version of every line would double the bill's length for no gain. Fee names come from `fee_types.name` and `one_time_charges.description`, typed by the user, so seeded fee types are written bilingually as the example to follow.

These strings land in `bill_items` and are never touched again. Editing a label later does not change a bill already generated — which is correct, and also means getting the wording right matters more than it looks.

**The total in Thai words is display only.** `bahtText()` derives it from the number already on the document. Storing it would give one piece of paper two places to disagree with itself, and a rounding fix would then have to be applied twice. The rules it exists for — สิบ not หนึ่งสิบ, ยี่สิบ not สองสิบ, a trailing 1 becoming เอ็ด once anything precedes it, across group boundaries as well as inside one — have a test table in `frontend/smoke/text.mjs`. Change the table before the function.

**The meter figures on a printed line are read out of the stored working, not out of the reading.** `meterFields()` lifts previous, current and units used out of `bill_items.detail` so they can be printed as labelled fields. Taking them from `meter_readings` instead would print today's numbers on an old bill the moment a reading was corrected — the same mistake as recomputing an amount. Anything that does not parse falls back to printing the sentence as it always was, which is what keeps bills issued before this existed readable.

**The sentence itself is not printed under the line.** `ก่อนหน้า`, `ปัจจุบัน` and `ใช้ไป` are what a tenant reads to see whether a charge is theirs; `38 หน่วย — 100 บาท สำหรับ 5 หน่วยแรก แล้ว 33 × 9` beneath them restates the price list in the one place nobody checks a rate, and two of them on a sheet is most of what made a bill look busy. The parse-failure fallback above is the exception, and only because it is the sole way those figures reach the page at all.

**The building's own lines print black.** Its address and phone in the header, and everything in the footer — how to pay, the standing note, a receipt's note. Grey is a screen convention for what may be skimmed past, and this is a page that goes through a home printer and gets folded into a pocket. The tenant block's labels and the column headings stay grey: they label the page rather than say anything.

**Label the move-out date for what it is.** Not วันย้ายออก, which is ambiguous about whether the room is free that day, but ห้องว่างตั้งแต่วันที่. The stored value is the day the room becomes available, and the label should say so rather than leaving the user to guess. Offer ว่างวันนี้ and สิ้นเดือนนี้ as shortcuts, since those are almost every case.

**A scheduled move-out must be visible.** `GET /units` returns `leaving_on` and `is_leaving` for a room whose tenant has a future end date. The room is still occupied, but it is about to come free, and a landlord looking for something to rent needs to see that. Show the date on the card and offer a กำลังจะว่าง filter.

**Cancelling a scheduled move-out sends `end_date: null` explicitly.** `PUT /leases/:id` checks for the key with `in` rather than `??`, so a null clears it. Omitting the key keeps the existing date. Anywhere else that uses `??` for partial updates, clearing is not possible — check before assuming a field can be blanked.

**Meter readings are editable from two places.** The บันทึกมิเตอร์ page for the monthly walk-through, and the room page for fixing one room on its own. Both call the same `POST /readings` and `PUT /readings/:id`. Duplicating the entry point is worth it — going to a list of sixteen rooms to correct the one already open is friction for no reason.

**A departed tenant is still reachable for the billing month.** The room page scopes fees and charges to every lease that occupied the room during the period, not to the lease active today. A tenant who left on the 10th still gets a bill for that month, and a repair found afterwards is theirs — so the charge form has to reach their lease. Filtering by `activeLease` alone silently makes that impossible.

**A reading below last month has three possible causes and they bill differently.** A typo, a replaced meter, or a dial that wrapped past its last digit. The API refuses the reading rather than guessing, and the screen asks which it was.

A replaced meter starts at zero, so the previous reading is set to 0 and usage is just the new number. A wrapped dial keeps counting from where it was, so `water_rollover` / `elec_rollover` holds the meter's capacity and usage is `(curr + rollover) - prev`. For 9995 → 12 on a four-digit meter that is 17 units; treating it as a replacement would bill 12 and lose 5.

**A reading may hold a previous figure with no current one.** `water_curr` and `elec_curr` are nullable. That is the state left after the previous figure was corrected upward and the meter has to be read again — refusing the correction until the current number is inflated first is backwards.

A row in that state counts as not entered on the checklist, produces no usage, and is skipped when the next month looks for its previous reading. `is_entered` therefore means both current numbers are present, not merely that a row exists.

**Save each meter on its own.** A water figure that is wrong must not discard an electricity figure typed correctly beside it. Returning early from a save because one of them failed loses the other, and the loss is invisible until the screen redraws.

**Water and electricity are corrected separately.** Both can be below last month at once, and a rollover or a replacement applies to one meter, not the room. Any fix offered for a low reading has to name which meter it acts on.

**One working month, shared by every page that has one.** บันทึกมิเตอร์ and บิล both act on it, and changing it on one changes it on the other. It starts at the current month.

**The board has no month picker.** It shows who is in which room *today* — occupancy, move-in, move-out are all live facts, and a board showing August would make its own buttons meaningless. It does use the working month for one thing: the note saying what is still outstanding. The page says which of the two each figure refers to, because mixing them silently is how a reader ends up trusting the wrong number.

**The working month never goes past the current one.** Nothing can be read or billed for a month that has not happened, and a reading typed into next month is a data error that surfaces weeks later. Going back is unlimited.

**The board must agree with what the forms allow.** If a room shows vacant, moving someone in must succeed. Any date rule used to colour a card has to be the same rule the form validates against.

---

## Build order

1. **ห้องพัก + ห้อง** — the board and the room page. Together they exercise the grid, forms, API calls, and error handling, and are useful on their own.
2. **บันทึกมิเตอร์** — simple rows, but it is the monthly workhorse.
3. **บิล** — the most logic, and best written once the first two have settled the patterns.
4. **ผู้เช่า**, **ตั้งค่า** — small.
5. **Print** — last, once a real bill exists to print.

Building the first item and using it against real data before specifying the rest in more detail will produce better answers than deciding everything now.
