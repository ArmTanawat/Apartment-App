import { useState } from 'react';
import { useSubmit } from '../../lib/useSubmit.js';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { get } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

export function FeeModal({ leaseId, feeId }){
  const { feeTypes, addLeaseFee, updateLeaseFee } = useData();
  const { closeModal, bumpDetail } = useUi();
  const { error, busy, run } = useSubmit();

  // The fees already on this lease, so the types it has are not offered twice
  // — UNIQUE (lease_id, fee_type_id) refuses a duplicate.
  const fees = useApi(() => get(`/fees/lease/${leaseId}`), [leaseId]);
  const existing = feeId && fees.data ? fees.data.find(f=>f.id===feeId) : null;
  const taken = (fees.data || []).filter(f=>f.id!==feeId).map(f=>f.fee_type_id);
  const avail = feeTypes.filter(t=>t.is_active && !taken.includes(t.id));

  const [type, setType] = useState("");
  const [amt, setAmt] = useState("");
  // The boxes fill in once the lease's fees are known.
  const [seeded, setSeeded] = useState(false);
  if(fees.data && !seeded){
    setSeeded(true);
    setType(avail[0] ? String(avail[0].id) : "");
    setAmt(String(existing ? existing.amount : (avail[0] ? avail[0].default_amount : 0)));
  }

  const save = () => run(
    async () => {
      const a = parseFloat(amt);
      if(feeId) await updateLeaseFee(feeId, {amount:a});
      else await addLeaseFee({lease_id:leaseId, fee_type_id:parseInt(type,10), amount:a});
      bumpDetail();
      closeModal();
    },
    () => (isNaN(parseFloat(amt)) || parseFloat(amt) < 0) ? "ยอดต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" : null);

  if(fees.loading) return <Modal><p className="lead">กำลังโหลด…</p></Modal>;

  return (
    <Modal>
      <h3>{existing ? "แก้ค่าธรรมเนียมประจำ" : "เพิ่มค่าธรรมเนียมประจำ"}</h3>
      <p className="lead">เก็บทุกเดือนจนกว่าจะลบออก ถ้าเป็นค่าใช้จ่ายครั้งเดียว เช่น ค่าซ่อม
        ให้ไปใช้ช่องค่าใช้จ่ายครั้งเดียวแทน</p>
      <ErrBox>{error}</ErrBox>
      {existing ? (
        <div className="field"><label>รายการ</label><input value={existing.name} disabled /></div>
      ) : avail.length ? (
        <div className="field"><label>รายการ</label>
          <select value={type} onChange={e => {
            setType(e.target.value);
            const ft = feeTypes.find(t => t.id === parseInt(e.target.value,10));
            if(ft) setAmt(String(ft.default_amount));
          }}>
            {avail.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="hint">ยอดจะเติมมาจากค่าตั้งต้น แก้เฉพาะรายนี้ได้โดยไม่กระทบคนอื่น</div></div>
      ) : (
        <div className="warn">ผู้เช่ารายนี้มีค่าธรรมเนียมครบทุกรายการแล้ว</div>
      )}
      {(existing || avail.length) ? (
        <div className="field"><label>ยอดต่อเดือน (บาท)</label>
          <input className="num" value={amt} onChange={e=>setAmt(e.target.value)} /></div>
      ) : null}
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>{(existing||avail.length)?"ยกเลิก":"ปิด"}</button>
        {(existing || avail.length) ? <button className="btn" disabled={busy} onClick={save}>บันทึก</button> : null}
      </div>
    </Modal>
  );
}

export function DeleteFeeModal({ leaseId, feeId }){
  const { deleteLeaseFee } = useData();
  const { closeModal, bumpDetail } = useUi();
  const { error, busy, run } = useSubmit();
  const fee = useApi(() => get(`/fees/lease/${leaseId}`).then(fs => fs.find(f => f.id === feeId)),
    [leaseId, feeId]);
  if(fee.loading) return <Modal><p className="lead">กำลังโหลด…</p></Modal>;
  const f = fee.data;
  if(!f) return <Modal><ErrBox>ไม่พบค่าธรรมเนียมนี้</ErrBox>
    <div className="actions"><button className="btn ghost" onClick={closeModal}>ปิด</button></div></Modal>;
  return (
    <Modal>
      <h3>ลบ {f.name}</h3>
      {/* Cancelling a recurring fee is a delete, not a flag. Past bills keep
          showing it, because the tenant did pay it then. */}
      <p className="lead">จะไม่ถูกเก็บตั้งแต่บิลที่ออกหลังจากนี้ บิลเดือนก่อน ๆ
        ที่เคยเก็บไปแล้วยังคงเดิม เพราะผู้เช่าจ่ายไปจริง</p>
      <ErrBox>{error}</ErrBox>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn danger" disabled={busy}
          onClick={() => run(async () => { await deleteLeaseFee(feeId); bumpDetail(); closeModal(); })}>ลบ</button>
      </div>
    </Modal>
  );
}

export function ChargeModal({ leaseId }){
  const { leases, units, bills, h, addCharge } = useData();
  const { period, closeModal, bumpDetail } = useUi();
  const { error, busy, run } = useSubmit();
  const l = leases.find(x=>x.id===leaseId);
  const u = units.find(x=>x.id===l.unit_id);
  // A month can hold two leases at handover. The charge belongs to whoever was
  // in the room when the thing broke, so ask when there is a choice.
  const monthLeases = leases.filter(x => x.unit_id===u.id
    && x.start_date <= period+"-31" && (!x.end_date || x.end_date > period+"-01"));
  const hasBill = bills.some(b=>b.lease_id===leaseId && b.period===period);

  const [target, setTarget] = useState(String(leaseId));
  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");

  // No unique rule here: two separate repairs in one month are normal and each
  // should print as its own line.
  const save = () => run(
    async () => {
      await addCharge({lease_id: parseInt(target,10), period,
        description: desc.trim(), amount: parseFloat(amt)});
      bumpDetail();
      closeModal();
    },
    () => !desc.trim() ? "ใส่ชื่อรายการ" : isNaN(parseFloat(amt)) ? "ใส่จำนวนเงิน" : null);

  return (
    <Modal>
      <h3>เพิ่มค่าใช้จ่ายครั้งเดียว</h3>
      <p className="lead">ห้อง {u.unit_number} · งวด {period} — ขึ้นบิลเดือนนี้เดือนเดียว
        เดือนหน้าหายไปเอง</p>
      <ErrBox>{error}</ErrBox>
      {hasBill && (
        <div className="warn">เดือนนี้ออกบิลไปแล้ว รายการนี้จะยังไม่เข้าบิล
          ต้องไปกดออกบิลใหม่ที่หน้าบิล</div>
      )}
      {monthLeases.length > 1 ? (
        <div className="field"><label>คิดกับใคร</label>
          <select value={target} onChange={e=>setTarget(e.target.value)}>
            {monthLeases.map(x => {
              const t = h.tenantOf(x.id);
              const span = x.end_date ? `ถึง ${x.end_date}` : `ตั้งแต่ ${x.start_date}`;
              return <option key={x.id} value={x.id}>{t.full_name} ({span})</option>;
            })}
          </select>
          <div className="hint">เดือนนี้ห้องนี้มีผู้เช่าสองราย เลือกคนที่อยู่ตอนของเสียหาย</div></div>
      ) : null}
      <div className="field"><label>รายการ</label>
        <input placeholder="ซ่อมประตู Door repair" value={desc} onChange={e=>setDesc(e.target.value)} />
        <div className="hint">พิมพ์ไทยตามด้วยอังกฤษ ข้อความนี้จะขึ้นบนใบแจ้งหนี้ตามที่พิมพ์</div></div>
      <div className="field"><label>จำนวนเงิน (บาท)</label>
        <input className="num" placeholder="850" value={amt} onChange={e=>setAmt(e.target.value)} /></div>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" disabled={busy} onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}

export function FeeTypeModal({ id }){
  const { feeTypes, addFeeType, updateFeeType } = useData();
  const { closeModal } = useUi();
  const { error, busy, run } = useSubmit();
  const f = id ? feeTypes.find(x => x.id === id) : null;
  const [name, setName] = useState(f ? f.name : "");
  const [amt, setAmt] = useState(f ? String(f.default_amount) : "");

  // fee_types.name is UNIQUE and the route names the clash, so a duplicate is
  // refused there rather than guessed at here.
  const save = () => run(
    async () => {
      const body = {name: name.trim(), default_amount: parseFloat(amt)};
      if(id) await updateFeeType(id, body);
      else await addFeeType(body);
      closeModal();
    },
    () => !name.trim() ? "ต้องมีชื่อรายการ"
      : (isNaN(parseFloat(amt)) || parseFloat(amt) < 0) ? "ค่าตั้งต้นต้องเป็นตัวเลข" : null);

  return (
    <Modal>
      <h3>{f ? "แก้ประเภทค่าธรรมเนียม" : "เพิ่มประเภทค่าธรรมเนียม"}</h3>
      <p className="lead">ชื่อนี้จะพิมพ์ลงใบแจ้งหนี้ตามที่กรอก</p>
      <ErrBox>{error}</ErrBox>
      <div className="field"><label>ชื่อรายการ</label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="ค่าส่วนกลาง Facility fee" />
        <div className="hint">พิมพ์ไทยก่อน แล้วตามด้วยอังกฤษ</div></div>
      <div className="field"><label>ค่าตั้งต้น (บาท)</label>
        <input className="num" value={amt} onChange={e=>setAmt(e.target.value)} />
        <div className="hint">เป็นแค่ค่าเริ่มต้นตอนผูกกับผู้เช่า
          แก้รายคนได้ และการเปลี่ยนที่นี่ไม่กระทบคนที่ผูกไว้แล้ว</div></div>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" disabled={busy} onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}

export function DeleteFeeTypeModal({ id }){
  const { feeTypes, deleteFeeType } = useData();
  const { closeModal } = useUi();
  const { error, busy, run } = useSubmit();
  const f = feeTypes.find(x => x.id === id);
  return (
    <Modal>
      <h3>ลบ {f.name}</h3>
      <p className="lead">ยังไม่มีผู้เช่ารายไหนใช้รายการนี้ จึงลบได้
        ถ้าเคยมีคนใช้ ให้ปิดใช้งานแทนเพื่อให้บิลเก่ายังอ่านได้</p>
      <ErrBox>{error}</ErrBox>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn danger" disabled={busy}
          onClick={() => run(async () => { await deleteFeeType(id); closeModal(); })}>ลบ</button>
      </div>
    </Modal>
  );
}
