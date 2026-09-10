/* The parts of the screens the main walk goes past rather than through:
 * the filter counts, the month picker's limits, room selection on บิล, the
 * print structure, and the invoice previews on ตั้งค่า.
 */
import './seed.mjs';
import { $, $$, body, byText, check, click, done, nav, section, settle, text, type } from './harness.jsx';

const p2 = n => String(n).padStart(2,'0');
const d = new Date();
const period = `${d.getFullYear()}-${p2(d.getMonth()+1)}`;
const THAI = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

section('ห้องพัก — the chip counts have to match what the chips then show');
for(const label of ['ว่าง','ยังไม่จดมิเตอร์','ยังไม่ออกบิล','กำลังจะว่าง','ทั้งหมด']){
  const chip = byText('.chip', label);
  const claimed = Number(chip.querySelector('.n').textContent);
  await click(chip);
  const shown = $$('.room').length;
  check(`"${label}" says ${claimed} and shows ${shown}`, claimed === shown);
}
// Colour answers one question — can somebody be put in this room today — and
// these are the only four answers. res and lock are the landlord's own note on
// an empty room; nothing else may colour a card.
check('colour is only ever one of the four states',
  $$('.room').every(r => r.className.split(' ').every(c =>
    ['room','occ','soon','res','lock'].includes(c))),
  $$('.room').map(r => r.className).find(c => !/^room( occ)?( soon)?( res)?( lock)?$/.test(c)));
check('an occupied card is never marked',
  !$$('.room.occ').some(r => /\b(res|lock)\b/.test(r.className)));
check('every empty card says its state in words too, not only in colour',
  $$('.room:not(.occ)').every(r => /ว่าง|จองแล้ว|ล็อค/.test(r.textContent)),
  $$('.room:not(.occ)').map(r => r.textContent).find(t => !/ว่าง|จองแล้ว|ล็อค/.test(t)));

section('ห้องพัก — the two notes an empty room can carry');
await nav('ห้องพัก');
await click(byText('.chip', 'ทั้งหมด'));
{
  const empty = $$('.room:not(.occ)')[0];
  const no = empty.querySelector('.rno').textContent;
  check('an empty card carries the widget', !!empty.querySelector('.rmark .mk.res'));
  check('and an occupied one does not',
    !$$('.room.occ')[0].querySelector('.rmark'));

  await click(empty.querySelector('.mk.res'), 500);
  const after = byText('.room', no);
  check('pressing จอง colours the card and does not open the room',
    after.className.includes('res') && !!$('.grid'), after.className);
  check('and the card says จองแล้ว', after.textContent.includes('จองแล้ว'));

  await click(byText('.room', no).querySelector('.mk.lock'), 500);
  const locked = byText('.room', no);
  check('pressing ล็อค replaces จอง rather than adding to it',
    locked.className.includes('lock') && !locked.className.includes('res'), locked.className);

  await click(byText('.room', no).querySelector('.mk.lock'), 500);
  const cleared = byText('.room', no);
  check('pressing it again clears the note',
    !/\b(res|lock)\b/.test(cleared.className) && cleared.textContent.includes('ว่าง'),
    cleared.className);

  await click(byText('.room', no), 500);
  check('the card still opens the room when pressed anywhere else',
    body().includes('ผู้เช่าปัจจุบัน'), body().slice(0, 80));
  await nav('ห้องพัก');
}

section('ผู้เช่า — same question of its own chips');
await nav('ผู้เช่า');
for(const label of ['อยู่ปัจจุบัน','ย้ายออกแล้ว','ข้อมูลไม่ครบ','ทั้งหมด']){
  const chip = byText('.chip', label);
  const claimed = Number(chip.querySelector('.n').textContent);
  await click(chip);
  const rows = $$('.ttable tbody tr').filter(r => !r.textContent.includes('ไม่พบผู้เช่า')).length;
  check(`"${label}" says ${claimed} and lists ${rows}`, claimed === rows);
}

section('the working month is one month, shared, and capped at today');
await nav('บันทึกมิเตอร์');
check('it opens on the current month', text('.monthlabel').includes(THAI[d.getMonth()]),
  text('.monthlabel'));
check('forward is disabled', $$('.month button').at(-1).disabled);
await click($('.monthlabel'));
check('the picker lists eighteen months back', $$('.monthopt').length === 18,
  `${$$('.monthopt').length}`);
check('and marks which one is this month', $$('.monthopt .now').length === 1);
await click($$('.monthopt')[3]);
const chosen = text('.monthlabel');
check('picking one closes the list', !$('.monthmenu'));
await nav('บิล');
check('บิล is on the same month', text('.monthlabel') === chosen, `${text('.monthlabel')} vs ${chosen}`);
await nav('ห้องพัก');
check('the board says which month its outstanding note is about',
  body().includes('งานค้างของงวด') && body().includes(chosen.split(' ')[0]));
