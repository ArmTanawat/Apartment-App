import { useState } from 'react';
import BillPaper from '../components/BillPaper.jsx';
import ErrBox from '../components/ErrBox.jsx';
import { get, messageOf } from '../lib/api.js';
import { billDiff, wasProrated } from '../lib/bills.js';
import { baht } from '../lib/helpers.js';
import { useApi } from '../lib/useApi.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* One saved bill, with a check against what the same inputs would produce now.
 * The comparison is line by line, never on the total. */
export default function BillPage({ id }){
  const { deleteBill, generateBill } = useData();
  const { go, openModal } = useUi();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // The bill and the fresh preview arrive together: a bill that is opened is
  // quietly compared against GET /bills/preview, and the difference is what
  // the banner reports. The user never asks for the comparison.
  const req = useApi(async () => {
    const bill = await get(`/bills/${id}`);
    return { bill, d: await billDiff(bill) };
  }, [id]);

  if(req.loading) return <p className="sub">กำลังโหลด…</p>;
  if(req.error) return <>
    <button className="back noprint" onClick={() => go({name:"bills"})}>← บิล</button>
    <ErrBox>{messageOf(req.error)}</ErrBox>
  </>;

  const { bill: b, d } = req.data;
  const stale = d.changes && d.changes.length > 0;

  // Delete then regenerate, in one action. The old figures are replaced, not
  // edited, because a bill stores what it charged rather than recomputing.
  // A regenerated bill has a new id — if the old one was printed and handed
  // over, it needs reprinting, which the note under the buttons says.
  const regen = async () => {
    setBusy(true); setError(null);
    try {
      await deleteBill(b.id);
      const fresh = await generateBill({ lease_id: b.lease_id, period: b.period,
        prorate: wasProrated(b) });
      go({name:"bill", id:fresh.id});
    } catch (e) {
      setError(messageOf(e));
    } finally { setBusy(false); }
  };

  return <>
    <button className="back noprint" onClick={() => go({name:"bills"})}>← บิล</button>
    <ErrBox>{error}</ErrBox>
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
          <button className="btn" disabled={busy} onClick={regen}>ออกบิลใหม่</button>
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
