/* A fee that is a share of something else on the same bill.
 *
 *   npm run smoke:share
 */
import './seed.mjs';
import { $, $$, body, byText, check, click, done, nav, section, select, text, type } from './harness.jsx';

const api = async (m,p,b) => { const r = await fetch('http://localhost:3001'+p,
  {method:m, headers:{'Content-Type':'application/json'}, body:b?JSON.stringify(b):undefined});
  return r.status===204?null:r.json(); };
const period = new Date().toISOString().slice(0,7);

section('ตั้งค่า — the advanced block on a fee type');
await nav('ตั้งค่า');
await click(byText('.linkbtn', '+ เพิ่ม'));
check('the dialog opens on the ordinary kind', !!$('.modal') && !!byText('.modal label', 'ค่าตั้งต้น'));
check('advanced is folded away', !$('.modal select'), 'a dropdown was already showing');
await click(byText('.modal .linkbtn', 'การตั้งค่าขั้นสูง'));
check('it opens', !!byText('.modal .switch', 'คิดเป็นเปอร์เซ็นต์ของรายการอื่น'));
check('and is off to begin with', !$('.modal .switch.on'));
await click(byText('.modal .switch', 'คิดเป็นเปอร์เซ็นต์ของรายการอื่น'));
check('the baht box goes away', !byText('.modal label', 'ค่าตั้งต้น'));
const basis = $('.modal select');
check('the five bases are offered from GET /fees/basis',
  [...basis.options].map(o => o.textContent).join(', ') ===
  'ค่าน้ำ, ค่าไฟ, ค่าเช่า, ค่าน้ำและค่าไฟ, ยอดก่อนคิดรายการนี้',
  [...basis.options].map(o => o.textContent).join(', '));

await type($('.modal input'), 'ค่าบริการสาธารณูปโภค Utility service');
await type($$('.modal input.num')[0], '100');
await select(basis, 'electricity');
await click(byText('.modal .btn', 'บันทึก'), 300);
check('saved', !$('.modal'), $('.modal') && $('.modal .err') && $('.modal .err').textContent);
const row = $$('.ftable tbody tr').find(r => r.textContent.includes('ค่าบริการสาธารณูปโภค'));
check('the table shows the rule, not a baht figure',
  row.children[1].textContent === '100% ของค่าไฟ', row.children[1].textContent);

section('ห้อง — attaching it to a tenant');
await nav('ห้องพัก');
await click(byText('.room', '101'));
const feeCard = $$('.card').find(c => c.querySelector('h2')
  && c.querySelector('h2').textContent.includes('ค่าธรรมเนียมประจำ'));
await click($$('.linkbtn', feeCard).find(b => b.textContent === '+ เพิ่ม'));
const typeSel = $('.modal select');
await select(typeSel, [...typeSel.options].find(o => o.textContent.includes('ค่าบริการสาธารณูปโภค')).value);
check('it asks for a percentage, not a baht amount',
  !!byText('.modal label', 'คิดตามเปอร์เซ็นต์') && !byText('.modal label', 'ยอดต่อเดือน'),
  $('.modal').textContent.slice(0,120));
check('and names what it is a share of', $('.modal').textContent.includes('% ของค่าไฟ'));
await click(byText('.modal .btn', 'บันทึก'), 300);
check('attached', !$('.modal'));
check('the room lists the rule in place of a figure',
  body().includes('คิดตามค่าไฟ') && body().includes('100%'),
  $$('.card').find(c => c.querySelector('h2')
    && c.querySelector('h2').textContent.includes('ค่าธรรมเนียมประจำ')).textContent.replace(/\s+/g,' '));

section('the bill');
const u101 = (await api('GET','/units')).find(u => u.unit_number === '101');
const pv = await api('GET', `/bills/preview/${u101.lease_id}/${period}`);
const line = pv.items.find(i => i.label.includes('ค่าบริการสาธารณูปโภค'));
const elec = pv.items.find(i => i.label === 'ค่าไฟ Electricity');
check('the share equals the line it is a share of', line.amount === elec.amount,
  `${line.amount} vs ${elec.amount}`);
check('the working is on the bill', line.detail.includes(`100% ของค่าไฟ ${elec.amount}`), line.detail);
check('it is the last line', pv.items[pv.items.length-1].label.includes('ค่าบริการสาธารณูปโภค'));
check('and it is in the total', pv.total === pv.rent_amount + pv.water_amount + pv.elec_amount + pv.fees_amount);

section('two shares on one bill do not stack on each other');
const sub = await api('POST','/fees/types',{name:'ค่าบริการรวม Service', percent_of:'subtotal', percent:10});
await api('POST','/fees/lease',{lease_id:u101.lease_id, fee_type_id:sub.id});
const pv2 = await api('GET', `/bills/preview/${u101.lease_id}/${period}`);
const share1 = pv2.items.find(i => i.label.includes('ค่าบริการสาธารณูปโภค'));
const share2 = pv2.items.find(i => i.label.includes('ค่าบริการรวม'));
const fixedOnly = pv2.rent_amount + pv2.water_amount + pv2.elec_amount
  + pv2.items.filter(i => i.detail === 'รายเดือน Monthly' || i.detail === 'ครั้งเดียว One-time')
      .reduce((s,i) => s + i.amount, 0);
const expected = Math.round(fixedOnly * 0.1 * 100) / 100;
check('the % of subtotal is exactly 10% of everything that is not a share',
  share2.amount === expected,
  `got ${share2.amount}, expected ${expected} (subtotal ${fixedOnly})`);
check('and the subtotal it names on the bill excludes the other share',
  share2.detail.includes(`ของยอดก่อนคิดรายการนี้ ${fixedOnly}`), share2.detail);
check('and the first share is unchanged by the second', share1.amount === elec.amount,
  `${share1.amount} vs ${elec.amount}`);

section('turning a share back into a fixed fee');
await api('PUT', `/fees/types/${sub.id}`, {percent_of:null, default_amount:250});
const back = (await api('GET','/fees/types?all=true')).find(t => t.id === sub.id);
check('percent_of cleared', back.percent_of === null && back.default_amount === 250,
  JSON.stringify(back));

section('a basis the server does not know is refused');
check('refused', (await api('POST','/fees/types',{name:'z', percent_of:'moon', percent:5})).error
  === 'คิดตามเปอร์เซ็นต์ของ "moon" ไม่ได้');

done();
