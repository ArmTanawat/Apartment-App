/* What the screens do when the server is not there.
 *
 * The app loads normally against a running backend, then fetch is replaced
 * with one that always fails — the same thing the user sees when the Express
 * process has stopped. Two questions: does the page say so once at the top,
 * and does a silent save on บันทึกมิเตอร์ stop looking like it worked.
 *
 *   npx vite build --ssr smoke/offline.jsx --outDir smoke-dist
 *   node smoke-dist/offline.js
 */
import './seed.mjs';
import { $, $$, body, check, done, nav, section, settle, text, typeAndSave } from './harness.jsx';

section('loaded normally');
check('board rendered', text('h1') === 'ห้องพัก');
check('no banner while the server is up', !body().includes('ติดต่อเซิร์ฟเวอร์ไม่ได้'));

// Pull the server out from under it.
const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.reject(new TypeError('fetch failed'));

section('a silent save that fails must not look like it worked');
await nav('บันทึกมิเตอร์');
const row = $$('.mno').find(e => e.textContent === '203').closest('tr');
const w = row.querySelector('[data-w]');
await typeAndSave(w, '80');
const stat = () => $(`[data-w="${w.dataset.w}"]`).closest('tr').querySelector('.mstat');
check('the row says it is not saved', stat().textContent.includes('ยังไม่ได้บันทึก'), stat().textContent);
check('and says why', stat().textContent.includes('ติดต่อเซิร์ฟเวอร์ไม่ได้'), stat().textContent);
check('it does not claim บันทึกแล้ว', !stat().textContent.includes('บันทึกแล้ว'));

section('and the page says it once at the top');
check('banner appeared', body().includes('ตัวเลขที่เห็นอาจไม่ใช่ล่าสุด'), body().slice(0, 200));
check('with a retry', !!$$('.err button').find(b => b.textContent.includes('ลองใหม่')));

section('a form refuses rather than pretending');
await nav('ผู้เช่า');
const add = $$('.btn').find(b => b.textContent.includes('เพิ่มผู้เช่า'));
const { click, type } = await import('./harness.jsx');
await click(add);
await type($('.modal .field input'), 'ทดสอบ ไม่มีเซิร์ฟเวอร์');
await click($$('.modal .btn').find(b => b.textContent === 'เพิ่ม'), 200);
check('the dialog stays open', !!$('.modal'));
check('and says the server cannot be reached',
  $('.modal .err') && $('.modal .err').textContent.includes('ติดต่อเซิร์ฟเวอร์ไม่ได้'),
  $('.modal .err') && $('.modal .err').textContent);

section('retry once the server is back');
globalThis.fetch = realFetch;
await click($$('.modal .btn').find(b => b.textContent === 'ยกเลิก'));
await click($$('.err button').find(b => b.textContent.includes('ลองใหม่')), 400);
await settle(300);
check('banner cleared', !body().includes('ตัวเลขที่เห็นอาจไม่ใช่ล่าสุด'), body().slice(0,160));

done();
