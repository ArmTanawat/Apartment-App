import { useEffect, useMemo, useState } from 'react';
import { get, messageOf } from '../../lib/api.js';
import { periodLabel, rolloverAmount } from '../../lib/helpers.js';
import { averagesFrom, buildPreview, downloadTemplate, payloadOf } from '../../lib/meterImport.js';
import { useApi } from '../../lib/useApi.js';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

const MARK = { ok: '✅', warn: '⚠️', error: '❌', skip: '—' };

/* นำเข้ามิเตอร์ — what the file would do, room by room, before anything is
   saved. Nothing reaches the server until ยืนยันนำเข้า, and then all of it
   goes in one transaction or none of it does. */
export function MeterImportModal({ parsed, fileName }){
  const { units, readings, bills, settings, h, importReadings } = useData();
  const { period, closeModal, bumpMeter } = useUi();

  // A room's usual usage, for the "unusually high" warning. Last year too,
  // because January's three months before are in it.
  const year = Number(period.slice(0, 4));
  const history = useApi(() => Promise.all([get(`/readings/year/${year}`), get(`/readings/year/${year - 1}`)]),
    [year]);
  const averages = useMemo(() => history.data ? averagesFrom(history.data, period) : new Map(),
    [history.data, period]);

  const [fixes, setFixes] = useState({});
  const [unticked, setUnticked] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const rows = buildPreview(parsed, {
    units,
    readingFor: id => readings.find(r => r.unit_id === id && r.period === period),
    previousOf: id => h.previousReading(id),
    occupied: id => h.leasesInPeriod(id, period).length > 0,
    billed: id => { const u = units.find(x => x.id === id);
      return bills.some(b => b.period === period && b.unit_number === u.unit_number); },
    rollover: kind => rolloverAmount(settings, kind),
    averages,
  }, fixes);

  const tickable = r => (r.status === 'ok' || r.status === 'warn') && r.importable;
  const ticked = rows.filter(r => tickable(r) && !unticked[r.key]);
  const counts = { ok: 0, warn: 0, error: 0, skip: 0 };
  rows.forEach(r => { counts[r.status]++; });
  const untouched = units.length - new Set(rows.filter(r => r.unit).map(r => r.unit.id)).size;

  const setFix = (key, kind, value) =>
    setFixes(f => ({ ...f, [key]: { ...(f[key] || {}), [kind]: value || undefined } }));

  const confirm = async () => {
    setError(null); setBusy(true);
    try {
      const r = await importReadings({ period, rows: payloadOf(ticked) });
      bumpMeter();
      setDone(r);
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  };

  if(done) return (
    <Modal>
      <h3>นำเข้าแล้ว</h3>
      <p className="lead">บันทึกเลขมิเตอร์ <b className="num">{done.saved}</b> ห้อง งวด {periodLabel(period)}
        ยังไม่ได้ออกบิล ไปออกบิลที่หน้าบิลตามปกติ</p>
      <div className="actions"><button className="btn" onClick={closeModal}>ปิด</button></div>
    </Modal>
  );

  const meterCell = (r, kind) => {
    const m = r[kind];
    if(!m) return <td className="r" style={{color:"var(--muted)"}}>—</td>;
    if(m.skipped) return <td className="r" style={{color:"var(--muted)"}}>ข้าม</td>;
    return (
      <td className="r num">
        {m.prev} → <b>{m.value}</b>
        <span className="iused">{m.used === null ? "?" : m.used} หน่วย</span>
        {m.below && (
          <select className="ifix" value={m.fix || ""} onChange={e => setFix(r.key, kind, e.target.value)}>
            <option value="">— ไม่นำเข้า —</option>
            <option value="rollover">ครบรอบ</option>
            <option value="new_meter">เปลี่ยนมิเตอร์</option>
          </select>
        )}
      </td>
    );
  };

  return (
    <Modal className="xwide">
      <h3>นำเข้ามิเตอร์ งวด {periodLabel(period)}</h3>
      <p className="lead">{fileName} · ยังไม่ได้บันทึกอะไร ตรวจแล้วกดยืนยันนำเข้า
        {untouched > 0 ? <> · ห้องที่ไม่อยู่ในไฟล์ <span className="num">{untouched}</span> ห้องไม่ถูกแตะ</> : null}</p>
      <div className="isum">
        <span>✅ ปกติ <b className="num">{counts.ok}</b></span>
        <span>⚠️ ตรวจก่อน <b className="num">{counts.warn}</b></span>
        <span>❌ ข้ามเพราะผิด <b className="num">{counts.error}</b></span>
        {counts.skip > 0 && <span>— ว่างทั้งแถว <b className="num">{counts.skip}</b></span>}
      </div>
      <ErrBox>{error}</ErrBox>
      <table className="itable">
        <thead><tr><th></th><th>ห้อง</th><th className="r">น้ำ</th><th className="r">ไฟ</th><th>สถานะ</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className={"is-" + r.status}>
              <td><input type="checkbox" disabled={!tickable(r)}
                checked={tickable(r) && !unticked[r.key]}
                onChange={() => setUnticked(u => ({ ...u, [r.key]: !u[r.key] }))} /></td>
              <td className="num">{r.room || "—"}</td>
              {meterCell(r, "w")}
              {meterCell(r, "e")}
              <td className="inote">{MARK[r.status]} {r.notes.length ? r.notes.join(" · ") : "ปกติ"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" disabled={busy || !ticked.length} onClick={confirm}>
          {busy ? "กำลังบันทึก…" : `ยืนยันนำเข้า ${ticked.length} ห้อง`}</button>
      </div>
    </Modal>
  );
}

/* (?) beside นำเข้าจากไฟล์ — the format, with an example, in Thai. Closes on
   ✕, Esc, or a click outside (the veil, as every dialog does). */
export function MeterImportHelpModal(){
  const { units, h } = useData();
  const { period, closeModal } = useUi();
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = e => { if(e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeModal]);

  return (
    <Modal>
      <button className="xclose" aria-label="ปิด" onClick={closeModal}>✕</button>
      <h3>นำเข้ามิเตอร์จากไฟล์</h3>
      <p className="lead">ไฟล์ <b>.csv</b> หรือ <b>.xlsx</b> · 3 คอลัมน์ เรียงตามนี้:
        <b> room, water, electricity</b> (ห้อง, น้ำ, ไฟ)</p>
      <table className="itable" style={{marginBottom:"10px"}}>
        <thead><tr><th>room</th><th>water</th><th>electricity</th></tr></thead>
        <tbody className="num">
          <tr><td>102</td><td>1520</td><td>3480</td></tr>
          <tr><td>103</td><td>980</td><td></td></tr>
          <tr><td>104</td><td></td><td></td></tr>
        </tbody>
      </table>
      <pre className="icsv">{"room,water,electricity\n102,1520,3480\n103,980,\n104,,"}</pre>
      <ul className="ihelp">
        <li>ใส่<b>เลขที่อ่านได้จากมิเตอร์ตอนนี้</b> ไม่ใช่จำนวนหน่วยที่ใช้ และไม่ใช่บาท</li>
        <li><b>0</b> บันทึกเป็น 0</li>
        <li>ช่องว่าง = ข้ามมิเตอร์นั้น (ห้อง 103 บันทึกแค่น้ำ)</li>
        <li>ว่างทั้งน้ำและไฟ = ข้ามห้องนั้น (ห้อง 104)</li>
        <li>ห้องที่ไม่มีในไฟล์ ไม่ถูกแตะ</li>
        <li>นำเข้าเข้างวดที่เลือกอยู่ตอนนี้ — {periodLabel(period)}</li>
        <li>ยังไม่บันทึกจนกว่าจะกดยืนยันในหน้าตรวจ</li>
      </ul>
      <ErrBox>{error}</ErrBox>
      <div className="actions">
        <button className="btn quiet" onClick={() =>
          downloadTemplate(units, id => h.previousReading(id), period).catch(e => setError(messageOf(e)))}>
          ดาวน์โหลดแม่แบบ</button>
        <button className="btn" onClick={closeModal}>เข้าใจแล้ว</button>
      </div>
    </Modal>
  );
}
