/* The first day of using the program: an empty database, no rooms, no
 * tenants, nothing entered. Every screen has to work before there is any data
 * in it, and the building has to be possible to set up from inside the app.
 *
 * Run against a server started on a database with no rooms in it.
 */
import { $, $$, body, byText, check, click, done, nav, section, select, settle, text, type } from './harness.jsx';

section('the app starts against an empty building');
check('the board renders', text('h1') === 'ห้องพัก');
check('it says there are none rather than showing an empty grid',
  body().includes('ไม่มีห้องในหมวดนี้'), body().slice(0, 200));
check('the counts are zero, not blank', body().includes('มีผู้เช่า') && body().includes('ว่าง'));
check('no crash, no error banner', !body().includes('ติดต่อเซิร์ฟเวอร์ไม่ได้'));
check('the rail shows 0 rooms', $('.brand small').textContent.trim() === '0 ห้อง',
  $('.brand small').textContent);

section('every other screen survives having nothing to show');
await nav('บันทึกมิเตอร์');
check('the meter checklist', body().includes('จดแล้ว') && !!$('.mtable'));
check('and does not divide by zero', body().includes('100%'), text('.mprogress'));
await nav('บิล');
check('the bills page', text('h1') === 'บิล');
check('with nothing selectable', body().includes('ยังไม่ได้เลือกห้อง'));
check('and generate disabled', byText('.actions .btn', 'ออกบิล').disabled);
await nav('ผู้เช่า');
check('the tenant list', body().includes('ไม่พบผู้เช่า'));
await nav('ตั้งค่า');
check('settings', text('h1') === 'ตั้งค่า');
check('with the three fee types db.js seeds', $$('.ftable tbody tr').length === 3);
check('and the worked example still prices', $$('.example b').some(b => b.textContent !== '—'),
  $$('.example b').map(b => b.textContent).join(' | '));

section('setting the building up from inside the app');
await nav('ห้องพัก');
await click($('#pencil') || $('.iconbtn'));
check('the pencil reveals a way to add a floor', !!byText('.btn', 'เพิ่มชั้น'));
await click(byText('.btn', 'เพิ่มชั้น'));
check('the dialog defaults to floor 1', $$('.modal input')[1].value === '1',
  $$('.modal input')[1].value);
await type($$('.modal input')[0], '101');
await type($$('.modal input')[2], '3500');
await click(byText('.modal .btn', 'เพิ่มห้อง'), 300);
check('the first room exists', $$('.room').length === 1, `${$$('.room').length}`);
check('and the rail counted it', $('.brand small').textContent.trim() === '1 ห้อง');
check('it is vacant', $$('.room.occ').length === 0);

await click(byText('.room', '101'));
await click(byText('.btn', 'ย้ายเข้า'));
check('with no tenants yet, only the new-tenant option is useful',
  [...$('.modal select').options].length === 2,
  [...$('.modal select').options].map(o => o.textContent).join(' | '));
await select($('.modal select'), 'new');
check('the new-tenant fields appear', !!byText('.modal label', 'ชื่อ — นามสกุล'));
const fields = $$('.modal .field input');
await type(fields[0], 'สมชาย ใจดี');
await type(fields[1], '081-000-0000');
await type(fields[2], '1 ถ.ทดสอบ');
await click(byText('.modal .btn', 'ย้ายเข้า'), 300);
check('moved in', text('.tag') === 'มีผู้เช่า', text('.tag'));
check('and the tenant was created along the way', body().includes('สมชาย ใจดี'));
await nav('ผู้เช่า');
check('who now appears on the tenant list', body().includes('สมชาย ใจดี'));

section('the first meter reading has no previous month to draw on');
await nav('บันทึกมิเตอร์');
const w = $('[data-w]');
check('the previous figure falls back to 0 rather than being blank',
  w.closest('tr').querySelector('.mprev').textContent.startsWith('0'),
  w.closest('tr').querySelector('.mprev').textContent);
await type(w, '25', 600);
await type($(`[data-e="${w.dataset.w}"]`), '80', 600);
check('saved', w.closest('tr').querySelector('.mstat').textContent.includes('บันทึกแล้ว'),
  w.closest('tr').querySelector('.mstat').textContent);

section('the first bill');
await nav('บิล');
await click(byText('.floorpicklab button', 'เลือกทั้งชั้น'), 400);
check('the room previews', !!$('.pvtable') && !$('.pvtable td.bad'),
  $('.pvtable') && $('.pvtable').textContent);
await click(byText('.actions .btn', 'ออกบิล'), 400);
check('one bill made, none skipped', body().includes('ออกบิลแล้ว 1 ใบ') && !body().includes('ข้าม'),
  text('.result h4'));
await click($('.blist tbody tr'), 300);
check('and it prints', !!$('.paper') && body().includes('รวมทั้งสิ้น Total'));
check('with the building name from settings, not a blank header',
  $('.phead h2').textContent.trim().length > 0, $('.phead h2').textContent);

done();
