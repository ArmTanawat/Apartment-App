import { useEffect, useRef, useState } from 'react';
import { dmy } from '../lib/helpers.js';

/* A date box that reads and accepts วัน/เดือน/ปี.
 *
 * What is stored does not change and must not: 'YYYY-MM-DD', the one format
 * every comparison in this app and every date column in the database is
 * written in. Only what the box shows is different.
 *
 * <input type="date"> takes its display format from the browser's locale, not
 * from the page, so on a machine set to US English it reads mm/dd/yyyy. On a
 * Thai form that is worse than merely foreign: 05/06 is a real date either way
 * round, nothing on the screen says which, and a วันหมดอายุบัตร typed the
 * wrong way is wrong quietly. Setting lang or an Electron locale switch moves
 * that guess somewhere else rather than settling it.
 *
 * So the text is ours — a plain box, dd/mm/yyyy, typed or read — and the
 * calendar is still Chromium's, on the button beside it. Nothing about picking
 * a date is reimplemented; the popup is the same one the old arrow opened.
 */

// If the calendar cannot be opened from script, the native box comes back
// whole rather than leaving a form that can only be typed into.
const CAN_OPEN_PICKER = typeof HTMLInputElement !== 'undefined'
  && typeof HTMLInputElement.prototype.showPicker === 'function';

const p2 = n => String(n).padStart(2, '0');

// '15/03/2025' → '2025-03-15'. Any separator, or none at all, so 15032025
// pasted off a form still lands. null when it is not a date.
//
// The date is checked against itself afterwards because new Date(2025,1,31)
// is not refused by JavaScript — it rolls quietly forward to 3 March, and a
// 31/02 typed by mistake would be saved as a real day nobody chose.
const toIso = text => {
  const t = (text || '').trim();
  const parts = /^\d{8}$/.test(t)
    ? [t.slice(0, 2), t.slice(2, 4), t.slice(4)]
    : t.split(/\D+/).filter(Boolean);
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  const [d, m, y] = parts.map(Number);
  const made = new Date(y, m - 1, d);
  if (made.getFullYear() !== y || made.getMonth() !== m - 1 || made.getDate() !== d) return null;
  return `${y}-${p2(m)}-${p2(d)}`;
};

export default function DateField({ value, onChange, ...rest }){
  const [text, setText] = useState(() => dmy(value));
  const picker = useRef(null);

  // value can change from outside — the picker, a ว่างวันนี้ button, a modal
  // opening on an existing record — and the box follows it. Typing sets both
  // in the same keystroke, so the guard leaves half-typed text alone.
  useEffect(() => { setText(t => toIso(t) === value ? t : dmy(value)); }, [value]);

  const type = e => {
    const next = e.target.value;
    setText(next);
    // Empty is a real answer here: every date on these forms may be cleared.
    if (next.trim() === '') return onChange('');
    const iso = toIso(next);
    if (iso) onChange(iso);
  };

  // Half a date, or a wrong one, would otherwise sit in the box showing one
  // thing while the form holds another. Put back what is actually saved.
  const leave = () => setText(dmy(value));

  const open = () => {
    try { picker.current.showPicker(); }
    catch { picker.current.focus(); }
  };

  if (!CAN_OPEN_PICKER) {
    return <input type="date" value={value || ''}
      onChange={e => onChange(e.target.value)} {...rest} />;
  }

  return (
    <div className="datefield">
      <input className="num dtext" value={text} onChange={type} onBlur={leave}
        inputMode="numeric" maxLength={10} placeholder="วว/ดด/ปปปป" {...rest} />
      <button type="button" className="daybtn" onClick={open}
        title="เลือกจากปฏิทิน" aria-label="เลือกจากปฏิทิน">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      {/* The real date input, kept in the page because showPicker() will not
          open a calendar for an element that is not rendered. It is never
          typed into: the box to its left is. */}
      <input ref={picker} type="date" className="dpick" tabIndex={-1} aria-hidden="true"
        value={value || ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
