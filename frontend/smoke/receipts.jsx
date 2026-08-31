/* ใบเสร็จ and รายงาน — the two screens added last, driven end to end.
 *
 *   npm run smoke:receipts
 */
import { API } from './api-base.mjs';
import './seed.mjs';
import { $, $$, body, byText, check, click, done, nav, section, settle, text, type } from './harness.jsx';

const api = async (m,p,b) => { const r = await fetch(API+p,
  {method:m, headers:{'Content-Type':'application/json'}, body:b?JSON.stringify(b):undefined});
  return r.status===204?null:r.json(); };
const period = new Date().toISOString().slice(0,7);

section('บิล has two cards: the bills, and the receipts for them');
await nav('บิล');
const cards = $$('.setcard h2').map(h => h.textContent.trim());
check('a card for each', cards.includes('บิลเดือนนี้') && cards.includes('ใบเสร็จเดือนนี้'), cards.join(' | '));
const billCard = $$('.setcard').find(c => c.querySelector('h2').textContent.trim() === 'บิลเดือนนี้');
const rcptCard = $$('.setcard').find(c => c.querySelector('h2').textContent.trim() === 'ใบเสร็จเดือนนี้');
check('the bills card is about bills alone',
  $$('th', billCard).map(t => t.textContent.trim()).join(',') === 'ห้อง,ผู้เช่า,ออกเมื่อ,ยอด',
  $$('th', billCard).map(t => t.textContent.trim()).join(','));
check('the receipts card carries the number and when it was issued',
  $$('th', rcptCard).map(t => t.textContent.trim()).join(',') === 'ห้อง,ผู้เช่า,เลขที่,ออกเมื่อ,ยอด',
  $$('th', rcptCard).map(t => t.textContent.trim()).join(','));
check('one row per bill, issued or not',
  $$('tbody tr', rcptCard).length === $$('tbody tr', billCard).length,
  `${$$('tbody tr', rcptCard).length} vs ${$$('tbody tr', billCard).length}`);
check('unissued rows say so rather than showing a dash',
  rcptCard.textContent.includes('ยังไม่ได้ออก'));
check('and it counts how many are done', rcptCard.textContent.includes('ออกแล้ว'));
check('with no print-all until there is something to print',
  !$$('.btn', rcptCard).some(b => b.textContent.includes('พิมพ์ทั้งหมด')));

section('issuing from the receipts card, which is where a payment is recorded');
await click($$('tbody tr', rcptCard)[0]);
check('the confirmation appears from here too',
  !!$('.modal') && $('.modal h3').textContent === 'ออกใบเสร็จ', $('.modal') && $('.modal h3').textContent);
await click(byText('.modal .btn', 'ยกเลิก'), 300);

section('the bill screen offers one as well');
await click($('.blist tbody tr'), 400);
check('the bill opens', !!$('.paper'));
check('with ออกใบเสร็จ, not พิมพ์ใบเสร็จ', !!byText('.btn', 'ออกใบเสร็จ') && !byText('.btn', 'พิมพ์ใบเสร็จ'));

section('the two things the invoice gained');
check('the meter figures are labelled, not only inside the sentence',
  body().includes('ก่อนหน้า') && body().includes('ปัจจุบัน') && body().includes('ใช้ไป'),
  text('.pitems'));
check('and the working survives beside them',
  body().includes('หน่วยแรก') || body().includes('หน่วย ×'), text('.pitems'));
check('the total is spelled out in Thai',
  /\(.*บาท(ถ้วน|.*สตางค์)\)/.test(body()), text('.pitems tr.total'));

section('it asks before a door that only opens one way');
await click(byText('.btn', 'ออกใบเสร็จ'));
check('a dialog stops first', !!$('.modal') && $('.modal h3').textContent === 'ออกใบเสร็จ',
  $('.modal') && $('.modal h3').textContent);
check('it says the number cannot be taken back',
  $('.modal').textContent.includes('ยกเลิกหรือใช้ซ้ำกับใบอื่นไม่ได้'));
