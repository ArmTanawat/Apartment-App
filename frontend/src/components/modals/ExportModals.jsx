import { useEffect, useState } from 'react';
import { get, messageOf } from '../../lib/api.js';
import { periodLabel } from '../../lib/helpers.js';
import { useApi } from '../../lib/useApi.js';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

/* Export เป็นรูปภาพ — the month's bills and receipts as one PNG per room, for
 * sending to tenants. The pictures are made by the desktop shell
 * (electron/export.js) from the printed page; this dialog chooses the folder,
 * asks before writing over an earlier export, and says how far it has got.
 *
 * Read-only: nothing about a bill or a receipt changes. */
export function ExportModal({ period }){
  const { bills, settings, patchSettings } = useData();
  const { closeModal } = useUi();
  const ex = window.exporter || null;

  const [folder, setFolder] = useState(settings.export_folder || "");
  const [names, setNames] = useState(null);
  const [step, setStep] = useState("setup");
  const [conflict, setConflict] = useState([]);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const billCount = bills.filter(b => b.period === period).length;
  const receipts = useApi(() => get(`/receipts?period=${period}`), [period]);
  const receiptCount = receipts.data ? receipts.data.length : null;

  useEffect(() => {
    if(!ex) return;
    ex.names(period).then(setNames).catch(() => {});
    return ex.onProgress(setProgress);
  }, [ex, period]);

  if(!ex) return (
    <Modal>
      <h3>Export เป็นรูปภาพ</h3>
      <p className="lead">ใช้ได้ในโปรแกรมบนเครื่องเท่านั้น ไม่ได้ผ่านเบราว์เซอร์
        เปิดโปรแกรม Apartment Manager แล้วกดปุ่มนี้อีกครั้ง
        หรือใช้ "พิมพ์ทั้งเดือน" แล้วบันทึกเป็น PDF แทน</p>
      <div className="actions"><button className="btn" onClick={closeModal}>ปิด</button></div>
    </Modal>
  );

  // Remembered per building, as soon as it is chosen, so the next month
  // starts from the same place.
  const pick = async () => {
    const f = await ex.pickFolder(folder);
    if(!f) return null;
    setFolder(f);
    try { await patchSettings({ export_folder: f }); } catch { /* the export still works; it just will not be offered next time */ }
    return f;
  };

  const run = async (overwrite = false) => {
    setError(null);
    const f = folder || await pick();
    if(!f) return;
    setStep("running"); setProgress(null);
    try {
      const r = await ex.run({ period, folder: f, overwrite });
      if(r.error){ setError(r.error); setStep("setup"); return; }
      if(r.conflict){ setConflict(r.conflict); setStep("conflict"); return; }
      setResult(r); setStep("done");
    } catch (e) { setError(messageOf(e)); setStep("setup"); }
  };

  if(step === "running") return (
    <Modal sticky>
      <h3>กำลัง export</h3>
      <p className="lead">กำลัง export <b className="num">{progress ? progress.done : 0}</b>
        {" / "}<b className="num">{progress ? progress.total : "…"}</b> ไฟล์ · อย่าเพิ่งปิดโปรแกรม</p>
      <div className="mprogress"><div className="bar">
        <i style={{width: progress && progress.total ? `${Math.round(progress.done / progress.total * 100)}%` : "0%"}} />
      </div></div>
    </Modal>
  );

  if(step === "conflict") return (
    <Modal>
      <h3>มีโฟลเดอร์นี้อยู่แล้ว</h3>
      <p className="lead">ใน {folder} มี <b>{conflict.join(", ")}</b> จาก export ครั้งก่อน
        เขียนทับจะลบรูปเดิมในโฟลเดอร์นั้นก่อน แล้วสร้างใหม่ทั้งหมด
        ไฟล์ที่ไม่ใช่รูปจะไม่ถูกแตะ</p>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" onClick={() => run(true)}>เขียนทับ</button>
      </div>
    </Modal>
  );

  if(step === "done") return (
    <Modal>
      <h3>Export เสร็จแล้ว</h3>
      <p className="lead">ใน {result.folder}</p>
      <ul className="ihelp" style={{marginBottom:"8px"}}>
        <li><b>{result.bills.name}</b> — บิล <span className="num">{result.bills.count}</span> ไฟล์</li>
        <li>{result.receipts
          ? <><b>{result.receipts.name}</b> — ใบเสร็จ <span className="num">{result.receipts.count}</span> ไฟล์</>
          : "ยังไม่มีใบเสร็จ ไม่ได้สร้างโฟลเดอร์ใบเสร็จ"}</li>
      </ul>
      <div className="actions">
        <button className="btn ghost" onClick={() => ex.openFolder(result.bills.dir)}>เปิดโฟลเดอร์</button>
        <button className="btn" onClick={closeModal}>ปิด</button>
      </div>
    </Modal>
  );

  return (
    <Modal>
      <h3>Export เป็นรูปภาพ</h3>
      <p className="lead">บิลและใบเสร็จงวด {periodLabel(period)} เป็นไฟล์ PNG หนึ่งห้องหนึ่งไฟล์
        ชื่อไฟล์ตามเลขห้อง เช่น 102.png หน้าตาเหมือนที่พิมพ์ รวม QR ชำระเงิน
        ส่งให้ผู้เช่าทางไลน์ได้เลย</p>
      <ErrBox>{error}</ErrBox>
      <div className="field"><label>เก็บไว้ที่</label>
        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
          <span className="num" style={{flex:1,fontSize:"13px",wordBreak:"break-all"}}>{folder || "ยังไม่ได้เลือก"}</span>
          <button className="btn quiet" onClick={pick}>เลือกโฟลเดอร์…</button>
        </div></div>
      <ul className="ihelp">
        <li><b>{names ? names.bills : "…"}</b> — บิล <span className="num">{billCount}</span> ไฟล์</li>
        <li>{receiptCount === null ? "…" : receiptCount > 0
          ? <><b>{names ? names.receipts : "…"}</b> — ใบเสร็จ <span className="num">{receiptCount}</span> ไฟล์</>
          : "ยังไม่มีใบเสร็จ — จะไม่สร้างโฟลเดอร์ใบเสร็จ"}</li>
      </ul>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" disabled={!billCount} onClick={() => run(false)}>Export</button>
      </div>
    </Modal>
  );
}