check('and offers a way back to the current month', !!byText('.linkbtn', 'กลับมาเดือนปัจจุบัน'));
check('the month survived being carried between pages',
  globalThis.window.localStorage.getItem('workingMonth') !== period);
await click(byText('.linkbtn', 'กลับมาเดือนปัจจุบัน'), 400);
check('and going back works', globalThis.window.localStorage.getItem('workingMonth') === period);

section('บิล — the three ways of choosing rooms all produce the same kind of list');
await nav('บิล');
const picked = () => $$('.pick.on').length;
await click(byText('.btn', 'เลือกทั้งหมด'), 400);
const all = picked();
check('เลือกทั้งหมด picks every room that has a tenant this month', all > 0 && all === $$('.pick:not(.gone)').length,
  `${all} of ${$$('.pick:not(.gone)').length}`);
await click(byText('.btn', 'ล้าง'), 200);
check('ล้าง clears it', picked() === 0);
const [from, to] = $$('.rangebar input');
await type(from, '101'); await type(to, '107');
await click(byText('.rangebar .btn', 'เลือก'), 400);
const inRange = $$('.pick.on').map(b => b.querySelector('.rn').textContent);
check('a range picks only rooms inside it', inRange.every(n => n >= '101' && n <= '107'),
  inRange.join(','));
check('and it is a subset of select-all', inRange.length > 0 && inRange.length <= all);
await click(byText('.btn', 'เฉพาะที่ยังไม่ออก'), 400);
const pending = $$('.pick.on').map(b => b.querySelector('.rn').textContent);
check('เฉพาะที่ยังไม่ออก leaves out rooms already billed',
  pending.every(n => !$$('.pick.on').find(b => b.querySelector('.rn').textContent === n)
    .textContent.includes('✓')), pending.join(','));
// classList, not className.includes: "pick gone" contains "on" inside "gone",
// which is the test failing rather than the page.
const goneRooms = $$('.pick.gone');
check('there are rooms with no tenant this month to test against', goneRooms.length > 0,
  `${goneRooms.length}`);
check('none of them is picked', goneRooms.every(b => !b.classList.contains('on')),
  goneRooms.map(b => b.className).join(' | '));
await click(goneRooms[0], 200);
check('and clicking one does nothing', !goneRooms[0].classList.contains('on'));
await click(byText('.btn', 'ล้าง'), 200);

section('printing — one invoice per sheet, and the chrome kept off the paper');
await click(byText('.btn', 'พิมพ์ทั้งเดือน'), 600);
const papers = $$('.paper');
check('one .paper per bill', papers.length >= 2, `${papers.length}`);
check('they are siblings inside .papers, which is what the page break keys on',
  papers.every(p => p.parentElement.className === 'papers'));
check('everything that is not the invoice is marked .noprint',
  !!$('.noprint') && $('.noprint').contains(byText('.head h1', 'พิมพ์ทั้งเดือน')));
check('each invoice carries its own total', papers.every(p => p.textContent.includes('รวมทั้งสิ้น Total')));
check('and its own tenant and room', papers.every(p => p.querySelector('.pto dd').textContent.trim().length > 0));

section('ตั้งค่า — the invoice preview has to match the invoice');
await nav('บิล');
await click($('.blist tbody tr'), 400);
const paperHeader = $('.phead h2').textContent.trim();
const paperFoot = $('.pfoot').textContent.replace(/\s+/g,' ');
await nav('ตั้งค่า');
const preview = $$('.example').map(e => e.textContent.replace(/\s+/g,' '));
check('the header preview shows the same building name the bill prints',
  preview.some(p => p.includes(paperHeader)), `${paperHeader} | ${preview[0]}`);
check('the footer preview shows the same bank details',
  preview.some(p => p.includes('ธนาคารกสิกรไทย')) && paperFoot.includes('ธนาคารกสิกรไทย'));
check('backups are listed with a date and a size',
  $$('.bkrow').length > 0 && /\d/.test($('.bkrow').textContent), text('.bklist'));

section('บันทึกมิเตอร์ — Enter walks down the column');
await nav('บันทึกมิเตอร์');
const boxes = $$('[data-w],[data-e]');
check('water and electricity alternate down the page',
  boxes.length >= 4 && boxes[0].dataset.w && boxes[1].dataset.e,
  boxes.slice(0,4).map(b => Object.keys(b.dataset)[0]).join(','));
check('the ยังไม่จด filter and the จดแล้ว filter add up to ทั้งหมด of the metered rooms',
  Number(byText('.chip','ยังไม่จด').querySelector('.n').textContent)
  + Number(byText('.chip','จดแล้ว').querySelector('.n').textContent)
  <= Number(byText('.chip','ทั้งหมด').querySelector('.n').textContent),
  [...$$('.chip .n')].map(n => n.textContent).join('/'));
const before = $$('.mno').length;
await click(byText('.switch', 'แสดงห้องว่าง'), 300);
check('แสดงห้องว่าง adds the empty rooms rather than replacing anything',
  $$('.mno').length >= before, `${before} -> ${$$('.mno').length}`);

done();
