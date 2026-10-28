import { useState } from 'react';
import { useSubmit } from '../../lib/useSubmit.js';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

export function RemoveQrModal(){
  const { removePaymentQr } = useData();
  const { closeModal } = useUi();
  const { error, busy, run } = useSubmit();
  return (
    <Modal>
      <h3>ลบ QR ชำระเงิน</h3>
      {/* The QR is read when a bill is drawn, not stored on it, so this
          reaches every bill — including old ones printed again. */}
      <p className="lead">บิลทุกใบจะไม่มี QR อีก รวมถึงบิลเก่าที่เปิดหรือพิมพ์ซ้ำ
        เหลือแค่ข้อมูลบัญชีธนาคารเหมือนเดิม</p>
      <ErrBox>{error}</ErrBox>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn danger" disabled={busy}
          onClick={() => run(async () => { await removePaymentQr(); closeModal(); })}>ลบ</button>
      </div>
    </Modal>
  );
}

/* A quick-pick button for เพิ่มค่าใช้จ่ายครั้งเดียว. Changing one never touches
   a charge already made with it: the charge holds its own copy. */
export function PresetModal({ id }){
  const { presets, addPreset, updatePreset } = useData();
  const { closeModal } = useUi();
  const { error, busy, run } = useSubmit();
  const p = id ? presets.find(x => x.id === id) : null;
  const [name, setName] = useState(p ? p.name : "");
  const [amt, setAmt] = useState(p ? String(p.default_amount) : "");

  const save = () => run(async () => {
    const body = { name: name.trim(), default_amount: parseFloat(amt) };
    if(p) await updatePreset(p.id, body); else await addPreset(body);
    closeModal();
  }, () => !name.trim() ? "ใส่ชื่อรายการ" : isNaN(parseFloat(amt)) ? "ใส่จำนวนเงิน" : null);

  return (
    <Modal>
      <h3>{p ? "แก้รายการด่วน" : "เพิ่มรายการด่วน"}</h3>
      <p className="lead">ปุ่มลัดในหน้าเพิ่มค่าใช้จ่ายครั้งเดียว กดแล้วเติมชื่อและจำนวนเงินให้
        ยังแก้ได้ก่อนบันทึก{p ? " ค่าใช้จ่ายที่บันทึกไปแล้วไม่เปลี่ยนตาม" : ""}</p>
      <ErrBox>{error}</ErrBox>
      <div className="field"><label>ชื่อรายการ</label>
        <input value={name} onChange={e => setName(e.target.value)} />
        <div className="hint">พิมพ์ไทยตามด้วยอังกฤษ เช่น ค่าทำความสะอาด Cleaning fee</div></div>
      <div className="field"><label>จำนวนเงิน (บาท)</label>
        <input className="num" value={amt} onChange={e => setAmt(e.target.value)} /></div>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" disabled={busy} onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}

export function DeletePresetModal({ id }){
  const { presets, deletePreset } = useData();
  const { closeModal } = useUi();
  const { error, busy, run } = useSubmit();
  const p = presets.find(x => x.id === id);
  return (
    <Modal>
      <h3>ลบรายการด่วน</h3>
      <p className="lead">ปุ่ม "{p.name}" จะหายไปจากหน้าเพิ่มค่าใช้จ่าย
        ค่าใช้จ่ายและบิลที่เคยใช้ปุ่มนี้ยังอยู่ครบเหมือนเดิม</p>
      <ErrBox>{error}</ErrBox>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn danger" disabled={busy}
          onClick={() => run(async () => { await deletePreset(id); closeModal(); })}>ลบ</button>
      </div>
    </Modal>
  );
}
