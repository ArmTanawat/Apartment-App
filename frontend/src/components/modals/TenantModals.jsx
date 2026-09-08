import { useState } from 'react';
import { useSubmit } from '../../lib/useSubmit.js';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

/* The part of a tenant's record that is kept rather than used.
 *
 * None of it reaches a bill, a receipt or a report — it is the landlord's own
 * note of who is in the building, wanted at the moment somebody is standing at
 * the desk and gone a week later if nobody wrote it down. It sits below the
 * printed fields, under its own heading, so the form still reads top to bottom
 * as "what goes on the invoice, then what is only for us".
 *
 * Every field is optional and free text. เลขทะเบียนรถ is one box rather than a
 * list because a car belongs to a person, not to a room: somebody with two
 * cars types both, and nothing counts them. */
function TenantExtra({ issued, setIssued, expires, setExpires,
                       lineId, setLineId, plate, setPlate, note, setNote }){
  return <>
    <p className="lead" style={{margin:"18px 0 8px",fontWeight:500,color:"var(--ink)"}}>
      เก็บไว้ดูเอง</p>
    <p className="lead" style={{marginTop:0,fontSize:"13px"}}>
      ไม่ขึ้นบนใบแจ้งหนี้ ใบเสร็จ หรือรายงาน กรอกเท่าที่มี เว้นว่างได้ทุกช่อง</p>
    <div className="field"><label>วันออกบัตร</label>
      <input type="date" value={issued} onChange={e=>setIssued(e.target.value)} /></div>
    <div className="field"><label>วันหมดอายุบัตร</label>
      <input type="date" value={expires} onChange={e=>setExpires(e.target.value)} />
      <div className="hint">ไม่มีการแจ้งเตือนเมื่อถึงวัน เก็บไว้ให้กลับมาดูเท่านั้น</div></div>
    <div className="field"><label>ไอดีไลน์</label>
      <input value={lineId} onChange={e=>setLineId(e.target.value)} /></div>
    <div className="field"><label>เลขทะเบียนรถ</label>
      <input value={plate} onChange={e=>setPlate(e.target.value)} />
      <div className="hint">มีหลายคันพิมพ์รวมกันได้</div></div>
    <div className="field"><label>หมายเหตุ</label>
      <input value={note} onChange={e=>setNote(e.target.value)} /></div>
  </>;
}

export function AddTenantModal(){
  const { tenants, addTenant } = useData();
  const { closeModal } = useUi();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState("");
  const [idCard, setIdCard] = useState("");
  const [issued, setIssued] = useState("");
  const [expires, setExpires] = useState("");
  const [lineId, setLineId] = useState("");
  const [plate, setPlate] = useState("");
  const [note, setNote] = useState("");
  const { error, busy, run } = useSubmit();

  // tenants.full_name is not UNIQUE in the schema — two people really can
  // share a name — so this warning is the screen's, not the server's.
  const save = () => run(
    async () => {
      await addTenant({full_name:name.trim(), phone:phone.trim(),
        address:addr.trim(), id_card:idCard.trim(),
        id_card_issued:issued, id_card_expires:expires,
        line_id:lineId.trim(), vehicle_plate:plate.trim(), note:note.trim()});
      closeModal();
    },
    () => !name.trim() ? "ต้องมีชื่อ"
      : tenants.some(t => t.full_name === name.trim()) ? `มีผู้เช่าชื่อ "${name.trim()}" อยู่แล้ว` : null);

  return (
    <Modal>
      <h3>เพิ่มผู้เช่า</h3>
      <p className="lead">เพิ่มไว้ล่วงหน้าได้ ยังไม่ต้องผูกกับห้อง
        การย้ายเข้าห้องทำได้ที่หน้าห้องพัก</p>
      <ErrBox>{error}</ErrBox>
      <div className="warn">ชื่อ เบอร์ และที่อยู่จะพิมพ์ลงใบแจ้งหนี้ กรอกให้ครบตั้งแต่ตอนนี้
        จะได้ไม่ต้องกลับมาแก้ตอนออกบิล</div>
      <div className="field"><label>ชื่อ — นามสกุล</label>
        <input value={name} onChange={e=>setName(e.target.value)} /></div>
      <div className="field"><label>เบอร์โทร</label>
        <input className="num" value={phone} onChange={e=>setPhone(e.target.value)} /></div>
      <div className="field"><label>ที่อยู่</label>
        <input value={addr} onChange={e=>setAddr(e.target.value)} /></div>
      <div className="field"><label>เลขบัตรประชาชน</label>
        <input className="num" value={idCard} onChange={e=>setIdCard(e.target.value)} /></div>
      <TenantExtra
        issued={issued} setIssued={setIssued} expires={expires} setExpires={setExpires}
        lineId={lineId} setLineId={setLineId} plate={plate} setPlate={setPlate}
        note={note} setNote={setNote} />
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" disabled={busy} onClick={save}>เพิ่ม</button>
      </div>
    </Modal>
  );
}

