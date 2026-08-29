import { useState } from 'react';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { TODAY, useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

export function MoveInModal({ unitId }){
  const { units, tenants, h, addTenant, addLease } = useData();
  const { closeModal } = useUi();
  const u = units.find(x=>x.id===unitId);

  const [sel, setSel] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddr, setNewAddr] = useState("");
  const [newIdCard, setNewIdCard] = useState("");
  const [start, setStart] = useState(TODAY);
  const [rent, setRent] = useState(String(u.base_rent));
  const [dep, setDep] = useState(String(u.base_rent*2));
  const [error, setError] = useState(null);

  const picked = sel && sel !== "new" ? tenants.find(x=>x.id===parseInt(sel,10)) : null;
  const missing = picked
    ? [!picked.phone?"เบอร์โทร":null, !picked.address?"ที่อยู่":null].filter(Boolean) : [];

  const save = () => {
    const r = parseFloat(rent);
    const d = parseFloat(dep);
    if(!sel)   return setError("เลือกผู้เช่าก่อน");
    if(!start) return setError("ใส่วันเข้าอยู่");

    // The same overlap test the API runs. It compares dates, not "today".
    const clash = h.overlapping(unitId, start, null);
    if(clash){
      const who = h.tenantOf(clash.id);
      const until = clash.end_date ? ` (ถึง ${clash.end_date})` : "";
      return setError(`ห้อง ${u.unit_number} มีผู้เช่าอยู่แล้ว — ${who.full_name}${until}`);
    }

    let tid;
    if(sel === "new"){
      const nm = newName.trim();
      if(!nm) return setError("ใส่ชื่อผู้เช่าใหม่");
      // Written straight into the shared tenants list, so the ผู้เช่า page shows
      // this person immediately — no separate step to register them.
      tid = addTenant({ full_name:nm, phone:newPhone.trim(),
        address:newAddr.trim(), id_card:newIdCard.trim() });
    } else tid = parseInt(sel,10);

    addLease({tenant_id:tid, unit_id:unitId, start_date:start,
      end_date:null, monthly_rent:r, deposit:d});
    closeModal();
  };

  return (
    <Modal>
      <h3>ย้ายเข้าห้อง {u.unit_number}</h3>
      <p className="lead">ค่าเช่าเติมมาจากค่าเช่ามาตรฐานของห้อง แก้ได้ถ้าตกลงกันไว้ต่างจากนี้</p>
      <ErrBox>{error}</ErrBox>
      <div className="field"><label>ผู้เช่า</label>
        <select value={sel} onChange={e=>setSel(e.target.value)}>
          <option value="">— เลือกผู้เช่า —</option>
          {tenants.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
          <option value="new">+ เพิ่มผู้เช่าใหม่</option>
        </select>
      </div>
      {picked && (
        <div className="warn">
          <b>{picked.full_name}</b><br />
          โทร {picked.phone || "—"}<br />ที่อยู่ {picked.address || "—"}
          {missing.length > 0 && <><br /><span style={{color:"var(--vacant)"}}>
            ยังไม่มี {missing.join(" และ ")} ซึ่งต้องขึ้นบนใบแจ้งหนี้
            — แก้ได้ที่หน้าผู้เช่า</span></>}
        </div>
      )}
      {sel === "new" && (
        <div>
          <div className="warn">ชื่อ เบอร์ และที่อยู่ทั้งหมดนี้จะขึ้นบนใบแจ้งหนี้
            กรอกให้ครบตั้งแต่ตอนนี้จะได้ไม่ต้องกลับมาแก้ตอนออกบิล</div>
          <div className="field"><label>ชื่อ — นามสกุล</label>
            <input placeholder="สมชาย ใจดี" value={newName} onChange={e=>setNewName(e.target.value)} /></div>
          <div className="field"><label>เบอร์โทร</label>
            <input className="num" placeholder="081-234-5678" value={newPhone} onChange={e=>setNewPhone(e.target.value)} /></div>
          <div className="field"><label>ที่อยู่</label>
            <input placeholder="12/3 ถ.สุขุมวิท กรุงเทพฯ" value={newAddr} onChange={e=>setNewAddr(e.target.value)} /></div>
          <div className="field"><label>เลขบัตรประชาชน</label>
            <input className="num" placeholder="1234567890123" value={newIdCard} onChange={e=>setNewIdCard(e.target.value)} /></div>
        </div>
      )}
      <div className="two">
        <div className="field"><label>วันเข้าอยู่</label>
          <input type="date" value={start} onChange={e=>setStart(e.target.value)} /></div>
        <div className="field"><label>ค่าเช่า/เดือน</label>
          <input className="num" value={rent} onChange={e=>setRent(e.target.value)} /></div>
      </div>
      <div className="field"><label>เงินมัดจำ</label>
        <input className="num" value={dep} onChange={e=>setDep(e.target.value)} />
        <div className="hint">คืนเต็มจำนวนตอนย้ายออก ค่าเสียหายคิดแยกเป็นค่าใช้จ่ายครั้งเดียว</div>
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" onClick={save}>ย้ายเข้า</button>
      </div>
    </Modal>
  );
}

export function MoveOutModal({ unitId }){
  const { units, h, updateLease } = useData();
  const { closeModal } = useUi();
  const u = units.find(x=>x.id===unitId);
  const l = h.activeLease(unitId);
  const t = h.tenantOf(l.id);
  const [end, setEnd] = useState(TODAY);
  const [error, setError] = useState(null);

  const monthEnd = () => {
    const d = new Date(TODAY);
    return new Date(d.getFullYear(), d.getMonth()+1, 1).toISOString().slice(0,10);
  };

  const save = () => {
    if(!end) return setError("ใส่วันย้ายออก");
    if(end < l.start_date) return setError("วันย้ายออกต้องไม่ก่อนวันเข้าอยู่");
    updateLease(l.id, {end_date:end});
    closeModal();
  };

  return (
    <Modal>
      <h3>ย้ายออก</h3>
      <p className="lead">{t.full_name} · ห้อง {u.unit_number}</p>
      <ErrBox>{error}</ErrBox>
      {/* Not วันย้ายออก, which is ambiguous about whether the room is free that
          day. The stored value is the day the room becomes available. */}
      <div className="field"><label>ห้องว่างตั้งแต่วันที่</label>
        <input type="date" value={end} onChange={e=>setEnd(e.target.value)} />
        <div className="hint">ใส่วันนี้ = ห้องว่างทันที ให้คนใหม่เข้าวันเดียวกันได้เลย</div>
      </div>
      <div className="actions" style={{marginTop:"-4px"}}>
        <button className="btn quiet" onClick={() => setEnd(TODAY)}>ว่างวันนี้</button>
        <button className="btn quiet" onClick={() => setEnd(monthEnd())}>สิ้นเดือนนี้</button>
      </div>
      <div className="warn">สัญญาและบิลย้อนหลังยังอยู่ครบ ค่าใช้จ่ายที่ค้างของเดือนนี้ยังออกบิลให้ผู้เช่ารายนี้ได้</div>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" onClick={save}>ย้ายออก</button>
      </div>
    </Modal>
  );
}

export function EditLeaseModal({ leaseId }){
  const { leases, h, updateLease } = useData();
  const { closeModal } = useUi();
  const l = leases.find(x=>x.id===leaseId);
  const t = h.tenantOf(leaseId);
  const [start, setStart] = useState(l.start_date);
  const [rent, setRent] = useState(String(l.monthly_rent));
  const [dep, setDep] = useState(String(l.deposit));
  const [error, setError] = useState(null);

  const save = () => {
    const r = parseFloat(rent), d = parseFloat(dep);
    if(!start) return setError("ใส่วันเข้าอยู่");
    if(isNaN(r) || r < 0) return setError("ค่าเช่าต้องเป็นตัวเลข");
    if(isNaN(d) || d < 0) return setError("มัดจำต้องเป็นตัวเลข");
    if(l.end_date && start >= l.end_date)
      return setError("วันเข้าอยู่ต้องก่อนวันที่ห้องว่าง");

    // Moving the start date can push this lease into someone else's stay.
    const clash = leases.find(x => x.unit_id===l.unit_id && x.id!==leaseId
      && (!x.end_date || x.end_date > start)
      && (!l.end_date || x.start_date < l.end_date));
    if(clash) return setError(`ช่วงวันที่ทับกับสัญญาของ ${h.tenantOf(clash.id).full_name}`);

    updateLease(leaseId, {start_date:start, monthly_rent:r, deposit:d});
    closeModal();
  };

  return (
    <Modal>
      <h3>แก้สัญญาเช่า</h3>
      <p className="lead">{t.full_name}</p>
      <ErrBox>{error}</ErrBox>
      <div className="field"><label>วันเข้าอยู่</label>
        <input type="date" value={start} onChange={e=>setStart(e.target.value)} /></div>
      <div className="two">
        <div className="field"><label>ค่าเช่า/เดือน</label>
          <input className="num" value={rent} onChange={e=>setRent(e.target.value)} /></div>
        <div className="field"><label>เงินมัดจำ</label>
          <input className="num" value={dep} onChange={e=>setDep(e.target.value)} /></div>
      </div>
      <div className="warn">แก้ค่าเช่าที่นี่มีผลกับบิลที่ออกหลังจากนี้เท่านั้น
        บิลเดือนก่อนที่ออกไปแล้วยังคงยอดเดิม</div>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}
