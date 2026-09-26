import { useState } from 'react';
import BillPaper from '../components/BillPaper.jsx';
import ErrBox from '../components/ErrBox.jsx';
import Pager from '../components/Pager.jsx';
import { get, messageOf } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* One receipt, for one bill.
 *
 * The note is the only thing stored on it. Everything else — the room, the
 * period, the lines, the total — is read off the bill each time the page is
 * drawn, which is what makes a corrected bill produce a corrected receipt
 * without anything here having to notice.
 *
 * ยกเลิกใบเสร็จ removes it and nothing else. A receipt carries no number, so
 * cancelling spends nothing and issuing again is the same act as the first
 * time. It is still worth asking, because a tenant may be holding the page. */
export default function ReceiptPage({ id }){
  const { bills, updateReceiptNote, settings } = useData();
  // Off is the normal state. The undo still exists and the route still works —
  // this hides the way in, so a receipt reads as final to whoever is issuing
  // them and stays correctable by whoever knows where the switch is.
  const dev = !!Number(settings.developer_mode);
  const { go, openModal } = useUi();
  const [note, setNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const req = useApi(() => get(`/bills/${id}`), [id]);

  // Which bills of this month have a receipt, so ← → steps between receipts
  // rather than onto bills that have none. Stepping onto one would land on
  // "บิลใบนี้ยังไม่ได้ออกใบเสร็จ" — a page with nothing on it to read, and
  // early in the month most of the list is that.
  const period = req.data ? req.data.period : null;
  const issuedReq = useApi(() => get(`/receipts?period=${period}`),
    [period], { skip: !period });

  if(req.loading) return <p className="sub">กำลังโหลด…</p>;
  if(req.error) return <>
    <button className="back noprint" onClick={() => go({name:"bills"})}>← บิล</button>
    <ErrBox>{messageOf(req.error)}</ErrBox>
  </>;

  const b = req.data;
  if(!b.receipt) return <>
    <button className="back noprint" onClick={() => go({name:"bills"})}>← บิล</button>
    <p className="none">บิลใบนี้ยังไม่ได้ออกใบเสร็จ</p>
  </>;

  const shown = note ?? (b.receipt.note || "");

  const saveNote = async () => {
    setSaving(true); setError(null);
    try { await updateReceiptNote(b.receipt.id, shown.trim() || null); req.refresh(); setNote(null); }
    catch (e) { setError(messageOf(e)); }
    finally { setSaving(false); }
  };

  const withReceipt = new Set((issuedReq.data || []).map(r => r.bill_id));
  const siblings = bills.filter(x => x.period === b.period && withReceipt.has(x.id))
    .map(x => ({ id: x.id, label: x.unit_number, title: `ใบเสร็จห้อง ${x.unit_number}` }));

  return <>
    <div className="pagebar noprint">
      <button className="back" onClick={() => go({name:"bills"})}>← บิล</button>
      <Pager items={siblings} current={b.id} onGo={bid => go({name:"receipt", id:bid})} />
    </div>
    <ErrBox>{error}</ErrBox>

    <BillPaper bill={b} receipt={{ ...b.receipt, note: shown.trim() || null }} />

    <div className="noprint" style={{maxWidth:"640px",marginTop:"18px"}}>
      <div className="field">
        <label>หมายเหตุบนใบเสร็จนี้</label>
        <input value={shown} onChange={e => setNote(e.target.value)} />
        <div className="hint">เขียนเรื่องของการจ่ายครั้งนี้โดยเฉพาะ
          ไม่ใช่ข้อความที่ขึ้นทุกใบ ซึ่งตั้งไว้ที่หน้าตั้งค่า</div>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => window.print()}>พิมพ์</button>
        <button className="btn quiet" disabled={saving || shown === (b.receipt.note || "")}
          onClick={saveNote}>บันทึกหมายเหตุ</button>
        {dev && <button className="btn quiet"
          onClick={() => openModal({kind:"cancelReceipt", id})}>ยกเลิกใบเสร็จ</button>}
      </div>
      {dev && (
        <p className="sub" style={{fontSize:"13px",marginTop:"10px"}}>
          ใบเสร็จนี้ไม่มีเลขที่กำกับ ตัวเลขบนใบมาจากบิลงวด {b.period} ห้อง {b.unit_number}
          ถ้าแก้บิลใบนั้นแล้วออกใหม่ ใบเสร็จจะถูกยกเลิกไปด้วย แล้วออกใหม่ได้ทันที</p>
      )}
    </div>
  </>;
}
