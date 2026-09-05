import ErrBox from '../ErrBox.jsx';
import Modal from '../Modal.jsx';
import { useSubmit } from '../../lib/useSubmit.js';
import { get } from '../../lib/api.js';
import { billDiff } from '../../lib/bills.js';
import { baht } from '../../lib/helpers.js';
import { useApi } from '../../lib/useApi.js';
import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';

/* Issuing a receipt still asks first, though it is no longer a one-way door.
 *
 * Nothing is spent by issuing one and nothing is frozen by it — the receipt
 * can be cancelled, and correcting the bill cancels it anyway. So the dialog
 * is short, and what it asks is the only question that matters: has this
 * tenant actually paid. Printing a receipt for money that never arrived is the
 * mistake worth stopping, and it is the one the program cannot detect.
 *
 * When the bill is already stale, that is said first and loudest. Issuing a
 * receipt for a bill whose figures have been overtaken hands the tenant paper
 * with the old numbers on it — recoverable now, but still a page that has to
 * be printed twice and a tenant who has to be told why. */
export function IssueReceiptModal({ id }){
  const { bills, issueReceipt } = useData();
  const { closeModal, go } = useUi();
  const { error, busy, run } = useSubmit();
  const b = bills.find(x => x.id === id);

  // Whether the bill has been overtaken is worked out here rather than passed
  // in, so the warning is the same whichever button opened this — from the
  // bill itself, or from the row in the receipts list, which has no way of
  // knowing.
  const check = useApi(async () => {
    const full = await get(`/bills/${id}`);
    const d = await billDiff(full);
    return !!(d.changes && d.changes.length);
  }, [id]);

  if(check.loading) return <Modal><p className="lead">กำลังตรวจสอบบิล…</p></Modal>;
  const stale = check.data === true;

  return (
    <Modal>
      <h3>ออกใบเสร็จ</h3>
      <p className="lead">{b.tenant_name} · ห้อง {b.unit_number} · งวด {b.period} ·{" "}
        <span className="num">{baht(b.total)}</span> บาท</p>

      {stale && (
        <div className="warn" style={{borderColor:"var(--vacant)",color:"var(--vacant)"}}>
          ข้อมูลของบิลใบนี้เปลี่ยนไปหลังออกบิล ถ้าออกใบเสร็จตอนนี้
          ผู้เช่าจะถือกระดาษที่เป็นยอดเดิม
          ถ้าต้องการตัวเลขล่าสุด ให้กดออกบิลใหม่ก่อน แล้วค่อยออกใบเสร็จ</div>
      )}

      <div className="warn">ออกเมื่อผู้เช่าจ่ายเงินแล้วเท่านั้น
        <div style={{marginTop:"6px"}}>· หนึ่งบิลออกใบเสร็จได้ใบเดียว</div>
        <div>· ยกเลิกได้ ใบเสร็จไม่มีเลขที่กำกับ</div>
        <div>· ถ้าแก้บิลแล้วออกใหม่ ใบเสร็จจะถูกยกเลิกไปด้วย</div>
      </div>

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
  // A receipt no longer stops the delete — it goes with the bill. Saying so
  // before the button is pressed is the point: the tenant may be holding that
  // page, and whoever presses this has to know it stops being valid.
  const full = useApi(() => get(`/bills/${id}`), [id]);
  const receipt = full.data && full.data.receipt;

  if(full.loading) return <Modal><p className="lead">กำลังโหลด…</p></Modal>;

  return (
    <Modal>
      <h3>ลบบิลห้อง {b.unit_number}</h3>
      <p className="lead">{b.tenant_name} · งวด {b.period} · {baht(b.total)} บาท</p>
      {receipt && (
        <div className="warn" style={{borderColor:"var(--vacant)",color:"var(--vacant)"}}>
          บิลใบนี้ออกใบเสร็จไปแล้ว ลบบิลจะยกเลิกใบเสร็จไปด้วย
          ถ้าพิมพ์ใบเสร็จให้ผู้เช่าไปแล้ว ต้องออกใบใหม่และพิมพ์ให้ใหม่</div>
      )}
      <div className="warn">ลบแล้วออกใหม่ได้ตลอด ตัวเลขจะคำนวณจากข้อมูลปัจจุบัน
        ซึ่งอาจไม่เท่าเดิมถ้ามีการแก้มิเตอร์หรือค่าใช้จ่ายไปแล้ว</div>
      <ErrBox>{error}</ErrBox>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ยกเลิก</button>
        <button className="btn danger" disabled={busy}
          onClick={() => run(async () => { await deleteBill(id); closeModal(); go({name:"bills"}); })}>ลบบิล</button>
      </div>
    </Modal>
  );
}

/* Cancelling a receipt.
 *
 * Reached from the receipt itself. It asks, but not because anything is spent
 * — a receipt carries no number, so cancelling costs nothing and issuing again
 * is the same act as the first time. It asks because the tenant may be holding
 * the printed page, and because the note typed on it goes too. */
export function CancelReceiptModal({ id }){
  const { bills, cancelReceipt } = useData();
  const { closeModal, go } = useUi();
  const { error, busy, run } = useSubmit();
  const b = bills.find(x => x.id === id);
  const full = useApi(() => get(`/bills/${id}`), [id]);

  if(full.loading) return <Modal><p className="lead">กำลังโหลด…</p></Modal>;
  const receipt = full.data && full.data.receipt;
  if(!receipt) return (
    <Modal>
      <h3>ยกเลิกใบเสร็จ</h3>
      <p className="lead">บิลใบนี้ยังไม่ได้ออกใบเสร็จ</p>
      <div className="actions"><button className="btn ghost" onClick={closeModal}>ปิด</button></div>
    </Modal>
  );

  return (
    <Modal>
      <h3>ยกเลิกใบเสร็จห้อง {b.unit_number}</h3>
      <p className="lead">{b.tenant_name} · งวด {b.period} ·{" "}
        <span className="num">{baht(b.total)}</span> บาท</p>
      <div className="warn">บิลจะกลับไปเป็น "ยังไม่ได้ออก" และออกใบเสร็จใหม่ได้ทันที
        <div style={{marginTop:"6px"}}>· บิลใบนี้ไม่ถูกลบ ตัวเลขไม่เปลี่ยน</div>
        <div>· ถ้าพิมพ์ใบเสร็จให้ผู้เช่าไปแล้ว ใบนั้นใช้ไม่ได้อีก</div>
        {receipt.note ? <div>· หมายเหตุ "{receipt.note}" จะหายไปด้วย</div> : null}
      </div>
      <ErrBox>{error}</ErrBox>
      <div className="actions">
        <button className="btn ghost" onClick={closeModal}>ไม่ยกเลิก</button>
        <button className="btn danger" disabled={busy}
          onClick={() => run(async () => {
            await cancelReceipt(receipt.id);
            closeModal();
            go({name:"bill", id});
          })}>ยกเลิกใบเสร็จ</button>
      </div>
    </Modal>
  );
}
