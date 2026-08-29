import BillPaper from '../components/BillPaper.jsx';
import ErrBox from '../components/ErrBox.jsx';
import { get, messageOf } from '../lib/api.js';
import { billDiff } from '../lib/bills.js';
import { baht } from '../lib/helpers.js';
import { useApi } from '../lib/useApi.js';
import { useUi } from '../state/UiContext.jsx';

/* Every bill for the month, stacked one per page. The Print dialog's
   "Save as PDF" turns it into a file — nothing here generates one. */
export default function PrintAllPage(){
  const { period, go } = useUi();

  // The list carries no line items, so each bill is fetched in full — an
  // invoice prints what it stored, not a recalculation.
  const req = useApi(async () => {
    const list = await get(`/bills?period=${period}`);
    const bills = await Promise.all(list.map(b => get(`/bills/${b.id}`)));
    const diffs = await Promise.all(bills.map(b => billDiff(b)));
    return { bills, diffs };
  }, [period]);

  if(req.loading) return <p className="sub">กำลังโหลด…</p>;
  if(req.error) return <>
    <button className="back noprint" onClick={() => go({name:"bills"})}>← บิล</button>
    <ErrBox>{messageOf(req.error)}</ErrBox>
  </>;

  const { bills, diffs } = req.data;
  if(!bills.length) return <p className="none">ยังไม่มีบิลเดือนนี้</p>;

  const stale = bills.filter((b, i) => diffs[i].changes && diffs[i].changes.length > 0);
  const total = bills.reduce((sum, b) => sum + b.total, 0);

  return <>
    <div className="noprint">
      <button className="back" onClick={() => go({name:"bills"})}>← บิล</button>
      <div className="head"><h1>พิมพ์ทั้งเดือน</h1></div>
      <p className="sub">งวด {period} · <span className="num">{bills.length}</span> ใบ ·
        รวม <span className="num">{baht(total)}</span> บาท · หนึ่งใบต่อหนึ่งหน้า</p>
      {stale.length > 0 && (
        <div className="stale">
          <b>บิล {stale.length} ใบมีข้อมูลเปลี่ยนไปหลังออก</b><br />
          ห้อง {stale.map(b => b.unit_number).join(", ")} — พิมพ์ได้ตามเดิม
          แต่ถ้าต้องการตัวเลขล่าสุด ต้องเข้าไปกดออกบิลใหม่ทีละใบก่อน</div>
      )}
      <div className="actions" style={{maxWidth:"640px",alignItems:"center"}}>
        <button className="btn" onClick={() => window.print()}>พิมพ์ทั้งหมด</button>
        <span style={{color:"var(--muted)",fontSize:"13px"}}>
          เลือกปลายทางเป็น "บันทึกเป็น PDF" ในกล่องพิมพ์ ถ้าอยากได้เป็นไฟล์</span>
      </div>
    </div>
    <div className="papers">{bills.map(b => <BillPaper key={b.id} bill={b} />)}</div>
  </>;
}
