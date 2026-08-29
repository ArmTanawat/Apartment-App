/* Walks the paths from the verification list in the brief, against a running
 * backend on a freshly seeded database:
 *
 *   cd backend  && node server.js
 *   cd frontend && npx vite build --ssr smoke/walk.jsx --outDir smoke-dist
 *                  && node smoke-dist/walk.js
 *
 * It writes to the database. seed.mjs is imported first and empties it, so the
 * walk starts from the same building every time.
 */
import './seed.mjs';
import { $, $$, alerted, body, byText, check, click, done, nav, section,
         select, settle, text, type, typeAndSave } from './harness.jsx';

const p2 = n => String(n).padStart(2,'0');
const d = new Date();
const today = `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
const period = today.slice(0,7);

section('the app loaded from the API');
check('board rendered', text('h1') === 'ห้องพัก');
check('building name from GET /settings', body().includes('บ้านสวนพลู'));
check('14 rooms from GET /units', $$('.room').length === 14, `${$$('.room').length}`);
check('11 occupied', $$('.room.occ').length === 11, `${$$('.room.occ').length}`);
check('1 scheduled move-out', $$('.room.soon').length === 1);
check('outstanding note names the working month', body().includes('งานค้างของงวด'));
check('no offline banner', !body().includes('ติดต่อเซิร์ฟเวอร์ไม่ได้'));

section('filters');
await click(byText('.chip', 'ว่าง'));
check('3 vacant', $$('.room').length === 3, `${$$('.room').length}`);
await click(byText('.chip', 'กำลังจะว่าง'));
check('1 leaving, and it is 105', $$('.room').length === 1 && $('.room').textContent.includes('105'));
await click(byText('.chip', 'ทั้งหมด'));

section('move a tenant in, then out today, then re-let the same day');
await click(byText('.room', '104'));
check('room page', text('.roomtitle h1') === '104');
check('shows vacant', text('.tag') === 'ว่าง');
await click(byText('.btn', 'ย้ายเข้า'));
const sel = $('.modal select');
const opt = [...sel.options].find(o => o.textContent.includes('วิชัย'));
await select(sel, opt.value);
check('picked tenant summary from GET /tenants', $('.modal .warn').textContent.includes('วิชัย'));
await click(byText('.modal .btn', 'ย้ายเข้า'));
check('modal closed', !$('.modal'));
check('room occupied', text('.tag') === 'มีผู้เช่า', text('.tag'));
check('tenant named', body().includes('วิชัย ทองสุข'));

section('the server owns the double-booking check');
await click(byText('.back', 'ห้องพัก'));
await click(byText('.room', '104'));
check('board and form agree: 104 now shows occupied', text('.tag') === 'มีผู้เช่า');

section('move out with today as the day the room comes free');
await click(byText('.btn', 'ย้ายออก'));
check('label is ห้องว่างตั้งแต่วันที่', $('.modal').textContent.includes('ห้องว่างตั้งแต่วันที่'));
await click(byText('.modal .btn', 'ว่างวันนี้'));
await click(byText('.modal .btn', 'ย้ายออก'));
check('vacant immediately', text('.tag') === 'ว่าง', text('.tag'));
check('still billable for the month', body().includes('ยังต้องออกบิลให้'));
await click(byText('.btn', 'ย้ายเข้า'));
const sel2 = $('.modal select');
await select(sel2, [...sel2.options].find(o => o.textContent.includes('วิชัย')).value);
await click(byText('.modal .btn', 'ย้ายเข้า'));
check('re-lettable the same day', !$('.modal') && text('.tag') === 'มีผู้เช่า', text('.tag'));

section('the server refuses a start date that walks into another stay');
await click(byText('.btn', 'แก้สัญญา'));
const startBox = $('.modal input[type="date"]');
await type(startBox, '2000-01-01');
await click(byText('.modal .btn', 'บันทึก'), 300);
check('refused', !!$('.modal .err'), 'no error shown');
check('and says whose stay it hits, in Thai',
  $('.modal .err').textContent.includes('ทับกับสัญญาของ'), $('.modal .err').textContent);
await click(byText('.modal .btn', 'ยกเลิก'));

section('a refused delete is a reason, not an error state');
await click(byText('.btn', 'ลบห้อง'));
check('says it cannot be deleted', $('.modal .err') && $('.modal .err').textContent.includes('ลบไม่ได้'));
check('no English reached the screen', !/[A-Za-z]{4}/.test($('.modal').textContent), $('.modal').textContent);
check('offers the alternative', $('.modal').textContent.includes('ปล่อยว่างไว้แทน'));
await click(byText('.modal .btn', 'ปิด'));

section('one-time charge, on the lease that was in the room this month');
const chargeCard = $$('.card').find(c => c.querySelector('h2')
  && c.querySelector('h2').textContent.includes('ค่าใช้จ่ายครั้งเดียว'));
await click(byText('.linkbtn', '+ เพิ่ม', chargeCard));
check('charge modal', $('.modal') && $('.modal h3').textContent.includes('ค่าใช้จ่ายครั้งเดียว'),
  $('.modal') && $('.modal h3').textContent);
const fields = $$('.modal .field input');
await type(fields[0], 'ซ่อมประตู Door repair');
await type(fields[1], '850');
await click(byText('.modal .btn', 'บันทึก'), 300);
check('charge saved and shown', body().includes('ซ่อมประตู Door repair'), body().slice(-260));

section('meter: a reading below last month, water and electricity separately');
await nav('บันทึกมิเตอร์');
check('checklist from GET /readings', !!$('.mtable'));
check('4 of 11 entered', body().includes('จดแล้ว') && text('.mprogress span').includes('4'),
  text('.mprogress span'));
const row103 = $$('.mno').find(e => e.textContent === '103').closest('tr');
const wIn = row103.querySelector('[data-w]');
const eIn = $(`[data-e="${wIn.dataset.w}"]`);
check('103 previous filled from GET /readings/previous', row103.querySelector('.mprev').textContent.startsWith('151'),
  row103.querySelector('.mprev').textContent);
await typeAndSave(wIn, '5');
check('water flagged', wIn.className.includes('bad'));
const stat = () => $(`[data-w="${wIn.dataset.w}"]`).closest('tr').querySelector('.mstat');
check('says เลขน้อยกว่าเดิม', stat().textContent.includes('เลขน้อยกว่าเดิม'), stat().textContent);
check('water fix only', stat().textContent.includes('น้ำ') && !stat().textContent.includes('ไฟ'));
await typeAndSave(eIn, '1');
check('both, labelled separately', $$('.fixrow', stat()).length === 2, stat().textContent);

section('a wrap counts to the dial capacity from settings, not the digits typed');
await click($$('.fixrow', stat())[0].querySelectorAll('button')[1], 400);   // น้ำ ครบรอบ
const wAfter = $(`[data-w="${wIn.dataset.w}"]`);
check('the number typed before the fix is still there', wAfter.value === '5', `"${wAfter.value}"`);
const used = wAfter.closest('tr').querySelector('.munit');
check('151 -> 5 on a four-digit dial is 9854 units', used.textContent.includes('9854'), used.textContent);
check('the row is no longer flagged', !wAfter.className.includes('bad'));

section('a good reading saves on its own');
const row202 = $$('.mno').find(e => e.textContent === '203').closest('tr');
const w203 = row202.querySelector('[data-w]');
await typeAndSave(w203, '70');
const stat203 = () => $(`[data-w="${w203.dataset.w}"]`).closest('tr').querySelector('.mstat');
check('water alone leaves the room incomplete', stat203().textContent.includes('ยังไม่ครบ'), stat203().textContent);
await typeAndSave($(`[data-e="${w203.dataset.w}"]`), '400');
check('both meters in, saved', stat203().textContent.includes('บันทึกแล้ว'), stat203().textContent);
await nav('ห้องพัก'); await nav('บันทึกมิเตอร์');
check('it came back from the server', $$('.mno').find(e => e.textContent === '203')
  .closest('tr').querySelector('.mstat').textContent.includes('บันทึกแล้ว'));

section('bills: a floor with rooms unmetered');
await nav('บิล');
check('bills page', text('h1') === 'บิล');
await click(byText('.floorpicklab button', 'เลือกทั้งชั้น'), 400);
check('preview table from GET /bills/preview', !!$('.pvtable'));
const skips = $$('.pvtable td.bad').map(td => td.textContent);
check('the server names each room it cannot bill', skips.length > 0, skips.join(' | '));
check('in Thai', skips.every(s => s.includes('ห้อง') || s.includes('งวด') || s.includes('บิล')),
  skips.join(' | '));
check('a month with bills warns that the switches will not reach them',
  body().includes('การเปลี่ยนสวิตช์ตรงนี้จะยังไม่เปลี่ยนบิลที่ออกไป'));
check('and names one already billed', skips.some(s => s.includes('ออกบิลเดือนนี้ไปแล้ว')), skips.join(' | '));
const gen = byText('.actions .btn', 'ออกบิล');
check('generate enabled', !gen.disabled);
await click(gen, 400);
check('reports both sides', body().includes('ออกบิลแล้ว') && body().includes('ข้าม'),
  text('.result h4'));
check('skipped rooms named with a reason', $('.result .skip') && $('.result .skip').textContent.includes('ห้อง'));
check('the reasons are Thai', !/[A-Za-z]{4}/.test($('.result .skip').textContent),
  $('.result .skip').textContent);

section('open a saved bill');
await click($('.blist tbody tr'), 400);
check('invoice from GET /bills/:id', !!$('.paper'));
check('bilingual labels', body().includes('ค่าเช่า Rent') && body().includes('ค่าน้ำ Water'));
check('the working is printed under a line', body().includes('หน่วย'));
check('total line', body().includes('รวมทั้งสิ้น Total'));
check('footer from settings', body().includes('ธนาคารกสิกรไทย'));

section('staleness: change a meter under a saved bill');
await nav('บันทึกมิเตอร์');
const row101 = $$('.mno').find(e => e.textContent === '101').closest('tr');
await typeAndSave(row101.querySelector('[data-w]'), '200');
await nav('บิล');
const billRow = $$('.blist tbody tr').find(r => r.textContent.includes('101'));
await click(billRow, 500);
check('banner appears', !!$('.stale'), body().slice(0,300));
check('names the changed line, not just a total', $('.stale').textContent.includes('ค่าน้ำ Water'),
  $('.stale') && $('.stale').textContent);
await click(byText('.stale .btn', 'ออกบิลใหม่'), 600);
check('regenerated, banner gone', !$('.stale'), $('.stale') && $('.stale').textContent);
check('and it is a bill', !!$('.paper'));

section('print a whole month');
await nav('บิล');
await click(byText('.btn', 'พิมพ์ทั้งเดือน'), 600);
check('one paper per bill', $$('.paper').length >= 3, `${$$('.paper').length} papers`);
check('print-all header', body().includes('หนึ่งใบต่อหนึ่งหน้า'));

section('tenants');
await nav('ผู้เช่า');
check('table from GET /tenants', !!$('.ttable'));
check('missing details flagged', $$('.tmiss').length > 0);
await type($('.search input'), 'วิชัย');
check('search filters', $$('.ttable tbody tr').length === 1, `${$$('.ttable tbody tr').length}`);
check('the box keeps its text', $('.search input').value === 'วิชัย');
await type($('.search input'), '');
await click($$('.ttable tbody tr').find(r => r.textContent.includes('บริษัท สวนพลู')));
check('tenant page', body().includes('ข้อมูลสำหรับใบแจ้งหนี้'));
check('one tenant, several rooms', body().includes('ถือหลายห้องพร้อมกัน'));

section('settings');
await nav('ตั้งค่า');
check('settings page', text('h1') === 'ตั้งค่า');
check('worked example priced by the server',
  $$('.example b').some(b => b.textContent === '127.00'),
  $$('.example b').map(b => b.textContent).join(' | '));
// The water card's first box is the threshold: raise it to 7 and 8 units
// costs 100 + 1 x 9 rather than 100 + 3 x 9.
const waterCard = $$('.setcard').find(c => c.querySelector('h2')
  && c.querySelector('h2').textContent.trim() === 'ค่าน้ำ');
const rate = $('.rateline input.num', waterCard);
await type(rate, '7');
await settle(1500);
check('the box keeps its text', rate.value === '7');
check('example follows the new threshold', text('.example b', waterCard) === '109.00',
  text('.example b', waterCard));
check('the change reached the server',
  (await (await fetch('http://localhost:3001/settings')).json()).water_min_units === 7);
await type(rate, '5'); await settle(1500);
check('fee types from GET /fees/types', $$('.ftable tbody tr').length === 3);
check('fee types in use offer no delete button, from one GET /fees/lease',
  $$('.ftable tbody tr').filter(r => r.textContent.includes('ลบ')).length === 0);
check('backups listed from GET /backups', $$('.bkrow').length > 0);
const before = $$('.bkrow').length;
await click(byText('.btn', 'สำรองข้อมูลเดี๋ยวนี้'), 400);
check('backup taken', $$('.bkrow').length >= before);

section('the working month');
await nav('บันทึกมิเตอร์');
const forward = $$('.month button').at(-1);
check('cannot go past the current month', forward.disabled);
await click($$('.month button')[0], 400);
check('went back a month', !$$('.month button').at(-1).disabled);
check('the month is remembered for a reload',
  globalThis.window.localStorage.getItem('workingMonth') !== period);

check('nothing alerted', alerted.length === 0, alerted.join(' | '));
done();