check('and that the bill is frozen after it',
  $('.modal').textContent.includes('ออกบิลใหม่ไม่ได้อีก'));
check('and when to press it', $('.modal').textContent.includes('เมื่อผู้เช่าจ่ายเงินแล้ว'));
check('it names the bill it is about', $('.modal .lead').textContent.includes('ห้อง'));
await click(byText('.modal .btn', 'ยกเลิก'), 300);
check('ยกเลิก issues nothing', !$('.modal') && !!byText('.btn', 'ออกใบเสร็จ'));

section('issuing it');
await click(byText('.btn', 'ออกใบเสร็จ'));
await click(byText('.modal .btn', 'ออกใบเสร็จ'), 700);
check('the receipt opens', !!$('.paper'), body().slice(0,120));
check('it calls itself a receipt', body().includes('ใบเสร็จรับเงิน') && body().includes('Receipt'));
check('it carries a number', /\d{4}-\d{4}/.test(text('.phead')), text('.phead'));
check('it names the month it settles', text('.pto').includes('งวด'));
check('there is a line to sign', !!$('.sign') && $('.sign').textContent.includes('ผู้รับเงิน'));
check('it says the money arrived', body().includes('ได้รับเงินตามรายการข้างต้น'));
check('and carries no bank details', !$('.paper').textContent.includes('ธนาคารกสิกรไทย'),
  text('.pfoot'));
check('nor the standing note that belongs on a bill',
  !$('.paper').textContent.includes('ชำระภายในวันที่'), text('.pfoot'));

section('the note on this receipt');
await type($('.field input'), 'รับเป็นเงินสด');
await click(byText('.btn', 'บันทึกหมายเหตุ'), 400);
check('it is saved and printed on the paper', $('.paper').textContent.includes('รับเป็นเงินสด'));

section('back from a receipt lands on บิล, which is what its label says');
await click(byText('.back', 'บิล'), 500);
check('on the list', !!$$('.setcard h2').find(h => h.textContent.includes('บิลเดือนนี้')));
const card2 = $$('.setcard').find(c => c.querySelector('h2').textContent.trim() === 'ใบเสร็จเดือนนี้');
check('the row now shows its number', /\d{4}-\d{4}/.test(card2.textContent), card2.textContent.slice(0,120));
check('and a print-all appeared', $$('.btn', card2).some(b => b.textContent.includes('พิมพ์ทั้งหมด')));
check('clicking that row opens the receipt, no confirmation',
  true);
await click($$('tbody tr', card2).find(r => /\d{4}-\d{4}/.test(r.textContent)), 500);
check('it went straight to the receipt', !$('.modal') && body().includes('ใบเสร็จรับเงิน'));
await click(byText('.back', 'บิล'), 500);

section('the bill screen now offers to print it instead');
await click($('.blist tbody tr'), 400);
check('พิมพ์ใบเสร็จ, not ออกใบเสร็จ', !!byText('.btn', 'พิมพ์ใบเสร็จ') && !byText('.btn', 'ออกใบเสร็จ'));

section('a receipted bill cannot be deleted or regenerated');
await click(byText('.btn', 'ลบบิล'), 400);
check('the dialog refuses', $('.modal .err') && $('.modal .err').textContent.includes('ลบไม่ได้'),
  $('.modal') && $('.modal').textContent.slice(0,100));
check('and names the receipt number', /\d{4}-\d{4}/.test($('.modal .err').textContent));
await click(byText('.modal .btn', 'ปิด'));

