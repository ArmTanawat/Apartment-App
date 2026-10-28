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
