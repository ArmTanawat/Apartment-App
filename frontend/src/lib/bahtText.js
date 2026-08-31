/* bahtText.js — a money amount as Thai words, for a receipt.
 *
 * Display only. Nothing stores this: it is derived from the number on the
 * document, the way the digits are, and storing it would give a receipt two
 * places to disagree with itself.
 *
 * The rules that a straight digit-by-digit reading gets wrong:
 *
 *   สิบ, not หนึ่งสิบ          — a tens digit of 1 has no หนึ่ง in front
 *   ยี่สิบ, not สองสิบ          — a tens digit of 2 is its own word
 *   เอ็ด, not หนึ่ง             — a final 1 with anything before it
 *
 * That last one reaches across groups: 1,000,001 is หนึ่งล้านเอ็ด, even though
 * within its own group of six the 1 stands alone.
 */

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

// Up to six digits. `precededByMore` is whether a higher group came first,
// which is what makes a lone trailing 1 read as เอ็ด.
function readGroup(group, precededByMore) {
  let out = '';
  for (let i = 0; i < group.length; i++) {
    const digit = Number(group[i]);
    if (digit === 0) continue;
    const place = group.length - 1 - i;

    if (place === 0) {
      const somethingBefore = precededByMore || /[1-9]/.test(group.slice(0, i));
      out += (digit === 1 && somethingBefore) ? 'เอ็ด' : DIGITS[digit];
    } else if (place === 1) {
      out += digit === 1 ? 'สิบ' : digit === 2 ? 'ยี่สิบ' : DIGITS[digit] + 'สิบ';
    } else {
      out += DIGITS[digit] + PLACES[place];
    }
  }
  return out;
}

// Thai counts in groups of six, joined by ล้าน — so 10^12 reads ล้านล้าน
// rather than needing a word of its own.
function readInt(n) {
  if (n === 0) return 'ศูนย์';
  const digits = String(n);
  const groups = [];
  for (let end = digits.length; end > 0; end -= 6) {
    groups.unshift(digits.slice(Math.max(0, end - 6), end));
  }
  return groups
    .map((group, i) => readGroup(group, groups.slice(0, i).some(g => /[1-9]/.test(g))))
    .join('ล้าน');
}

export function bahtText(amount) {
  // Two decimal places is what a bill stores, but a float arriving as
  // 6628.005 must not quietly read as no satang at all.
  const inSatang = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(inSatang / 100);
  const satang = inSatang % 100;
  const sign = amount < 0 ? 'ลบ' : '';

  return satang === 0
    ? `${sign}${readInt(baht)}บาทถ้วน`
    : `${sign}${readInt(baht)}บาท${readInt(satang)}สตางค์`;
}
