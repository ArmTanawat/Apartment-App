/* The typefaces are files in this project, and have to stay that way.
 *
 * They used to come from Google Fonts over the internet, on a program whose
 * premise is that it runs offline. It did not fail at once — Google's
 * stylesheet has a short cache life and its .woff2 files a long one, so a
 * machine that went offline kept the fonts and lost the rules naming them, and
 * weeks in the app quietly changed typeface. On Windows that means Leelawadee
 * UI, which is a different width, so the printed bill's columns move with it.
 *
 * Nothing on a screen can catch that: the page renders, just wrong. So it is
 * checked here, where re-adding the link or losing a file is a failed build
 * rather than a phone call a month later.
 *
 *   npm run check-fonts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (name, cond, detail = '') => {
  if(cond) console.log(`  ok   ${name}`);
  else { failed++; console.log(`  FAIL ${name}${detail ? '  — ' + detail : ''}`); }
};

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css  = fs.readFileSync(path.join(root, 'src/styles/fonts.css'), 'utf8');

console.log('\nno typeface is fetched from anywhere');
for(const file of ['index.html', 'src/styles/app.css', 'src/styles/fonts.css']){
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  // The comment in index.html says the words, so match a real reference.
  ok(`${file} asks no outside host for one`,
    !/(?:href|url|src)\s*[=(]\s*["']?https?:\/\/[^"')\s]*fonts\.(?:googleapis|gstatic)\.com/.test(text));
}

console.log('\nevery face the stylesheet names is on disk');
const urls = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map(m => m[1]);
ok('the stylesheet names some', urls.length > 0, `${urls.length}`);
for(const url of [...new Set(urls)]){
  const file = path.join(root, 'public', url);
  const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
  ok(`${url} exists and is a real woff2`,
    size > 1000 && fs.readFileSync(file).subarray(0, 4).toString('latin1') === 'wOF2',
    size ? `${size} bytes` : 'missing');
}

console.log('\nboth families the app asks for are declared');
for(const family of ['Noto Sans Thai', 'Roboto Mono']){
  ok(`${family} has faces`, css.includes(`font-family: '${family}'`));
}
// Thai is the whole point, and it is the subset easiest to leave out by
// accident — every other subset still renders English and numbers.
ok('the Thai subset is one of them', /U\+0E01-0E5B/.test(css));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
