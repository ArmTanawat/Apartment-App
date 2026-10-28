import { useEffect, useState } from 'react';
import BillPaper from '../components/BillPaper.jsx';
import { get, messageOf } from '../lib/api.js';

/* What Export เป็นรูปภาพ photographs: every bill, or every receipt, of one
 * month, each on a sheet the width of A4 with the printed page's margin.
 *
 * Opened by the desktop shell in a hidden window (electron/export.js), never
 * by a person. It is the same BillPaper the print pages use, and the shell
 * switches the window to print media before measuring, so a picture is the
 * printed page — the same stylesheet, the same payment QR — and there is no
 * second template to drift from it.
 *
 * It only reads. When the sheets are drawn, the fonts are in and every image
 * has decoded, it puts window.__capture up for the shell: the file names, and
 * show(i, pageHeight), which hides every sheet but one so it is photographed
 * from the top of the page.
 *
 * Every picture is one A4 page, so they are all the same size. A bill that
 * fits — nearly all of them — sits at the top with white below, as on paper.
 * One too long for the page is shrunk until it fits, rather than cut into two
 * pictures: one room is one file, and the total and the QR at the foot stay
 * on it. It is scaled from the top centre, so it stays a page, only smaller.
 */

// A room number as a file name. Room numbers are free text; the characters a
// file name may not hold on Windows become dashes.
const fileOf = n => String(n).trim().replace(/[\\/:*?"<>|]+/g, '-') || 'room';

// One file per room, by room number. A handover month bills two leases in one
// room, so the second is 102-2 rather than writing over the first.
function fileNames(bills){
  const seen = new Map();
  return bills.map(b => {
    const base = fileOf(b.unit_number);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

export default function CapturePage({ kind, period }){
  const [sheets, setSheets] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // Full bills, because the lists carry no line items; in the bills
        // list's order, with a room's two leases oldest first.
        const ids = kind === 'receipts'
          ? (await get(`/receipts?period=${period}`)).map(r => r.bill_id)
          : (await get(`/bills?period=${period}`)).map(b => b.id);
        const bills = await Promise.all(ids.map(id => get(`/bills/${id}`)));
        const ordered = [...bills].sort((x, y) =>
          String(x.unit_number).localeCompare(String(y.unit_number), 'th', { numeric: true }) || x.id - y.id);
        const names = fileNames(ordered);
        setSheets(ordered.map((b, i) => ({ bill: b, file: names[i] })));
      } catch (e) { setError(messageOf(e)); }
    })();
  }, [kind, period]);

  useEffect(() => {
    if(error){ window.__capture = { error }; return; }
    if(!sheets) return;
    let live = true;
    (async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
      if(!live) return;
      const els = [...document.querySelectorAll('.capsheet')];
      window.__capture = {
        files: sheets.map(s => s.file),
        show: (i, pageHeight) => {
          els.forEach((el, n) => { el.style.display = n === i ? '' : 'none'; });
          const el = els[i];
          el.style.transform = '';
          const natural = el.getBoundingClientRect().height;
          const scale = natural > pageHeight ? pageHeight / natural : 1;
          if(scale < 1){
            el.style.transformOrigin = 'top center';
            el.style.transform = `scale(${scale})`;
          }
          return { natural: Math.ceil(natural), scale };
        },
      };
    })();
    return () => { live = false; };
  }, [sheets, error]);

  if(error) return <p className="err">{error}</p>;
  if(!sheets) return null;
  return (
    <div className="capture">
      {sheets.map(s => (
        <div className="capsheet" key={s.bill.id} data-file={s.file}>
          <BillPaper bill={s.bill} receipt={kind === 'receipts' ? s.bill.receipt : null} />
        </div>
      ))}
    </div>
  );
}
