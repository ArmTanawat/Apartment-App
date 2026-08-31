import { useState } from 'react';
import BillPaper from '../components/BillPaper.jsx';
import ErrBox from '../components/ErrBox.jsx';
import { get, messageOf } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* One receipt, for one bill.
 *
 * The note is the only thing on it that can be changed, and only before it is
 * handed over. Everything else — the number, the lines, the total, the date —
 * is what the tenant will be holding. */
export default function ReceiptPage({ id }){
  const { updateReceiptNote } = useData();
  const { go } = useUi();
  const [note, setNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const req = useApi(() => get(`/bills/${id}`), [id]);

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

  return <>
    <button className="back noprint" onClick={() => go({name:"bills"})}>← บิล</button>
    <ErrBox>{error}</ErrBox>

    <BillPaper bill={b} receipt={{ ...b.receipt, note: shown.trim() || null }} />

    <div className="noprint" style={{maxWidth:"640px",marginTop:"18px"}}>
      <div className="field">
        <label>หมายเหตุบนใบเสร็จนี้</label>
        <input value={shown} onChange={e => setNote(e.target.value)}
          placeholder="เช่น รับเป็นเงินสด หรือ โอนเข้าบัญชีวันที่ 3" />
        <div className="hint">เขียนเรื่องของการจ่ายครั้งนี้โดยเฉพาะ
          ไม่ใช่ข้อความที่ขึ้นทุกใบ ซึ่งตั้งไว้ที่หน้าตั้งค่า</div>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => window.print()}>พิมพ์</button>
        <button className="btn quiet" disabled={saving || shown === (b.receipt.note || "")}
          onClick={saveNote}>บันทึกหมายเหตุ</button>
      </div>
      <p className="sub" style={{fontSize:"13px",marginTop:"10px"}}>
        เลขที่ <b className="num">{b.receipt.receipt_no}</b> ออกไปแล้ว ยกเลิกไม่ได้
        และจะไม่ถูกใช้ซ้ำกับใบอื่น</p>
    </div>
  </>;
}