const billId = Number((await api('GET', `/bills?period=${period}`))[0].id);
const receipted = (await api('GET', `/receipts?period=${period}`))[0];
{
  // Move the meter under the receipted bill, which is what makes a bill stale.
  const bill = await api('GET', `/bills/${receipted.bill_id}`);
  const rows = await api('GET', `/readings?period=${period}`);
  const row = rows.find(r => r.unit_number === bill.unit_number);
  await api('PUT', `/readings/${row.reading_id}`, { water_curr: row.water_curr + 40 });
}
await nav('บิล');
// Scoped to the bills card: the receipt number appears in the other one too,
// and clicking it there opens the receipt rather than the bill.
const billRow = card => $$('tbody tr', $$('.setcard').find(c =>
  c.querySelector('h2').textContent.trim() === card));
await click(billRow('บิลเดือนนี้').find(r => r.textContent.includes(receipted.unit_number)), 600);
check('the staleness banner appears', !!$('.stale'), body().slice(0,150));

// A bill that is already stale is the worst one to receipt: the paper would
// carry figures that are known to be out of date, and issuing it closes the
// only way back.
{
  await nav('บิล');
  const rc = $$('.setcard').find(c => c.querySelector('h2').textContent.trim() === 'ใบเสร็จเดือนนี้');
  const unreceipted = $$('tbody tr', rc).find(r => r.textContent.includes('ยังไม่ได้ออก'));
  if(unreceipted){
    await click(unreceipted, 600);
    check('a plain bill is warned about, without the stale wording',
      !$('.modal').textContent.includes('เปลี่ยนไปหลังออกบิล'), $('.modal').textContent.slice(0,80));
    await click(byText('.modal .btn', 'ยกเลิก'), 300);
  }
  await nav('บิล');
  await click(billRow('บิลเดือนนี้').find(r => r.textContent.includes(receipted.unit_number)), 500);
}
check('but refuses to regenerate', !byText('.stale .btn', 'ออกบิลใหม่'),
  $('.stale') && $('.stale').textContent);
check('and says why', $('.stale').textContent.includes('ออกใบเสร็จเลขที่'), $('.stale').textContent);

section('printing a month of receipts');
await nav('บิล');
await click(byText('.btn', 'พิมพ์ทั้งหมด'), 600);
check('one paper per receipt', $$('.paper').length >= 1, `${$$('.paper').length}`);
check('each has a signature line', $$('.paper').every(p => p.querySelector('.sign')));
check('and none has bank details', $$('.paper').every(p => !p.textContent.includes('ธนาคารกสิกรไทย')));
check('the header names the range of numbers', /\d{4}-\d{4}/.test(body()));

section('รายงาน');
await nav('รายงาน');
check('the tab exists between ผู้เช่า and ตั้งค่า',
  $$('.nav a').map(a => a.textContent.trim()).join('|') === 'ห้องพัก|บันทึกมิเตอร์|บิล|ผู้เช่า|รายงาน|ตั้งค่า',
  $$('.nav a').map(a => a.textContent.trim()).join('|'));
check('the summary shows first', body().includes('สรุปยอดรวมประจำเดือน'));
check('on paper, with the building header', !!$('.paper') && !!$('.phead h2'));
check('one row per bill', $$('.rtable tbody tr').length >= 2);
check('with a total row', !!$('.rtable tr.sum'));
check('and it accounts for the rooms that are not in it',
  body().includes('ห้องที่ไม่ได้อยู่ในรายงานนี้'), text('.rnote'));
check('naming the ones with a tenant but no bill', text('.rnote').includes('ยังไม่ได้ออกบิล'));
check('and the ones with no tenant', text('.rnote').includes('ไม่มีผู้เช่าในงวดนี้'));

await click(byText('.chip', 'รายงานมิเตอร์'), 400);
check('the meter report has every room, not only the billed ones',
  $$('.rtable tbody tr').length === 14, `${$$('.rtable tbody tr').length}`);
check('rooms with no reading are marked rather than dropped',
  body().includes('ยังไม่ได้จดมิเตอร์'), text('.rnote'));
check('previous, current and units for both utilities',
  text('.rtable thead').includes('ก่อนหน้า') && text('.rtable thead').includes('หน่วย'));
check('and it counts what is still outstanding', text('.rnote').includes('ยังไม่ได้จด'));

done();
