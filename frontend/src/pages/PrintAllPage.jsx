import BillPaper from '../components/BillPaper.jsx';
import { baht } from '../lib/helpers.js';
import { billDiff } from '../lib/buildBill.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* Every bill for the month, stacked one per page. The Print dialog's
   "Save as PDF" turns it into a file — nothing here generates one. */
export default function PrintAllPage(){
  const { bills, data } = useData();
  const { period, go } = useUi();

  const monthBills = bills.filter(b => b.period === period);
  if(!monthBills.length) return <p className="none">ยังไม่มีบิลเดือนนี้</p>;

  const stale = monthBills.filter(b => {
    const d = billDiff(data, b);
    return d.changes && d.changes.length > 0;
  });
  const total = monthBills.reduce((sum, b) => sum + b.total, 0);

  return <>
    <div className="noprint">
      <button className="back" onClick={() => go({name:"bills"})}>← บิล</button>
      <div className="head"><h1>พิมพ์ทั้งเดือน</h1></div>
      <p className="sub">งวด {period} · <span className="num">{monthBills.length}</span> ใบ ·
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
    <div className="papers">{monthBills.map(b => <BillPaper key={b.id} bill={b} />)}</div>
  </>;
}
