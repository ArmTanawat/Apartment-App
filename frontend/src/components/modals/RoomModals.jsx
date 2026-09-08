import { useState } from 'react';
import { useSubmit } from '../../lib/useSubmit.js';
import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

export function AddRoomModal({ floor }){
  const { units, addUnit } = useData();
  const { closeModal } = useUi();
  const [num, setNum] = useState("");
  const [fl, setFl] = useState(String(floor));
  const [rent, setRent] = useState(String((units.find(u=>u.floor===floor)||{}).base_rent||3800));
  const { error, busy, run } = useSubmit();

  // unit_number is UNIQUE in the schema and POST /units names the clash, so
  // there is no second copy of that rule here — only the checks the server
  // never sees.
  const save = () => run(
    async () => { await addUnit({unit_number:num.trim(), floor:parseInt(fl,10), base_rent:parseFloat(rent)}); closeModal(); },
    () => !num.trim() ? "ต้องใส่เลขห้อง"
      : (!parseInt(fl,10) || parseInt(fl,10) < 1) ? "ชั้นต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป"
      : (isNaN(parseFloat(rent)) || parseFloat(rent) < 0) ? "ค่าเช่าต้องเป็นตัวเลข" : null);

  return (
    <Modal>
      <h3>เพิ่มห้อง</h3>
      <p className="lead">เลขห้องพิมพ์เองได้อิสระ ระบบไม่รันเลขให้ ห้องที่ข้ามเลขไว้จึงยังข้ามได้ตามเดิม</p>
      <ErrBox>{error}</ErrBox>
      <div className="two">
        <div className="field"><label>เลขห้อง</label>
          <input className="num" value={num} onChange={e=>setNum(e.target.value)} /></div>
        <div className="field"><label>ชั้น</label>
          <input className="num" value={fl} onChange={e=>setFl(e.target.value)} /></div>
      </div>
      <div className="field"><label>ค่าเช่ามาตรฐาน (บาท)</label>
        <input className="num" value={rent} onChange={e=>setRent(e.target.value)} />
        <div className="hint">ตัวเลขนี้จะถูกคัดลอกไปที่สัญญาตอนมีคนย้ายเข้า การขึ้นราคาภายหลังจะไม่กระทบผู้เช่าเดิม</div>
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" disabled={busy} onClick={save}>เพิ่มห้อง</button>
      </div>
    </Modal>
  );
}

export function EditRoomModal({ id }){
  const { units, updateUnit } = useData();
  const { closeModal } = useUi();
  const u = units.find(x=>x.id===id);
  const [num, setNum] = useState(u.unit_number);
  const [fl, setFl] = useState(String(u.floor));
  const [rent, setRent] = useState(String(u.base_rent));
  const { error, busy, run } = useSubmit();

  const save = () => run(
    async () => { await updateUnit(id, {unit_number:num.trim(), floor:parseInt(fl,10), base_rent:parseFloat(rent)}); closeModal(); },
    () => !num.trim() ? "ต้องใส่เลขห้อง"
      : (!parseInt(fl,10) || parseInt(fl,10) < 1) ? "ชั้นต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป"
      : (isNaN(parseFloat(rent)) || parseFloat(rent) < 0) ? "ค่าเช่าต้องเป็นตัวเลข" : null);

  return (
    <Modal>
      <h3>แก้ไขข้อมูลห้อง</h3>
      <ErrBox>{error}</ErrBox>
      <div className="two">
        <div className="field"><label>เลขห้อง</label>
          <input className="num" value={num} onChange={e=>setNum(e.target.value)} /></div>
        <div className="field"><label>ชั้น</label>
          <input className="num" value={fl} onChange={e=>setFl(e.target.value)} /></div>
      </div>
      <div className="field"><label>ค่าเช่ามาตรฐาน (บาท)</label>
        <input className="num" value={rent} onChange={e=>setRent(e.target.value)} />
        <div className="hint">มีผลกับสัญญาใหม่เท่านั้น ผู้เช่าปัจจุบันและบิลเก่าไม่เปลี่ยน</div>
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" disabled={busy} onClick={save}>บันทึก</button>
      </div>
    </Modal>
  );
}

export function DeleteRoomModal({ id }){
  const { units, leases, deleteUnit } = useData();
  const { closeModal, go } = useUi();
  const { error, busy, run } = useSubmit();
  const u = units.find(x=>x.id===id);
  // Deletion is blocked when history depends on it. The server refuses it too;
  // saying so before the button is pressed is the point of this dialog.
  const used = leases.some(l=>l.unit_id===id);

  return (
    <Modal>
      <h3>ลบห้อง {u.unit_number}</h3>
      {used ? <>
        <ErrBox>ลบไม่ได้ เพราะห้องนี้มีประวัติสัญญาเช่าอยู่ การลบจะทำให้บิลเก่าอ้างอิงห้องที่ไม่มีอยู่</ErrBox>
        <p className="lead">ถ้าไม่ใช้ห้องนี้แล้ว ให้ย้ายผู้เช่าออกและปล่อยว่างไว้แทน</p>
        <div className="actions"><button className="btn ghost" onClick={closeModal}>ปิด</button></div>
      </> : <>
        <p className="lead">ห้องนี้ยังไม่เคยมีสัญญาเช่า ลบได้ เลขห้องอื่นจะไม่ขยับตาม</p>
        <ErrBox>{error}</ErrBox>
        <div className="actions">
          <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
          <button className="btn danger" disabled={busy}
            onClick={() => run(async () => { await deleteUnit(id); closeModal(); go({name:"board"}); })}>ลบห้อง</button>
        </div>
      </>}
    </Modal>
  );
}
