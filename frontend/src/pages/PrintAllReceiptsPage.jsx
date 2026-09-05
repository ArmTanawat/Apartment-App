import BillPaper from '../components/BillPaper.jsx';
import ErrBox from '../components/ErrBox.jsx';
import { get, messageOf } from '../lib/api.js';
import { baht } from '../lib/helpers.js';
import { useApi } from '../lib/useApi.js';
import { useUi } from '../state/UiContext.jsx';

/* Every receipt for the month, one per page.
 *
 * Only bills that have one. A room that was never billed has no receipt to
 * leave out and no blank page to suppress — if there is no bill there is
 * nothing here, which is why this page has no "skipped" note of its own. */
export default function PrintAllReceiptsPage(){
  const { period, go } = useUi();

  const req = useApi(async () => {
    const receipts = await get(`/receipts?period=${period}`);
    const bills = await Promise.all(receipts.map(r => get(`/bills/${r.bill_id}`)));
    return { receipts, bills };
  }, [period]);

  if(req.loading) return <p className="sub">กำลังโหลด…</p>;
  if(req.error) return <>
    <button className="back noprint" onClick={() => go({name:"bills"})}>← บิล</button>
    <ErrBox>{messageOf(req.error)}</ErrBox>
  </>;

  const { receipts, bills } = req.data;
  if(!receipts.length) return <>
    <button className="back noprint" onClick={() => go({name:"bills"})}>← บิล</button>
    <p className="none">งวดนี้ยังไม่ได้ออกใบเสร็จ</p>
  </>;

  const total = bills.reduce((sum, b) => sum + b.total, 0);

  return <>
    <div className="noprint">
      <button className="back" onClick={() => go({name:"bills"})}>← บิล</button>
      <div className="head"><h1>พิมพ์ใบเสร็จทั้งเดือน</h1></div>
      <p className="sub">งวด {period} · <span className="num">{receipts.length}</span> ใบ ·
        รวม <span className="num">{baht(total)}</span> บาท · หนึ่งใบต่อหนึ่งหน้า</p>
      {/* There is no number range to name any more, so what identifies the
          stack is the rooms in it. Ordered by room, the same as the list this
          page was reached from. */}
      <p className="sub" style={{marginTop:"-18px",fontSize:"13px"}}>
        ห้อง <span className="num">{receipts.map(r => r.unit_number).join(", ")}</span></p>
      <div className="actions" style={{maxWidth:"640px",alignItems:"center"}}>
        <button className="btn" onClick={() => window.print()}>พิมพ์ทั้งหมด</button>
        <span style={{color:"var(--muted)",fontSize:"13px"}}>
          เลือกปลายทางเป็น "บันทึกเป็น PDF" ในกล่องพิมพ์ ถ้าอยากได้เป็นไฟล์</span>
      </div>
    </div>
    <div className="papers">
      {bills.map(b => <BillPaper key={b.id} bill={b} receipt={b.receipt} />)}
    </div>
  </>;
}
