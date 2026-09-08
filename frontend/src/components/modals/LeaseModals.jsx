import { useState } from 'react';
import { useSubmit } from '../../lib/useSubmit.js';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

/* The two sums taken beside มัดจำ.
 *
 * Recorded and read back, never charged: buildBill() takes monthly_rent off a
 * lease and nothing else, so none of this reaches a bill. They are kept apart
 * from each other rather than added into one figure because they are settled
 * differently at move-out, which is the moment anybody looks them up.
 *
 * Blank counts as none — the box being empty and the sum being zero are the
 * same thing here, so neither is made to be typed. */
function LeaseMoney({ guarantee, setGuarantee, advance, setAdvance }){
  return <>
    <div className="two">
      <div className="field"><label>เงินประกันสัญญาเช่าห้อง</label>
        <input className="num" value={guarantee} onChange={e=>setGuarantee(e.target.value)} /></div>
      <div className="field"><label>ค่าเช่าล่วงหน้า</label>
        <input className="num" value={advance} onChange={e=>setAdvance(e.target.value)} /></div>
    </div>
    {/* Inside a .field so it picks up the hint styling the other boxes use. */}
    <div className="field" style={{marginTop:"-8px"}}>
      <div className="hint">เก็บไว้ดูเอง ไม่ขึ้นบนบิลและไม่ถูกนำไปคิดเงิน เว้นว่างได้</div>
    </div>
  </>;
}

// Blank, or anything that is not a number, is none. Used for the two sums that
// are optional; ค่าเช่า and มัดจำ keep their own stricter checks.
//
// A negative is not turned into 0 here — that would swallow a typed minus sign
// and record a figure nobody entered. It comes back as it is and badMoney()
// below refuses it, the same way มัดจำ is refused.
const money = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const badMoney = (...vs) => vs.some(v => money(v) < 0)
  ? "เงินประกันและค่าเช่าล่วงหน้าต้องไม่ติดลบ" : null;

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
  const [guarantee, setGuarantee] = useState("");
  const [advance, setAdvance] = useState("");

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
        end_date:null, monthly_rent:parseFloat(rent), deposit:parseFloat(dep),
        guarantee:money(guarantee), advance_rent:money(advance)});
      closeModal();
    },
    () => !sel ? "เลือกผู้เช่าก่อน"
      : !start ? "ใส่วันเข้าอยู่"
      : (sel === "new" && !newName.trim()) ? "ใส่ชื่อผู้เช่าใหม่"
      : badMoney(guarantee, advance));

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
            <input value={newName} onChange={e=>setNewName(e.target.value)} /></div>
          <div className="field"><label>เบอร์โทร</label>
            <input className="num" value={newPhone} onChange={e=>setNewPhone(e.target.value)} /></div>
          <div className="field"><label>ที่อยู่</label>
            <input value={newAddr} onChange={e=>setNewAddr(e.target.value)} /></div>
          <div className="field"><label>เลขบัตรประชาชน</label>
            <input className="num" value={newIdCard} onChange={e=>setNewIdCard(e.target.value)} /></div>
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
      <LeaseMoney guarantee={guarantee} setGuarantee={setGuarantee}
        advance={advance} setAdvance={setAdvance} />
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
  const { closeModal, openModal } = useUi();
  const l = leases.find(x=>x.id===leaseId);
  const t = h.tenantOf(leaseId);
  const [start, setStart] = useState(l.start_date);
  const [rent, setRent] = useState(String(l.monthly_rent));
  const [dep, setDep] = useState(String(l.deposit));
  const [guarantee, setGuarantee] = useState(l.guarantee ? String(l.guarantee) : "");
  const [advance, setAdvance] = useState(l.advance_rent ? String(l.advance_rent) : "");
  const { error, busy, run } = useSubmit();

  // PUT /leases/:id now runs the same overlap test POST /leases does, so
  // moving a start date backwards into someone else's stay is refused there
  // and named there. There is no copy of that comparison here — two of them,
  // in two places, is how a board comes to disagree with a form.
  const save = () => run(
    async () => {
      await updateLease(leaseId, {start_date:start, monthly_rent:parseFloat(rent),
        deposit:parseFloat(dep), guarantee:money(guarantee), advance_rent:money(advance)});
      closeModal();
    },
    () => !start ? "ใส่วันเข้าอยู่"
      : (isNaN(parseFloat(rent)) || parseFloat(rent) < 0) ? "ค่าเช่าต้องเป็นตัวเลข"
      : (isNaN(parseFloat(dep)) || parseFloat(dep) < 0) ? "มัดจำต้องเป็นตัวเลข"
      : (l.end_date && start >= l.end_date) ? "วันเข้าอยู่ต้องก่อนวันที่ห้องว่าง"
      : badMoney(guarantee, advance));

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
      <LeaseMoney guarantee={guarantee} setGuarantee={setGuarantee}
        advance={advance} setAdvance={setAdvance} />
      <div className="warn">แก้ค่าเช่าที่นี่มีผลกับบิลที่ออกหลังจากนี้เท่านั้น
        บิลเดือนก่อนที่ออกไปแล้วยังคงยอดเดิม</div>
      {/* Only three things can be corrected here — วันเข้าอยู่, ค่าเช่า, มัดจำ.
          The tenant and the room cannot, so a ย้ายเข้า on the wrong person or
          the wrong room has nowhere else to go. */}
      <div className="actions" style={{justifyContent:"space-between"}}>
        <button className="btn danger" disabled={busy}
          onClick={() => openModal({kind:"deleteLease", leaseId})}>ลบสัญญานี้</button>
        <span style={{display:"flex", gap:"8px"}}>
          <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
          <button className="btn" disabled={busy} onClick={save}>บันทึก</button>
        </span>
      </div>
    </Modal>
  );
}

