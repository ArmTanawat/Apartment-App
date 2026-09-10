import { useState } from 'react';
import { useSubmit } from '../../lib/useSubmit.js';
import { get, messageOf } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import UsageChart from '../UsageChart.jsx';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

/* Meter readings are editable from two places: the บันทึกมิเตอร์ page for the
   monthly walk-through, and here, the room page, for fixing one room on its
   own. Both write the same row. */
export function MeterModal({ unitId }){
  const { units, bills, readings, h, createReading, patchReading } = useData();
  const { period, closeModal, bumpMeter } = useUi();
  const u = units.find(x=>x.id===unitId);
  const r = readings.find(x=>x.unit_id===unitId && x.period===period);
  const prev = h.previousReading(unitId);
  const l = h.activeLease(unitId);
  const hasBill = !!(l && bills.some(b=>b.lease_id===l.id && b.period===period));

  const [wp, setWp] = useState(String(r ? r.water_prev : prev.water));
  const [wc, setWc] = useState(r && r.water_curr != null ? String(r.water_curr) : "");
  const [ep, setEp] = useState(String(r ? r.elec_prev : prev.elec));
  const [ec, setEc] = useState(r && r.elec_curr != null ? String(r.elec_curr) : "");
  const { error, busy, run } = useSubmit();

  // The server refuses negative usage too, but with one message for both
  // meters. Water and electricity are corrected separately, so the check that
  // names which one stays here — it decides what to say, not what is stored.
  const save = () => run(
    async () => {
      const row = {water_prev:parseFloat(wp), water_curr:parseFloat(wc),
                   elec_prev:parseFloat(ep),  elec_curr:parseFloat(ec)};
      if(r) await patchReading(r.id, row);
      else await createReading({unit_id:unitId, period, ...row});
      bumpMeter();
      closeModal();
    },
    () => [wp,wc,ep,ec].map(parseFloat).some(isNaN) ? "กรอกตัวเลขให้ครบทั้งสี่ช่อง"
      : parseFloat(wc) < parseFloat(wp) ? "เลขน้ำปัจจุบันน้อยกว่าเลขก่อนหน้า ตรวจดูอีกครั้ง"
      : parseFloat(ec) < parseFloat(ep) ? "เลขไฟปัจจุบันน้อยกว่าเลขก่อนหน้า ตรวจดูอีกครั้ง" : null);

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
        <button className="btn" disabled={busy} onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}

export function EditPrevModal({ unitId }){
  const { units, readings, h, createReading, patchReading } = useData();
  const { period, closeModal, bumpMeter } = useUi();
  const u = units.find(x=>x.id===unitId);
  const r = readings.find(x=>x.unit_id===unitId && x.period===period);
  // The untouched close of the previous period. Editing this month never
  // writes to that row, so it stays available as the value to restore.
  const prev = h.previousReading(unitId);
  const curW = r ? r.water_prev : prev.water;
  const curE = r ? r.elec_prev  : prev.elec;
  const changedW = curW !== prev.water;
  const changedE = curE !== prev.elec;
  const rollW = r ? (r.water_rollover || 0) : 0;
  const rollE = r ? (r.elec_rollover  || 0) : 0;

  const [w, setW] = useState(String(curW));
  const [e, setE] = useState(String(curE));
  const { error, busy, run } = useSubmit();

  const save = () => run(
    async () => {
      const wv = parseFloat(w), ev = parseFloat(e);
      if(!r){
        await createReading({unit_id:unitId, period,
          water_prev:wv, water_curr:null, water_rollover:0,
          elec_prev:ev,  elec_curr:null,  elec_rollover:0});
      } else {
        // Raising the previous number above the current one is a normal thing
        // to want — the old figure was under-recorded, or the meter was
        // swapped. Blocking it forces the current reading to be inflated
        // first, which is backwards. Clear the current reading instead and ask
        // for it again. PUT /readings/:id takes an explicit null for that.
        const next = { water_prev:wv, elec_prev:ev };
        next.water_curr = (r.water_curr !== null && r.water_curr < wv) ? null : r.water_curr;
        next.elec_curr  = (r.elec_curr  !== null && r.elec_curr  < ev) ? null : r.elec_curr;
        // A rollover set against the old figures no longer means anything.
        if(next.water_curr === null) next.water_rollover = 0;
        if(next.elec_curr  === null) next.elec_rollover  = 0;
        await patchReading(r.id, next);
      }
      bumpMeter();
      closeModal();
    },
    () => (isNaN(parseFloat(w)) || isNaN(parseFloat(e))) ? "กรอกตัวเลขให้ครบ" : null);

  const restore = () => run(async () => {
    if(r) await patchReading(r.id, {water_prev:prev.water, elec_prev:prev.elec});
    bumpMeter();
    closeModal();
  });

  const clearRoll = () => run(async () => {
    if(r) await patchReading(r.id, {water_rollover:0, elec_rollover:0});
    bumpMeter();
    closeModal();
  });

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
                disabled={busy} onClick={restore}>คืนค่าจากงวด {prev.from}</button></div>
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
            disabled={busy} onClick={clearRoll}>ยกเลิกครบรอบ</button>
        </div>
      ) : null}

      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" disabled={busy} onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}

/* One room's year, as two charts.
 *
 * Opened from a row of the yearly meter report. It re-asks the year endpoint
 * rather than being handed the numbers, so it cannot show a different figure
 * from the table it was opened from by holding an older copy — the request is
 * one round trip on localhost.
 *
 * There is nothing else in it. The table behind already carries the figures;
 * what this adds is the shape of them over the year, which is the thing a
 * column of numbers is worst at showing. */
export function RoomYearModal({ unitId, year }){
  const { closeModal } = useUi();
  const req = useApi(() => get(`/readings/year/${year}`), [year]);

  if(req.loading) return <Modal><p className="lead">กำลังโหลด…</p></Modal>;
  if(req.error) return (
    <Modal>
      <h3>ดูไม่ได้</h3>
      <ErrBox>{messageOf(req.error)}</ErrBox>
      <div className="actions"><button className="btn ghost" onClick={closeModal}>ปิด</button></div>
    </Modal>
  );

  const room = req.data.rooms.find(r => r.unit_id === unitId);
  if(!room) return (
    <Modal>
      <h3>ห้องนี้ไม่มีข้อมูล</h3>
      <div className="actions"><button className="btn ghost" onClick={closeModal}>ปิด</button></div>
    </Modal>
  );

  return (
    <Modal wide>
      <h3>ห้อง {room.unit_number} · ปี {year}</h3>
      <p className="lead">หน่วยที่ใช้ในแต่ละเดือน · เดือนที่ไม่ได้จดมิเตอร์นับเป็น 0</p>
      <UsageChart values={room.water} label="มิเตอร์น้ำ"
        colour="var(--water-line)" fill="var(--water-fill)" />
      <UsageChart values={room.elec} label="มิเตอร์ไฟ"
        colour="var(--elec-line)" fill="var(--elec-fill)" />
      <div className="actions"><button className="btn ghost" onClick={closeModal}>ปิด</button></div>
    </Modal>
  );
}