export function EditTenantModal({ tenantId }){
  const { tenants, leases, units, h, updateTenant } = useData();
  const { closeModal } = useUi();
  const TODAY = h.today();
  const t = tenants.find(x=>x.id===tenantId);
  const held = leases.filter(l=>l.unit_id && l.tenant_id===tenantId
    && (!l.end_date || l.end_date > TODAY))
    .map(l=>units.find(u=>u.id===l.unit_id).unit_number);

  const [name, setName] = useState(t.full_name);
  const [phone, setPhone] = useState(t.phone||"");
  const [addr, setAddr] = useState(t.address||"");
  const [idCard, setIdCard] = useState(t.id_card||"");
  const [issued, setIssued] = useState(t.id_card_issued||"");
  const [expires, setExpires] = useState(t.id_card_expires||"");
  const [lineId, setLineId] = useState(t.line_id||"");
  const [plate, setPlate] = useState(t.vehicle_plate||"");
  const [note, setNote] = useState(t.note||"");
  const { error, busy, run } = useSubmit();

  const save = () => run(
    async () => {
      await updateTenant(tenantId, {full_name:name.trim(), phone:phone.trim(),
        address:addr.trim(), id_card:idCard.trim(),
        id_card_issued:issued, id_card_expires:expires,
        line_id:lineId.trim(), vehicle_plate:plate.trim(), note:note.trim()});
      closeModal();
    },
    () => !name.trim() ? "ต้องมีชื่อ" : null);

  return (
    <Modal>
      <h3>แก้ข้อมูลผู้เช่า</h3>
      <p className="lead">ข้อมูลนี้ใช้ร่วมกันทุกที่ ไม่ได้ผูกกับห้องใดห้องหนึ่ง
        {held.length > 1 ? ` — ผู้เช่ารายนี้เช่าอยู่ ${held.length} ห้อง (${held.join(", ")})` : ``}</p>
      <ErrBox>{error}</ErrBox>
      <div className="warn">ชื่อ เบอร์ และที่อยู่จะขึ้นบนใบแจ้งหนี้ตามที่กรอกไว้ที่นี่</div>
      <div className="field"><label>ชื่อ — นามสกุล</label>
        <input value={name} onChange={e=>setName(e.target.value)} /></div>
      <div className="field"><label>เบอร์โทร</label>
        <input className="num" value={phone} onChange={e=>setPhone(e.target.value)} /></div>
      <div className="field"><label>ที่อยู่</label>
        <input value={addr} onChange={e=>setAddr(e.target.value)} /></div>
      <div className="field"><label>เลขบัตรประชาชน</label>
        <input className="num" value={idCard} onChange={e=>setIdCard(e.target.value)} /></div>
      <TenantExtra
        issued={issued} setIssued={setIssued} expires={expires} setExpires={setExpires}
        lineId={lineId} setLineId={setLineId} plate={plate} setPlate={setPlate}
        note={note} setNote={setNote} />
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" disabled={busy} onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}

export function DeleteTenantModal({ id }){
  const { tenants, leases, deleteTenant } = useData();
  const { closeModal, go } = useUi();
  const { error, busy, run } = useSubmit();
  const t = tenants.find(x => x.id === id);
  // A tenant with leases cannot be deleted, by design — their billing history
  // points back at them. The server refuses it as well; saying so here is what
  // lets the alternative be offered instead of an error.
  const held = leases.filter(l => l.tenant_id === id);

  return (
    <Modal>
      <h3>ลบ {t.full_name}</h3>
      {held.length ? <>
        <ErrBox>ลบไม่ได้ เพราะผู้เช่ารายนี้มีสัญญาเช่าอยู่ในระบบ การลบจะทำให้บิลเก่าอ้างอิงคนที่ไม่มีอยู่</ErrBox>
        <p className="lead">ถ้าเขาย้ายออกไปแล้ว ให้ใช้ปุ่มย้ายออกที่หน้าห้อง ประวัติจะยังอยู่ครบ</p>
        <div className="actions"><button className="btn ghost" onClick={closeModal}>ปิด</button></div>
      </> : <>
        <p className="lead">ผู้เช่ารายนี้ยังไม่เคยมีสัญญาเช่า ลบได้</p>
        <ErrBox>{error}</ErrBox>
        <div className="actions">
          <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
          <button className="btn danger" disabled={busy}
            onClick={() => run(async () => { await deleteTenant(id); closeModal(); go({name:"tenants"}); })}>ลบ</button>
        </div>
      </>}
    </Modal>
  );
}