/* ลบสัญญา is not ย้ายออก, and the difference is what this dialog is for.
 *
 * ย้ายออก records that someone lived here and left — the room frees up and the
 * tenancy stays in the history, which is right, because it happened. ลบสัญญา
 * says it never happened, which is right for a ย้ายเข้า on the wrong person or
 * the wrong room.
 *
 * "Fixing" a mis-click with ย้ายออก instead leaves a tenancy of nought days on
 * the tenant's page for good, blocks ever deleting that room or that tenant,
 * and — because a lease that starts and ends inside a month still counts as
 * having been there — gets a full month's rent billed to someone who never
 * moved in.
 */
export function DeleteLeaseModal({ leaseId }){
  const { leases, units, bills, h, deleteLease } = useData();
  const { closeModal, openModal, bumpDetail } = useUi();
  const { error, busy, run } = useSubmit();

  const l = leases.find(x => x.id === leaseId);
  const t = h.tenantOf(leaseId);
  const u = units.find(x => x.id === l.unit_id);
  // The route refuses this too. Saying it before the button is pressed is what
  // lets the way out be offered instead of an error.
  const held = bills.filter(b => b.lease_id === leaseId);

  const back = () => openModal({kind:"editLease", leaseId});

  return (
    <Modal>
      <h3>ลบสัญญาเช่า</h3>
      <p className="lead">{t.full_name} · ห้อง {u.unit_number} · เข้าอยู่{" "}
        <span className="num">{l.start_date}</span></p>
      {held.length ? <>
        <ErrBox>ลบไม่ได้ เพราะสัญญานี้มีบิลอยู่ <span className="num">{held.length}</span> ใบ</ErrBox>
        <p className="lead">ถ้าออกบิลผิด ให้ลบบิลนั้นที่หน้าบิลก่อน แล้วค่อยกลับมาลบสัญญา</p>
        <div className="actions"><button className="btn ghost" onClick={closeModal}>ปิด</button></div>
      </> : <>
        <div className="warn">ใช้เมื่อกดย้ายเข้าผิดคนหรือผิดห้องเท่านั้น
          สัญญานี้จะหายไปเหมือนไม่เคยมี พร้อมกับค่าธรรมเนียมและค่าใช้จ่ายที่ผูกไว้กับมัน</div>
        <div className="warn">ถ้าผู้เช่าเคยอยู่จริงแล้วย้ายออก ให้ใช้ปุ่มย้ายออกแทน
          ห้องจะว่างเหมือนกัน แต่ประวัติยังอยู่ครบ</div>
        <ErrBox>{error}</ErrBox>
        <div className="actions">
          <button className="btn ghost" onClick={back}>ยกเลิก</button>
          <button className="btn danger" disabled={busy}
            onClick={() => run(async () => { await deleteLease(leaseId); bumpDetail(); closeModal(); })}>
            ลบสัญญา</button>
        </div>
      </>}
    </Modal>
  );
}
