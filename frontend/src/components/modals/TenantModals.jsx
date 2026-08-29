import { useState } from 'react';
import { useSubmit } from '../../lib/useSubmit.js';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

export function AddTenantModal(){
  const { tenants, addTenant } = useData();
  const { closeModal } = useUi();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState("");
  const [idCard, setIdCard] = useState("");
  const { error, busy, run } = useSubmit();

  // tenants.full_name is not UNIQUE in the schema — two people really can
  // share a name — so this warning is the screen's, not the server's.
  const save = () => run(
    async () => {
      await addTenant({full_name:name.trim(), phone:phone.trim(),
        address:addr.trim(), id_card:idCard.trim()});
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
        <input placeholder="สมชาย ใจดี" value={name} onChange={e=>setName(e.target.value)} /></div>
      <div className="field"><label>เบอร์โทร</label>
        <input className="num" placeholder="081-234-5678" value={phone} onChange={e=>setPhone(e.target.value)} /></div>
      <div className="field"><label>ที่อยู่</label>
        <input placeholder="12/3 ถ.สุขุมวิท กรุงเทพฯ" value={addr} onChange={e=>setAddr(e.target.value)} /></div>
      <div className="field"><label>เลขบัตรประชาชน</label>
        <input className="num" value={idCard} onChange={e=>setIdCard(e.target.value)} /></div>
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
  const { error, busy, run } = useSubmit();

  const save = () => run(
    async () => {
      await updateTenant(tenantId, {full_name:name.trim(), phone:phone.trim(),
        address:addr.trim(), id_card:idCard.trim()});
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
        <input className="num" value={phone} placeholder="081-234-5678" onChange={e=>setPhone(e.target.value)} /></div>
      <div className="field"><label>ที่อยู่</label>
        <input value={addr} placeholder="12/3 ถ.สุขุมวิท กรุงเทพฯ" onChange={e=>setAddr(e.target.value)} /></div>
      <div className="field"><label>เลขบัตรประชาชน</label>
        <input className="num" value={idCard} onChange={e=>setIdCard(e.target.value)} /></div>
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
