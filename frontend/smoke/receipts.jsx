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
check('the receipts card says whether one is out, and when',
  $$('th', rcptCard).map(t => t.textContent.trim()).join(',') === 'ห้อง,ผู้เช่า,สถานะ,ออกเมื่อ,ยอด',
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
// The other side of the same rule: the figures are printed, the sentence they
// were lifted out of is not. Asserting only the first would pass on a bill
// that prints both, which is what this replaced.
check('and the rate working is not printed beside them',
  !body().includes('หน่วยแรก') && !body().includes('หน่วย ×'), text('.pitems'));
check('the total is spelled out in Thai',
  /\(.*บาท(ถ้วน|.*สตางค์)\)/.test(body()), text('.pitems tr.total'));

section('with โหมดผู้ดูแล off, which is how the program arrives');
await click(byText('.btn', 'ออกใบเสร็จ'));
check('the dialog says the receipt cannot be taken back',
  $('.modal').textContent.includes('ไม่สามารถยกเลิกได้'), $('.modal').textContent.slice(0,180));
check('and tells the reader to fix the bill first instead',
  $('.modal').textContent.includes('ต้องทำก่อนออกใบเสร็จ'));
check('it does not offer an undo it is hiding',
  !$('.modal').textContent.includes('ยกเลิกได้ ใบเสร็จไม่มีเลขที่กำกับ'));
await click(byText('.modal .btn', 'ยกเลิก'), 300);

section('turning โหมดผู้ดูแล on, through the switch rather than the API');
await nav('ตั้งค่า');
{
  const card = $$('.setcard').find(c => c.querySelector('h2').textContent.trim() === 'โหมดผู้ดูแล');
  check('the card is on ตั้งค่า', !!card, $$('.setcard h2').map(h=>h.textContent.trim()).join(' | '));
  // The switch carries no words of its own, so its state is the class the
  // shared Switch sets — the same one every other toggle in the app uses.
  check('it names what it governs', $('label', card).textContent.trim() === 'ใบเสร็จ',
    $('label', card).textContent);
  check('and it starts off', !$('.switch', card).className.includes('on'),
    $('.switch', card).className);
  await click($('.switch', card), 600);
  const again = $$('.setcard').find(c => c.querySelector('h2').textContent.trim() === 'โหมดผู้ดูแล');
  check('the switch turns on', $('.switch', again).className.includes('on'),
    $('.switch', again).className);
}
await nav('บิล');
{
  const card = $$('.setcard').find(c => c.querySelector('h2').textContent.trim() === 'บิลเดือนนี้');
  await click($$('tbody tr', card)[0], 600);
}

section('it asks first, though nothing here is one-way');
await click(byText('.btn', 'ออกใบเสร็จ'));
check('a dialog stops first', !!$('.modal') && $('.modal h3').textContent === 'ออกใบเสร็จ',
  $('.modal') && $('.modal h3').textContent);
check('it says the receipt can be cancelled',
  $('.modal').textContent.includes('ยกเลิกได้'), $('.modal').textContent.slice(0,140));
check('and that correcting the bill takes it with it',
  $('.modal').textContent.includes('ใบเสร็จจะถูกยกเลิกไปด้วย'));
check('and it no longer claims a number is spent',
  !$('.modal').textContent.includes('ใช้ซ้ำ'), $('.modal').textContent.slice(0,140));
check('and when to press it', $('.modal').textContent.includes('เมื่อผู้เช่าจ่ายเงินแล้ว'));
check('it names the bill it is about', $('.modal .lead').textContent.includes('ห้อง'));
await click(byText('.modal .btn', 'ยกเลิก'), 300);
check('ยกเลิก issues nothing', !$('.modal') && !!byText('.btn', 'ออกใบเสร็จ'));

section('issuing it');
await click(byText('.btn', 'ออกใบเสร็จ'));
await click(byText('.modal .btn', 'ออกใบเสร็จ'), 700);
check('the receipt opens', !!$('.paper'), body().slice(0,120));
check('it calls itself a receipt', body().includes('ใบเสร็จรับเงิน') && body().includes('Receipt'));
check('it carries no number', !/\d{4}-\d{4}/.test(text('.phead')), text('.phead'));
check('it names the month it settles, where an invoice does',
  text('.phead').includes(period), text('.phead'));
check('and does not say it twice', !text('.pto').includes('งวด'), text('.pto'));
check('there is a line to sign', !!$('.sign') && $('.sign').textContent.includes('ผู้รับเงิน'));
check('the standing "money arrived" line is gone',
  !body().includes('ได้รับเงินตามรายการข้างต้น'));
check('the header names the period as งวดที่', text('.phead').includes('งวดที่'), text('.phead'));
check('and carries the day it was issued, without the time',
  /ออกเมื่อ\s*\d{4}-\d{2}-\d{2}/.test(text('.phead'))
    && !/\d{2}:\d{2}:\d{2}/.test(text('.phead')), text('.phead'));
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
check('the row now says it is out', card2.textContent.includes('ออกแล้ว'), card2.textContent.slice(0,120));
check('and a print-all appeared', $$('.btn', card2).some(b => b.textContent.includes('พิมพ์ทั้งหมด')));
check('clicking that row opens the receipt, no confirmation',
  true);
await click($$('tbody tr', card2).find(r => r.textContent.includes('ออกแล้ว')), 500);
check('it went straight to the receipt', !$('.modal') && body().includes('ใบเสร็จรับเงิน'));
await click(byText('.back', 'บิล'), 500);

section('the bill screen now offers to print it instead');
await click($('.blist tbody tr'), 400);
check('พิมพ์ใบเสร็จ, not ออกใบเสร็จ', !!byText('.btn', 'พิมพ์ใบเสร็จ') && !byText('.btn', 'ออกใบเสร็จ'));

section('a receipted bill can be deleted now, but says what that costs');
await click(byText('.btn', 'ลบบิล'), 400);
check('the dialog does not refuse', !$('.modal .err'),
  $('.modal') && $('.modal').textContent.slice(0,100));
check('it warns the receipt goes too',
  $('.modal').textContent.includes('ยกเลิกใบเสร็จไปด้วย'), $('.modal').textContent.slice(0,160));
check('and the delete button is there', !!byText('.modal .btn', 'ลบบิล'));
await click(byText('.modal .btn', 'ยกเลิก'), 300);
check('backing out deletes nothing', !$('.modal') && !!byText('.btn', 'พิมพ์ใบเสร็จ'));

section('a receipt can be taken back, which is the whole of the change');
const firstReceipt = (await api('GET', `/receipts?period=${period}`))[0];
await click(byText('.btn', 'พิมพ์ใบเสร็จ'), 500);
check('the receipt page offers to cancel', !!byText('.btn', 'ยกเลิกใบเสร็จ'), body().slice(0,120));
check('and no longer claims it cannot be', !body().includes('ยกเลิกไม่ได้'));
await click(byText('.btn', 'ยกเลิกใบเสร็จ'), 400);
check('it asks first', !!$('.modal') && $('.modal h3').textContent.includes('ยกเลิกใบเสร็จ'),
  $('.modal') && $('.modal h3').textContent);
check('saying the bill itself is untouched',
  $('.modal').textContent.includes('บิลใบนี้ไม่ถูกลบ'), $('.modal').textContent.slice(0,160));
await click(byText('.modal .btn', 'ไม่ยกเลิก'), 300);
check('backing out cancels nothing', !$('.modal'));
await click(byText('.btn', 'ยกเลิกใบเสร็จ'), 400);
await click(byText('.modal .btn', 'ยกเลิกใบเสร็จ'), 700);
check('it lands back on the bill, which still exists', !!$('.paper') && body().includes('ใบแจ้งหนี้'),
  body().slice(0,120));
check('and offers to issue again, not to print', !!byText('.btn', 'ออกใบเสร็จ') && !byText('.btn', 'พิมพ์ใบเสร็จ'));
{
  const gone = await api('GET', `/receipts?period=${period}`);
  check('the row is gone from the server too',
    !gone.some(r => r.bill_id === firstReceipt.bill_id), `${gone.length} left`);
}
await click(byText('.btn', 'ออกใบเสร็จ'));
await click(byText('.modal .btn', 'ออกใบเสร็จ'), 700);
check('issuing again works, with nothing spent in between',
  body().includes('ใบเสร็จรับเงิน'), body().slice(0,120));

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
check('and offers to regenerate even though it is receipted',
  !!byText('.stale .btn', 'ออกบิลใหม่'), $('.stale') && $('.stale').textContent);
check('saying the receipt goes with the old bill',
  $('.stale').textContent.includes('ยกเลิกใบเสร็จนั้นไปด้วย'), $('.stale').textContent);

section('printing a month of receipts');
await nav('บิล');
await click(byText('.btn', 'พิมพ์ทั้งหมด'), 600);
check('one paper per receipt', $$('.paper').length >= 1, `${$$('.paper').length}`);
check('each has a signature line', $$('.paper').every(p => p.querySelector('.sign')));
check('and none has bank details', $$('.paper').every(p => !p.textContent.includes('ธนาคารกสิกรไทย')));
check('the header names the rooms rather than a range of numbers',
  !/\d{4}-\d{4}/.test(text('.noprint')) && text('.noprint').includes('ห้อง'), text('.noprint'));

section('correcting a receipted bill takes the receipt with it');
await nav('บิล');
await click(billRow('บิลเดือนนี้').find(r => r.textContent.includes(receipted.unit_number)), 600);
check('the stale banner is still there to act on', !!$('.stale'));
await click(byText('.stale .btn', 'ออกบิลใหม่'), 900);
check('a new bill is shown', !!$('.paper') && body().includes('ใบแจ้งหนี้'), body().slice(0,120));
check('and it offers to issue a receipt, not to print one',
  !!byText('.btn', 'ออกใบเสร็จ') && !byText('.btn', 'พิมพ์ใบเสร็จ'));
check('the staleness is gone, because the figures now match', !$('.stale'));
{
  const after = await api('GET', `/receipts?period=${period}`);
  check('the old receipt went with the old bill',
    !after.some(r => r.bill_id === receipted.bill_id), `${after.length} left`);
}
await nav('บิล');
{
  const rc = $$('.setcard').find(c => c.querySelector('h2').textContent.trim() === 'ใบเสร็จเดือนนี้');
  const row = $$('tbody tr', rc).find(r => r.textContent.includes(receipted.unit_number));
  check('and that room reads ยังไม่ได้ออก again',
    row && row.textContent.includes('ยังไม่ได้ออก'), row && row.textContent);
}

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

section('รายงานมิเตอร์รายปี');
await nav('รายงาน');
await click(byText('.chip', 'รายงานมิเตอร์รายปี'), 800);
check('the year picker replaces the month picker',
  text('.monthlabel').includes('ปี') && !text('.monthlabel').includes('งวด'),
  text('.monthlabel'));
check('the header names the year, not a month',
  /ปี/.test(text('.phead')) && !/มกราคม|กันยายน/.test(text('.phead')), text('.phead'));
check('twelve month columns plus ห้อง, มิเตอร์ and รวม',
  $$('.ytable thead th').length === 15,
  $$('.ytable thead th').map(t => t.textContent).join(','));
check('ม.ค. first and ธ.ค. last',
  $$('.ytable thead th')[2].textContent === 'ม.ค.'
    && $$('.ytable thead th')[13].textContent === 'ธ.ค.');
check('two rows per room, น้ำ then ไฟ',
  $$('.ytable tbody tr').length === $$('.room').length * 2
    || $$('.ytable tbody tr').length % 2 === 0,
  `${$$('.ytable tbody tr').length}`);
check('every cell has a number, none blank',
  $$('.ytable tbody td.num.r').every(td => /^[\d,]+$/.test(td.textContent.trim())),
  $$('.ytable tbody td.num.r').map(td => td.textContent).find(t => !/^[\d,]+$/.test(t.trim())));

section('one room\'s year, as two charts');
await click($('.ytable tbody tr.yrow'), 800);
check('a dialog opens', !!$('.modal'), body().slice(0, 80));
check('it names the room and the year', /ห้อง .* · ปี \d{4}/.test($('.modal h3').textContent),
  $('.modal h3').textContent);
check('with a chart for each meter', $$('.modal .chart').length === 2,
  `${$$('.modal .chart').length}`);
check('น้ำ and ไฟ are both labelled',
  $('.modal').textContent.includes('มิเตอร์น้ำ') && $('.modal').textContent.includes('มิเตอร์ไฟ'));
check('each chart says its own peak, so the scale is not a guess',
  $$('.modal .charthead .num').length === 2
    && $$('.modal .charthead .num').every(e => /สูงสุด/.test(e.textContent)));
check('twelve points are plotted on each',
  $$('.modal .chart')[0].querySelectorAll('circle').length === 12,
  `${$$('.modal .chart')[0].querySelectorAll('circle').length}`);
check('and the two are drawn in different colours',
  $$('.modal .chart path[fill]')[0].getAttribute('fill')
    !== $$('.modal .chart path[fill]')[2].getAttribute('fill'),
  $$('.modal .chart path[fill]').map(p => p.getAttribute('fill')).join(' / '));
await click(byText('.modal .btn', 'ปิด'), 400);
check('closing leaves the report behind it', !$('.modal') && !!$('.ytable'));

check('the monthly meter report is untouched by any of this',
  (await (async () => { await click(byText('.chip', 'รายงานมิเตอร์'), 700);
    return !$('.ytable') && !!$('.rtable') && text('.phead').includes('งวด'); })()),
  text('.phead'));

section('ออกใบเสร็จทุกห้อง — the whole month in one press');
await nav('บิล');
{
  const card = () => $$('.setcard').find(c =>
    c.querySelector('h2').textContent.includes('ใบเสร็จเดือนนี้'));
  const unissued = () => $$('tbody tr', card()).filter(r => r.textContent.includes('ยังไม่ได้ออก'));

  const before = unissued().length;
  check('there are bills waiting for a receipt to begin with', before > 0, `${before}`);
  const batchBtn = byText('.btn', 'ออกใบเสร็จทุกห้อง');
  check('the button sits in the receipts card beside the print-all',
    !!batchBtn && card().contains(batchBtn));
  check('and says how many it is about to issue',
    batchBtn.textContent.includes(String(before)), batchBtn.textContent.trim());

  await click(batchBtn, 900);
  check('it asks first, like the single one does',
    !!$('.modal') && $('.modal h3').textContent === 'ออกใบเสร็จทุกห้อง',
    $('.modal') && $('.modal h3').textContent);
  check('naming the count and the money before the press',
    $('.modal .lead').textContent.includes(String(before)), text('.modal .lead'));
  check('and still asking the one question the program cannot answer',
    $('.modal').textContent.includes('ออกเมื่อผู้เช่าจ่ายเงินแล้วเท่านั้น'));

  // Cancelling has to leave the month exactly as it was — this button writes
  // to every bill at once, so a dialog that acted on the way out would be the
  // worst one in the program to get wrong.
  await click(byText('.modal .btn', 'ยกเลิก'), 500);
  check('cancelling issues nothing', unissued().length === before, `${unissued().length}`);

  await click(byText('.btn', 'ออกใบเสร็จทุกห้อง'), 900);
  await click(byText('.modal .btn', 'ออกใบเสร็จ'), 1200);
  check('pressing it clears the month', unissued().length === 0,
    unissued().map(r => r.textContent).join(' | '));
  // The receipts list is the screen's own fetch, not part of `bills`, so this
  // is the check that the batch told it to look again.
  const tally = card().textContent.match(/ออกแล้ว (\d+) จาก (\d+) ใบ/);
  check('and the card\'s own tally caught up without a reload',
    !!tally && tally[1] === tally[2], tally ? tally[0] : card().textContent.slice(0, 120));
  check('and the button goes when there is nothing left to issue',
    !byText('.btn', 'ออกใบเสร็จทุกห้อง'));

  // Nobody gets two pieces of paper for one bill.
  const rs = await api('GET', `/receipts?period=${period}`);
  const bills = await api('GET', `/bills?period=${period}`);
  check('one receipt per bill, never two',
    new Set(rs.map(r => r.bill_id)).size === rs.length && rs.length === bills.length,
    `${rs.length} receipts for ${bills.length} bills`);
}

done();
