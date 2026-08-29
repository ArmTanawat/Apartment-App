/* Walks the paths from the verification list in the brief. */
import { $, $$, byText, check, click, done, nav, section, select, text, type, body, alerted } from './harness.jsx';

section('board');
check('title', text('h1') === 'ห้องพัก');
check('14 rooms', $$('.room').length === 14);
check('11 occupied cards coloured', $$('.room.occ').length === 11, `${$$('.room.occ').length}`);
check('scheduled move-out dashed', $$('.room.soon').length === 1);
check('legend present', body().includes('มีกำหนดย้ายออก'));
check('filter counts render', $$('.chip').length === 5);

section('filters');
await click(byText('.chip', 'ว่าง'));
check('vacant filter shows 3', $$('.room').length === 3, `saw ${$$('.room').length}`);
await click(byText('.chip', 'กำลังจะว่าง'));
check('leaving filter shows 1', $$('.room').length === 1);
await click(byText('.chip', 'ทั้งหมด'));

section('move a tenant into an empty room, then out again today');
// 104 is vacant in the mock data.
await click(byText('.room', '104'));
check('on room page', text('.roomtitle h1') === '104');
check('shows vacant', text('.tag') === 'ว่าง');
await click(byText('.btn', 'ย้ายเข้า'));
check('move-in modal open', !!$('.modal'));
await select($('.modal select'), '2');
check('picked tenant summary shows', $('.modal .warn').textContent.includes('วิชัย'));
await click(byText('.modal .btn', 'ย้ายเข้า'));
check('modal closed', !$('.modal'));
check('room now occupied', text('.tag') === 'มีผู้เช่า');
check('tenant named', body().includes('วิชัย ทองสุข'));

section('move out with today’s date, room free the same day');
await click(byText('.btn', 'ย้ายออก'));
check('label is ห้องว่างตั้งแต่วันที่', $('.modal').textContent.includes('ห้องว่างตั้งแต่วันที่'));
await click(byText('.modal .btn', 'ว่างวันนี้'));
await click(byText('.modal .btn', 'ย้ายออก'));
check('room vacant immediately', text('.tag') === 'ว่าง', text('.tag'));
check('period tenants still billable', body().includes('ยังต้องออกบิลให้'));
await click(byText('.btn', 'ย้ายเข้า'));
await select($('.modal select'), '2');
await click(byText('.modal .btn', 'ย้ายเข้า'));
check('re-lettable the same day', !$('.modal') && text('.tag') === 'มีผู้เช่า');
// put 103 back to vacant for the rest of the walk
await click(byText('.btn', 'ย้ายออก'));
await click(byText('.modal .btn', 'ว่างวันนี้'));
await click(byText('.modal .btn', 'ย้ายออก'));

section('overlap guard');
await click(byText('.back', 'ห้องพัก'));
await click(byText('.room', '101'));
check('101 occupied', text('.tag') === 'มีผู้เช่า');

section('meter: a reading lower than last month');
await nav('บันทึกมิเตอร์');
check('checklist renders', !!$('.mtable'));
check('progress shown', body().includes('จดแล้ว'));
const wIn = $('[data-w="2"]'), eIn = $('[data-e="2"]');   // room 103, closed at 151 / 702
check('room 103 has inputs', !!wIn && !!eIn);
await type(wIn, '5');
check('water flagged bad', wIn.className.includes('bad'));
const stat = wIn.closest('tr').querySelector('.mstat');
check('says เลขน้อยกว่าเดิม', stat.textContent.includes('เลขน้อยกว่าเดิม'));
check('offers water fix only', stat.textContent.includes('น้ำ') && !stat.textContent.includes('ไฟ'),
  stat.textContent);
await type(eIn, '1');
const stat2 = $('[data-w="2"]').closest('tr').querySelector('.mstat');
check('now offers both, labelled separately',
  stat2.textContent.includes('น้ำ') && stat2.textContent.includes('ไฟ'));
check('two fix rows', $$('.fixrow', stat2).length === 2);

section('rollover uses the meter digit count, not the reading');
await click($$('.fixrow', stat2)[0].querySelectorAll('button')[1]); // น้ำ ครบรอบ
await type($('[data-w="2"]'), '5');
const used = $('[data-w="2"]').closest('tr').querySelector('.munit');
check('wrap counts to the dial capacity, not the digits typed',
  used.textContent.includes('9854'), `saw "${used.textContent}"`);

section('bills: a floor with one room unmetered');
await nav('บิล');
check('bills page', text('h1') === 'บิล');
await click(byText('.floorpicklab button', 'เลือกทั้งชั้น'));
check('previews render', !!$('.pvtable'));
const skips = $$('.pvtable td.bad').map(td => td.textContent);
check('unmetered rooms named as skipped', skips.some(s => s.includes('จดมิเตอร์ไม่ครบ')), skips.join(' | '));
const genBtn = byText('.actions .btn', 'ออกบิล');
check('generate enabled', !genBtn.disabled);
await click(genBtn);
check('result shows both sides', body().includes('ออกบิลแล้ว') && body().includes('ข้าม'));
check('skipped rooms named', $('.result .skip') && $('.result .skip').textContent.includes('ห้อง'));

section('open a saved bill');
await click($('.blist tbody tr'));
check('invoice renders', !!$('.paper'));
check('bilingual labels', body().includes('ค่าเช่า Rent') && body().includes('ค่าน้ำ Water'));
check('total line', body().includes('รวมทั้งสิ้น Total'));
await click(byText('.btn', 'พิมพ์'));

section('staleness: change the meter under a saved bill');
await nav('บันทึกมิเตอร์');
await type($('[data-w="1"]'), '200');
await nav('บิล');
await click($('.blist tbody tr'));
check('staleness banner', !!$('.stale'), body().slice(0, 200));
check('names the changed line', $('.stale').textContent.includes('ค่าน้ำ Water'));
check('offers regenerate', !!byText('.stale .btn', 'ออกบิลใหม่'));
await click(byText('.stale .btn', 'ออกบิลใหม่'));
check('regenerated, banner gone', !$('.stale'));

section('print a whole month');
await nav('บิล');
await click(byText('.btn', 'พิมพ์ทั้งเดือน'));
check('one paper per bill', $$('.paper').length >= 2, `${$$('.paper').length} papers`);
check('print-all header', body().includes('หนึ่งใบต่อหนึ่งหน้า'));

section('tenants');
await nav('ผู้เช่า');
check('table renders', !!$('.ttable'));
check('missing data flagged', $$('.tmiss').length > 0);
await type($('.search input'), 'วิชัย');
check('search filters', $$('.ttable tbody tr').length === 1, `${$$('.ttable tbody tr').length} rows`);
check('search box keeps its text', $('.search input').value === 'วิชัย');
await type($('.search input'), '');
await click($('.ttable tbody tr'));
check('tenant page', !!byText('.card h2', 'ข้อมูลสำหรับใบแจ้งหนี้'));

section('settings');
await nav('ตั้งค่า');
check('settings page', text('h1') === 'ตั้งค่า');
check('worked example', body().includes('ลองคำนวณ'));
const rate = $('.setcard .rateline input.num');
await type(rate, '7');
check('example recalculates', !!$('.example b'));
check('rate box keeps its text', rate.value === '7');
await type(rate, '5');
check('fee types listed', $$('.ftable tbody tr').length === 3);
check('backups listed', body().includes('สำรองข้อมูล'));
await click(byText('.btn', 'สำรองข้อมูลเดี๋ยวนี้'));
check('backup added', $$('.bkrow').length === 5);

check('nothing alerted', alerted.length === 0, alerted.join(' | '));
done();
