import { useState } from 'react';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

/* Meter readings are editable from two places: the บันทึกมิเตอร์ page for the
   monthly walk-through, and here, the room page, for fixing one room on its
   own. Both write the same row. */
export function MeterModal({ unitId }){
  const { units, bills, readings, h, upsertReading } = useData();
  const { period, closeModal, bumpMeter } = useUi();
  const u = units.find(x=>x.id===unitId);
  const r = readings.find(x=>x.unit_id===unitId && x.period===period);
  const prev = h.previousReading(unitId, period);
  const l = h.activeLease(unitId);
  const hasBill = !!(l && bills.some(b=>b.lease_id===l.id && b.period===period));

  const [wp, setWp] = useState(String(r ? r.water_prev : prev.water));
  const [wc, setWc] = useState(r && r.water_curr != null ? String(r.water_curr) : "");
  const [ep, setEp] = useState(String(r ? r.elec_prev : prev.elec));
  const [ec, setEc] = useState(r && r.elec_curr != null ? String(r.elec_curr) : "");
  const [error, setError] = useState(null);

  const save = () => {
    const a = parseFloat(wp), b = parseFloat(wc), c = parseFloat(ep), d = parseFloat(ec);
    if([a,b,c,d].some(isNaN)) return setError("กรอกตัวเลขให้ครบทั้งสี่ช่อง");
    if(b < a) return setError("เลขน้ำปัจจุบันน้อยกว่าเลขก่อนหน้า ตรวจดูอีกครั้ง");
    if(d < c) return setError("เลขไฟปัจจุบันน้อยกว่าเลขก่อนหน้า ตรวจดูอีกครั้ง");
    upsertReading(unitId, period, () =>
      ({water_prev:a, water_curr:b, elec_prev:c, elec_curr:d}));
    bumpMeter();
    closeModal();
  };

  return (
    <Modal>
      <h3>{r ? "แก้ไขมิเตอร์" : "จดมิเตอร์"} ห้อง {u.unit_number}</h3>
      <p className="lead">งวด {period}{prev.from && !r ? ` · เลขก่อนหน้ามาจากงวด ${prev.from}` : ``}</p>
      <ErrBox>{error}</ErrBox>
      {hasBill && (
        <div className="warn">เดือนนี้ออกบิลไปแล้ว การแก้ตรงนี้จะยังไม่เปลี่ยนบิล
          ต้องไปกดออกบิลใหม่ที่หน้าบิลอีกครั้ง</div>
      )}
      <div className="two">
        <div className="field"><label>น้ำ — เลขก่อนหน้า</label>
          <input className="num" value={wp} onChange={e=>setWp(e.target.value)} /></div>
        <div className="field"><label>น้ำ — เลขปัจจุบัน</label>
          <input className="num" value={wc} placeholder="—" onChange={e=>setWc(e.target.value)} /></div>
      </div>
      <div className="two">
        <div className="field"><label>ไฟ — เลขก่อนหน้า</label>
          <input className="num" value={ep} onChange={e=>setEp(e.target.value)} /></div>
        <div className="field"><label>ไฟ — เลขปัจจุบัน</label>
          <input className="num" value={ec} placeholder="—" onChange={e=>setEc(e.target.value)} /></div>
      </div>
      <div className="field"><div className="hint">มิเตอร์เดินหน้าอย่างเดียว
        เลขปัจจุบันน้อยกว่าเลขก่อนหน้าไม่ได้</div></div>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}

export function EditPrevModal({ unitId }){
  const { units, readings, h, upsertReading } = useData();
  const { period, closeModal, bumpMeter } = useUi();
  const u = units.find(x=>x.id===unitId);
  const r = readings.find(x=>x.unit_id===unitId && x.period===period);
  // The untouched close of the previous period. Editing this month never
  // writes to that row, so it stays available as the value to restore.
  const prev = h.previousReading(unitId, period);
  const curW = r ? r.water_prev : prev.water;
  const curE = r ? r.elec_prev  : prev.elec;
  const changedW = curW !== prev.water;
  const changedE = curE !== prev.elec;
  const rollW = r ? (r.water_rollover || 0) : 0;
  const rollE = r ? (r.elec_rollover  || 0) : 0;

  const [w, setW] = useState(String(curW));
  const [e, setE] = useState(String(curE));
  const [error, setError] = useState(null);

  const save = () => {
    const wv = parseFloat(w), ev = parseFloat(e);
    if(isNaN(wv) || isNaN(ev)) return setError("กรอกตัวเลขให้ครบ");
    upsertReading(unitId, period, existing => {
      if(!existing) return {water_prev:wv, water_curr:null, water_rollover:0,
                            elec_prev:ev,  elec_curr:null,  elec_rollover:0};
      // Raising the previous number above the current one is a normal thing to
      // want — the old figure was under-recorded, or the meter was swapped.
      // Blocking it forces the current reading to be inflated first, which is
      // backwards. Clear the current reading instead and ask for it again.
      const next = { water_prev:wv, elec_prev:ev };
      next.water_curr = (existing.water_curr !== null && existing.water_curr < wv)
        ? null : existing.water_curr;
      next.elec_curr = (existing.elec_curr !== null && existing.elec_curr < ev)
        ? null : existing.elec_curr;
      // A rollover set against the old figures no longer means anything.
      if(next.water_curr === null) next.water_rollover = 0;
      if(next.elec_curr  === null) next.elec_rollover  = 0;
      return next;
    });
    bumpMeter();
    closeModal();
  };

  const restore = () => {
    upsertReading(unitId, period, existing => existing
      ? {water_prev:prev.water, elec_prev:prev.elec} : null);
    bumpMeter();
    closeModal();
  };

  const clearRoll = () => {
    upsertReading(unitId, period, existing => existing
      ? {water_rollover:0, elec_rollover:0} : null);
    bumpMeter();
    closeModal();
  };

  return (
    <Modal>
      <h3>แก้เลขก่อนหน้า ห้อง {u.unit_number}</h3>
      <p className="lead">ปกติเลขนี้ดึงมาจากงวดก่อนเอง แก้เมื่อมิเตอร์ถูกเปลี่ยนใหม่
        หรืองวดก่อนพิมพ์ผิด</p>
      <ErrBox>{error}</ErrBox>

      {prev.from ? (
        <div className="warn">
          <b>งวด {prev.from} ปิดที่</b> — น้ำ <span className="num">{prev.water}</span>
          {" "}· ไฟ <span className="num">{prev.elec}</span><br />
          เลขนี้เก็บอยู่ในงวดก่อนและไม่ถูกแก้ไม่ว่าจะทำอะไรกับงวดนี้
          {(changedW || changedE) && (
            <div style={{marginTop:"8px"}}>
              <button className="btn quiet" style={{padding:"5px 12px",fontSize:"13px"}}
                onClick={restore}>คืนค่าจากงวด {prev.from}</button></div>
          )}
        </div>
      ) : <div className="warn">ห้องนี้ยังไม่มีประวัติงวดก่อน</div>}

      <div className="two">
        <div className="field"><label>น้ำ — เลขก่อนหน้า</label>
          <input className="num" value={w} onChange={ev=>setW(ev.target.value)} />
          {changedW && <div className="hint" style={{color:"var(--vacant)"}}>ถูกแก้จาก {prev.water}</div>}</div>
        <div className="field"><label>ไฟ — เลขก่อนหน้า</label>
          <input className="num" value={e} onChange={ev=>setE(ev.target.value)} />
          {changedE && <div className="hint" style={{color:"var(--vacant)"}}>ถูกแก้จาก {prev.elec}</div>}</div>
      </div>

      {(rollW || rollE) ? (
        <div className="warn">
          ตั้งไว้ว่ามิเตอร์ครบรอบ{rollW ? <> · น้ำ +<span className="num">{rollW}</span></> : null}
          {rollE ? <> · ไฟ +<span className="num">{rollE}</span></> : null}
          <button className="btn quiet" style={{marginLeft:"10px",padding:"5px 12px",fontSize:"13px"}}
            onClick={clearRoll}>ยกเลิกครบรอบ</button>
        </div>
      ) : null}

      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}
