import BillPaper from '../components/BillPaper.jsx';
import { baht } from '../lib/helpers.js';
import { billDiff, buildBill } from '../lib/buildBill.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* One saved bill, with a check against what the same inputs would produce now.
   The comparison is line by line, never on the total. */
export default function BillPage({ id }){
  const { bills, data, saveBill, deleteBill } = useData();
  const { go, openModal } = useUi();

  const b = bills.find(x => x.id === id);
  if(!b) return <p className="none">ไม่พบบิล</p>;

  const d = billDiff(data, b);
  const stale = d.changes && d.changes.length > 0;

  // Delete then regenerate, in one action. The old figures are replaced, not
  // edited, because a bill stores what it charged rather than recomputing.
  const regen = () => {
    const built = buildBill(data, b.lease_id, b.period,
      {prorate: b.items[0].detail.includes("จาก"), prorateDays:null});
    if(built.error){ alert(built.error); return; }
    deleteBill(b.id);
    const fresh = saveBill(built);
    go({name:"bill", id:fresh.id});
  };

  return <>
    <button className="back noprint" onClick={() => go({name:"bills"})}>← บิล</button>
    {stale && (
      <div className="stale noprint">
        <b>ข้อมูลเปลี่ยนไปหลังออกบิลนี้</b><br />
        บิลใบนี้เก็บตัวเลข ณ ตอนที่ออก จึงไม่เปลี่ยนตามข้อมูลที่แก้ทีหลัง
        <ul className="diff">{d.changes.map((c, i) => (
          <li key={i}>{c.label}:{" "}
            <b>{c.from === null ? "ไม่มี" : baht(c.from)}</b> →{" "}
            <b>{c.to === null ? "ไม่มี" : baht(c.to)}</b></li>
        ))}</ul>
        <div className="actions">
          <button className="btn quiet" onClick={() => go({name:"bills"})}>เก็บบิลเดิมไว้</button>
          <button className="btn" onClick={regen}>ออกบิลใหม่</button>
        </div>
        <div style={{fontSize:"12px",color:"var(--muted)",marginTop:"8px"}}>
          ออกใหม่จะได้บิลคนละใบ ถ้าพิมพ์ใบเดิมให้ผู้เช่าไปแล้ว ต้องพิมพ์ใหม่ให้ด้วย</div>
      </div>
    )}
    {d.error && (
      <div className="stale noprint"><b>ตรวจสอบไม่ได้</b><br />{d.error}</div>
    )}

    <BillPaper bill={b} />

    <div className="actions noprint" style={{maxWidth:"640px"}}>
      <button className="btn" onClick={() => window.print()}>พิมพ์</button>
      <button className="btn danger" onClick={() => openModal({kind:"deleteBill", id:b.id})}>ลบบิล</button>
    </div>
  </>;
}
