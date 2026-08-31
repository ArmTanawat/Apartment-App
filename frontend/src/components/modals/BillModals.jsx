import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useSubmit } from '../../lib/useSubmit.js';
import { get } from '../../lib/api.js';
import { baht } from '../../lib/helpers.js';
import { useApi } from '../../lib/useApi.js';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

/* Issuing a receipt is a one-way door, so it asks first.
 *
 * The other irreversible actions in this app — ลบห้อง, ลบผู้เช่า, ลบสัญญา,
 * ลบบิล — all stop and explain before they act, and this is the same kind of
 * thing: a number is spent, and the bill behind it is frozen for good. The
 * difference is that nothing here looks destructive, which is exactly why it
 * needs saying out loud.
 *
 * When the bill is already stale, that is said first and loudest. Issuing a
 * receipt for a bill whose figures have been overtaken hands the tenant paper
 * with the old numbers on it and closes the only way back. */
export function IssueReceiptModal({ id, stale }){
  const { bills, issueReceipt } = useData();
  const { closeModal, go } = useUi();
  const { error, busy, run } = useSubmit();
  const b = bills.find(x => x.id === id);

  return (
    <Modal>
      <h3>ออกใบเสร็จ</h3>
      <p className="lead">{b.tenant_name} · ห้อง {b.unit_number} · งวด {b.period} ·{" "}
        <span className="num">{baht(b.total)}</span> บาท</p>

      {stale && (
        <div className="warn" style={{borderColor:"var(--vacant)",color:"var(--vacant)"}}>
          ข้อมูลของบิลใบนี้เปลี่ยนไปหลังออกบิล ถ้าออกใบเสร็จตอนนี้
          ผู้เช่าจะถือกระดาษที่เป็นยอดเดิม และจะแก้บิลใบนี้ไม่ได้อีกเลย
          ถ้าต้องการตัวเลขล่าสุด ให้กดออกบิลใหม่ก่อน แล้วค่อยออกใบเสร็จ</div>
      )}

      <div className="warn">ออกแล้วยกเลิกไม่ได้
        <div style={{marginTop:"6px"}}>· เลขที่ใบเสร็จจะถูกใช้ไปเลย ยกเลิกหรือใช้ซ้ำกับใบอื่นไม่ได้</div>
        <div>· บิลใบนี้จะลบไม่ได้ และออกบิลใหม่ไม่ได้อีก</div>
        <div>· หนึ่งบิลออกใบเสร็จได้ใบเดียว</div>
      </div>
      <p className="lead" style={{marginTop:"-6px"}}>ออกเมื่อผู้เช่าจ่ายเงินแล้วเท่านั้น</p>

      <ErrBox>{error}</ErrBox>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn" disabled={busy}
          onClick={() => run(async () => {
            await issueReceipt(id);
            closeModal();
            go({name:"receipt", id});
          })}>ออกใบเสร็จ</button>
      </div>
    </Modal>
  );
}

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
