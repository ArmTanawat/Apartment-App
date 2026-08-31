import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useSubmit } from '../../lib/useSubmit.js';
import { get } from '../../lib/api.js';
import { baht } from '../../lib/helpers.js';
import { useApi } from '../../lib/useApi.js';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

/* A bill is stored, so correcting one means deleting and regenerating it.
   There is no in-place edit. */
export function DeleteBillModal({ id }){
  const { bills, deleteBill } = useData();
  const { closeModal, go } = useUi();
  const { error, busy, run } = useSubmit();
  const b = bills.find(x => x.id === id);
  // The route refuses a bill that has a receipt. Saying so before the button
  // is pressed is what lets a reason be given rather than an error.
  const full = useApi(() => get(`/bills/${id}`), [id]);
  const receipt = full.data && full.data.receipt;

  if(full.loading) return <Modal><p className="lead">กำลังโหลด…</p></Modal>;

  return (
    <Modal>
      <h3>ลบบิลห้อง {b.unit_number}</h3>
      <p className="lead">{b.tenant_name} · งวด {b.period} · {baht(b.total)} บาท</p>
      {receipt ? <>
        <ErrBox>ลบไม่ได้ เพราะออกใบเสร็จเลขที่ {receipt.receipt_no} ไปแล้ว</ErrBox>
        <p className="lead">ผู้เช่าถือใบเสร็จที่ระบุยอดนี้อยู่ ลบบิลทิ้งจะทำให้ใบเสร็จนั้น
          อ้างถึงบิลที่ไม่มีอยู่ และเลขที่ใบเสร็จที่ออกไปแล้วก็ยกเลิกไม่ได้</p>
        <div className="actions"><button className="btn ghost" onClick={closeModal}>ปิด</button></div>
      </> : <>
        <div className="warn">ลบแล้วออกใหม่ได้ตลอด ตัวเลขจะคำนวณจากข้อมูลปัจจุบัน
          ซึ่งอาจไม่เท่าเดิมถ้ามีการแก้มิเตอร์หรือค่าใช้จ่ายไปแล้ว</div>
        <ErrBox>{error}</ErrBox>
        <div className="actions">
          <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
          <button className="btn danger" disabled={busy}
            onClick={() => run(async () => { await deleteBill(id); closeModal(); go({name:"bills"}); })}>ลบบิล</button>
        </div>
      </>}
    </Modal>
  );
}
