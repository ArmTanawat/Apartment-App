// The error page is the part of this that the owner's mother is most likely to
// be alone with, and the part nothing else exercises. It is a static file with
// a little script, so it can be checked without launching anything.
//
//   npm run check-error-page

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'error.html'), 'utf8');
let failed = 0;
const ok = (name, cond, detail = '') => {
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failed++;
};
const render = query => new JSDOM(html, {
  url: `file:///error.html${query}`, runScripts: 'dangerously',
}).window.document;

// The three things main.js can conclude, and what each has to say.
const REASONS = {
  port:     'เปิดช่องทางเชื่อมต่อภายในเครื่องไม่ได้',
  database: 'เปิดไฟล์ข้อมูลไม่ได้',
  crashed:  'ตัวโปรแกรมส่วนหลังหยุดทำงานกะทันหัน',
};

for (const [reason, said] of Object.entries(REASONS)) {
  const d = render(`?reason=${reason}`);
  ok(`${reason}: names what went wrong`, d.getElementById('what').textContent === said,
     d.getElementById('what').textContent);
  ok(`${reason}: says what to do about it`, d.getElementById('lead').textContent.length > 20);
  ok(`${reason}: offers ลองใหม่`, d.getElementById('retry').textContent === 'ลองใหม่');
  ok(`${reason}: offers the log for whoever gets called`,
     d.getElementById('log').textContent === 'ดูบันทึกปัญหา');
  ok(`${reason}: no English anywhere on it`,
     !/[A-Za-z]{4}/.test(d.querySelector('.box').textContent),
     String(d.querySelector('.box').textContent.match(/[A-Za-z]{4,}/g)));
  ok(`${reason}: says the data is still there`,
     d.querySelector('.help').textContent.includes('ยังอยู่ครบ'));
}

// main.js should always send one of the three, but a page that renders blank
// because it did not is worse than one that guesses.
ok('an unrecognised reason still says something', render('?reason=nonsense').getElementById('what').textContent.length > 0);
ok('no reason at all still says something', render('').getElementById('what').textContent.length > 0);

// The buttons are the only reason a preload is attached to the window.
ok('retry goes through the preload bridge', /window\.startup\.retry\(\)/.test(html));
ok('the log button does too', /window\.startup\.openLog\(\)/.test(html));
ok('and it never reaches for Node directly', !/require\(/.test(html));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
