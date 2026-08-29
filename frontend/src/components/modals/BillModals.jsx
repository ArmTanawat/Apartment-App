import Modal from '../Modal.jsx';
import { baht } from '../../lib/helpers.js';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

/* A bill is stored, so correcting one means deleting and regenerating it.
   There is no in-place edit. */
export function DeleteBillModal({ id }){
  const { bills, deleteBill } = useData();
  const { closeModal, go } = useUi();
  const b = bills.find(x => x.id === id);
  return (
    <Modal>
      <h3>ลบบิลห้อง {b.unit_number}</h3>
      <p className="lead">{b.tenant_name} · งวด {b.period} · {baht(b.total)} บาท</p>
      <div className="warn">ลบแล้วออกใหม่ได้ตลอด ตัวเลขจะคำนวณจากข้อมูลปัจจุบัน
        ซึ่งอาจไม่เท่าเดิมถ้ามีการแก้มิเตอร์หรือค่าใช้จ่ายไปแล้ว</div>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn danger"
          onClick={() => { deleteBill(id); closeModal(); go({name:"bills"}); }}>ลบบิล</button>
      </div>
    </Modal>
  );
}
