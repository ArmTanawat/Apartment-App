import { useState } from 'react';
import { useSubmit } from '../../lib/useSubmit.js';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

export function MoveInModal({ unitId }){
  const { units, tenants, h, addTenant, addLease } = useData();
  const { closeModal } = useUi();
  const { error, busy, run } = useSubmit();
  const TODAY = h.today();
  const u = units.find(x=>x.id===unitId);

  const [sel, setSel] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddr, setNewAddr] = useState("");
  const [newIdCard, setNewIdCard] = useState("");
  const [start, setStart] = useState(TODAY);
  const [rent, setRent] = useState(String(u.base_rent));
  const [dep, setDep] = useState(String(u.base_rent*2));

  const picked = sel && sel !== "new" ? tenants.find(x=>x.id===parseInt(sel,10)) : null;
  const missing = picked
    ? [!picked.phone?"เบอร์โทร":null, !picked.address?"ที่อยู่":null].filter(Boolean) : [];

  // The double-booking check is POST /leases's, and only its. It compares
  // dates rather than asking who is here today, and its message names the
  // tenant and the date the room frees up. A second copy of that comparison
  // here is exactly how a board comes to disagree with the form.
  const save = () => run(
    async () => {
      let tid;
      if(sel === "new"){
        // Written into the shared tenant list, so the ผู้เช่า page shows this
        // person immediately — no separate step to register them.
        const made = await addTenant({ full_name:newName.trim(), phone:newPhone.trim(),
          address:newAddr.trim(), id_card:newIdCard.trim() });
        tid = made.id;
      } else tid = parseInt(sel,10);

      await addLease({tenant_id:tid, unit_id:unitId, start_date:start,
        end_date:null, monthly_rent:parseFloat(rent), deposit:parseFloat(dep)});
      closeModal();
    },
    () => !sel ? "เลือกผู้เช่าก่อน"
      : !start ? "ใส่วันเข้าอยู่"
      : (sel === "new" && !newName.trim()) ? "ใส่ชื่อผู้เช่าใหม่" : null);

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
        <button className="btn" disabled={busy} onClick={save}>ย้ายเข้า</button>
      </div>
    </Modal>
  );
}

export function MoveOutModal({ unitId }){
  const { units, h, endLease } = useData();
  const { closeModal } = useUi();
  const { error, busy, run } = useSubmit();
  const TODAY = h.today();
  const u = units.find(x=>x.id===unitId);
  const l = h.activeLease(unitId);
  const t = h.tenantOf(l.id);
  const [end, setEnd] = useState(TODAY);

  const monthEnd = () => {
    const d = new Date(TODAY);
    return new Date(d.getFullYear(), d.getMonth()+1, 1).toISOString().slice(0,10);
  };

  // PUT /leases/:id/end is a named action rather than an edit, and it refuses
  // an end date before the start date itself.
  const save = () => run(
    async () => { await endLease(l.id, end); closeModal(); },
    () => !end ? "ใส่วันย้ายออก" : null);

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
        <button className="btn" disabled={busy} onClick={save}>ย้ายออก</button>
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
  const { error, busy, run } = useSubmit();

  // PUT /leases/:id checks the dates against each other but NOT against the
  // other leases on this room — unlike POST /leases, which does. So the
  // overlap test stays here: moving a start date backwards can push this lease
  // into someone else's stay, and nothing else would stop it.
  const clashWith = () => {
    const clash = leases.find(x => x.unit_id===l.unit_id && x.id!==leaseId
      && (!x.end_date || x.end_date > start)
      && (!l.end_date || x.start_date < l.end_date));
    return clash ? `ช่วงวันที่ทับกับสัญญาของ ${h.tenantOf(clash.id).full_name}` : null;
  };

  const save = () => run(
    async () => {
      await updateLease(leaseId, {start_date:start, monthly_rent:parseFloat(rent), deposit:parseFloat(dep)});
      closeModal();
    },
    () => !start ? "ใส่วันเข้าอยู่"
      : (isNaN(parseFloat(rent)) || parseFloat(rent) < 0) ? "ค่าเช่าต้องเป็นตัวเลข"
      : (isNaN(parseFloat(dep)) || parseFloat(dep) < 0) ? "มัดจำต้องเป็นตัวเลข"
      : (l.end_date && start >= l.end_date) ? "วันเข้าอยู่ต้องก่อนวันที่ห้องว่าง"
      : clashWith());

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
        <button className="btn" disabled={busy} onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}
