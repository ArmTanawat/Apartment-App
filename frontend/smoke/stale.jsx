/* What the screens do when the data changes underneath them.
 *
 * The app is single-user and local, so this is not a race between people. It
 * is a second window, a database restored from a backup, or a reseed — and
 * the screen is then holding ids the server no longer has. Every dialog looks
 * its subject up by id and reads fields off it, so the question is whether
 * that says something or throws.
 *
 *   npm run smoke:stale
 */
import { API } from './api-base.mjs';
import './seed.mjs';
import { $, $$, byText, check, click, done, nav, section, text, type } from './harness.jsx';

const api = async (m, p, b) => {
  const r = await fetch(API + p,
    { method: m, headers: {'Content-Type':'application/json'}, body: b ? JSON.stringify(b) : undefined });
  return r.status === 204 ? null : r.json();
};
const room = async n => { await nav('ห้องพัก'); await click(byText('.room', n)); };

section('a charge on a lease that has since been deleted elsewhere');
await room('103');
const u103 = (await api('GET','/units')).find(u => u.unit_number === '103');
await api('DELETE', `/leases/${u103.lease_id}`);

const card = $$('.card').find(c => c.querySelector('h2')
  && c.querySelector('h2').textContent.includes('ค่าใช้จ่ายครั้งเดียว'));
await click($$('.linkbtn', card).find(b => b.textContent === '+ เพิ่ม'));
check('the dialog still opens from the stale screen', !!$('.modal'));
const f = $$('.modal .field input');
await type(f[0], 'ซ่อมประตู Door repair');
await type(f[1], '850');
await click(byText('.modal .btn', 'บันทึก'), 400);

check('it does not crash', !!$('.modal'), 'the dialog went away');
check('it says the data is gone rather than "ไม่พบสัญญาเช่านี้"',
  $('.modal h3').textContent === 'ข้อมูลนี้ไม่มีอยู่แล้ว', $('.modal h3').textContent);
check('and says the screen has caught up',
  $('.modal .lead').textContent.includes('ดึงข้อมูลล่าสุดมาให้แล้ว'));
check('the page behind it corrected itself', text('.tag') === 'ว่าง', text('.tag'));
check('and no longer offers the charge', !$$('.card').find(c => c.querySelector('h2')
  && c.querySelector('h2').textContent.includes('ค่าใช้จ่ายครั้งเดียว'))
  .querySelector('.linkbtn'));
await click(byText('.modal .btn', 'ปิด'));
check('the charge was not written', (await api('GET','/fees/onetime/' + u103.lease_id)).length === 0);

section('a dialog opened on a room that has since gone');
// 104 is vacant in the seeded building and has never been let, so the server
// will delete it.
await room('104');
const u104 = (await api('GET','/units')).find(u => u.unit_number === '104');
await click(byText('.linkbtn', 'แก้ไข'));
check('the edit dialog is open', $('.modal h3').textContent === 'แก้ไขข้อมูลห้อง',
  $('.modal h3').textContent);
await api('DELETE', `/units/${u104.id}`);
await type($('.modal input'), '998');
await click(byText('.modal .btn', 'บันทึก'), 400);
check('it does not crash', !!$('.modal'));
check('it says the room is gone', $('.modal h3').textContent === 'ข้อมูลนี้ไม่มีอยู่แล้ว',
  $('.modal h3').textContent);
await click(byText('.modal .btn', 'ปิด'), 300);

section('a refusal that is a rule, not staleness, is unchanged');
await room('101');
await click(byText('.btn', 'แก้สัญญา'));
await click(byText('.modal .btn', 'ลบสัญญานี้'));
check('still the real reason, not a "gone" card',
  $('.modal .err') && $('.modal .err').textContent.includes('มีบิลอยู่'),
  $('.modal h3').textContent);
await click(byText('.modal .btn', 'ปิด'));

done();
