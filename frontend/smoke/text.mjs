/* The two pure display functions the receipt needs, tested on their own.
 *
 *   npm run check-text
 *
 * The table comes first because Thai numerals have rules a generic
 * implementation gets wrong, and because "it looked right on one bill" is not
 * a test of any of them.
 */
import { bahtText } from '../src/lib/bahtText.js';
import { meterFields } from '../src/lib/meterFields.js';

let failed = 0;
const ok = (name, got, want) => {
  const good = got === want;
  console.log(good ? `  ok   ${name}` : `  FAIL ${name}\n         got  ${got}\n         want ${want}`);
  if (!good) failed++;
};

console.log('\nจำนวนเงินเป็นตัวหนังสือ');
[
  [0,          'ศูนย์บาทถ้วน'],
  [1,          'หนึ่งบาทถ้วน'],
  [11,         'สิบเอ็ดบาทถ้วน'],
  [20,         'ยี่สิบบาทถ้วน'],
  [21,         'ยี่สิบเอ็ดบาทถ้วน'],
  [100,        'หนึ่งร้อยบาทถ้วน'],
  [101,        'หนึ่งร้อยเอ็ดบาทถ้วน'],
  [1000,       'หนึ่งพันบาทถ้วน'],
  [6628,       'หกพันหกร้อยยี่สิบแปดบาทถ้วน'],
  [6628.50,    'หกพันหกร้อยยี่สิบแปดบาทห้าสิบสตางค์'],
  [6628.25,    'หกพันหกร้อยยี่สิบแปดบาทยี่สิบห้าสตางค์'],
  [1000000,    'หนึ่งล้านบาทถ้วน'],
].forEach(([n, want]) => ok(String(n), bahtText(n), want));

console.log('\nอื่น ๆ ที่ไม่ได้อยู่ในตาราง แต่จะเจอจริง');
[
  [10,         'สิบบาทถ้วน'],
  [12,         'สิบสองบาทถ้วน'],
  [30,         'สามสิบบาทถ้วน'],
  [110,        'หนึ่งร้อยสิบบาทถ้วน'],
  [111,        'หนึ่งร้อยสิบเอ็ดบาทถ้วน'],
  [1001,       'หนึ่งพันเอ็ดบาทถ้วน'],
  [10000,      'หนึ่งหมื่นบาทถ้วน'],
  [100000,     'หนึ่งแสนบาทถ้วน'],
  [123456,     'หนึ่งแสนสองหมื่นสามพันสี่ร้อยห้าสิบหกบาทถ้วน'],
  [1000001,    'หนึ่งล้านเอ็ดบาทถ้วน'],
  [2000000,    'สองล้านบาทถ้วน'],
  [6628.01,    'หกพันหกร้อยยี่สิบแปดบาทหนึ่งสตางค์'],
  [6628.21,    'หกพันหกร้อยยี่สิบแปดบาทยี่สิบเอ็ดสตางค์'],
  // Rounding: money is already rounded to two places before it reaches here,
  // but a float that arrives as 6628.005 must not read as 0 satang.
  [6628.005,   'หกพันหกร้อยยี่สิบแปดบาทหนึ่งสตางค์'],
].forEach(([n, want]) => ok(String(n), bahtText(n), want));

console.log('\nแยกเลขมิเตอร์ออกจากคำอธิบาย');
{
  const line = (d, want, name) => {
    const got = meterFields(d);
    ok(name, JSON.stringify(got), JSON.stringify(want));
  };
  line('12 หน่วย — 100 บาท สำหรับ 5 หน่วยแรก แล้ว 7 × 9 (100 → 112)',
    { prev: '100', curr: '112', used: '12', rolled: false,
      working: '12 หน่วย — 100 บาท สำหรับ 5 หน่วยแรก แล้ว 7 × 9' },
    'over the minimum');
  line('3 หน่วย — ขั้นต่ำ 100 บาท ครอบคลุม 5 หน่วย (80 → 83)',
    { prev: '80', curr: '83', used: '3', rolled: false,
      working: '3 หน่วย — ขั้นต่ำ 100 บาท ครอบคลุม 5 หน่วย' },
    'under the minimum');
  line('8 หน่วย × 9 บาท (200 → 208)',
    { prev: '200', curr: '208', used: '8', rolled: false, working: '8 หน่วย × 9 บาท' },
    'minimum switched off');
  line('17 หน่วย — ขั้นต่ำ 100 บาท ครอบคลุม 5 หน่วย (9995 → 12 ครบรอบ)',
    { prev: '9995', curr: '12', used: '17', rolled: true,
      working: '17 หน่วย — ขั้นต่ำ 100 บาท ครอบคลุม 5 หน่วย' },
    'a dial that wrapped');
  line('รายเดือน Monthly', null, 'a fee line has no meter in it');
  line('ครั้งเดียว One-time', null, 'nor a one-time charge');
  line('ห้อง 101 — คิด 11 จาก 31 วัน', null, 'nor a prorated rent line');
  line('', null, 'nor an empty detail');
  ok('nor a missing one', JSON.stringify(meterFields(null)), 'null');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
