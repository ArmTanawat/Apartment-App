import { useData } from '../../state/DataContext.jsx';
import { useUi } from '../../state/UiContext.jsx';
import Modal from '../Modal.jsx';
import { AddRoomModal, DeleteRoomModal, EditRoomModal } from './RoomModals.jsx';
import { DeleteLeaseModal, EditLeaseModal, MoveInModal, MoveOutModal } from './LeaseModals.jsx';
import { EditPrevModal, MeterModal } from './MeterModals.jsx';
import { ChargeModal, DeleteFeeModal, DeleteFeeTypeModal, FeeModal, FeeTypeModal } from './FeeModals.jsx';
import { AddTenantModal, DeleteTenantModal, EditTenantModal } from './TenantModals.jsx';
import { DeleteBillModal, IssueReceiptModal } from './BillModals.jsx';

/* Which record each dialog is about.
 *
 * Every one of them looks its subject up by id and then reads fields off it,
 * so a dialog opened on something that has since gone would throw rather than
 * say anything. That is reachable: the data can change under an open page —
 * another window, a database restored from a backup — and a refused write
 * re-reads the collections, which is exactly when a subject can vanish.
 *
 * The dialogs are left alone; the check lives here once instead of thirteen
 * times. */
const SUBJECT = {
  editRoom:      ['id',       'units'],
  deleteRoom:    ['id',       'units'],
  moveIn:        ['unitId',   'units'],
  moveOut:       ['unitId',   'units'],
  meter:         ['unitId',   'units'],
  editPrev:      ['unitId',   'units'],
  editLease:     ['leaseId',  'leases'],
  deleteLease:   ['leaseId',  'leases'],
  fee:           ['leaseId',  'leases'],
  deleteFee:     ['leaseId',  'leases'],
  charge:        ['leaseId',  'leases'],
  editTenant:    ['tenantId', 'tenants'],
  deleteTenant:  ['id',       'tenants'],
  feeType:       ['id',       'feeTypes'],
  deleteFeeType: ['id',       'feeTypes'],
  deleteBill:    ['id',       'bills'],
  issueReceipt:  ['id',       'bills'],
};

/* The prototype's openModal(html) wrote a string into #modalRoot. Here the
   descriptor names which dialog to show and the component owns its own form
   state, so nothing is rebuilt from a template on every keystroke. */
export default function ModalHost(){
  const { modal, closeModal } = useUi();
  const data = useData();
  if(!modal) return null;

  const subject = SUBJECT[modal.kind];
  if(subject){
    const [field, collection] = subject;
    const id = modal[field];
    // feeType with no id is "add a new one", which has no subject.
    if(id !== null && id !== undefined && !data[collection].some(x => x.id === id)) {
      return <Gone onClose={closeModal} />;
    }
  }
  // ย้ายออก is about a lease rather than a room, and finds it through the room.
  if(modal.kind === 'moveOut' && !data.h.activeLease(modal.unitId)){
    return <Gone onClose={closeModal} />;
  }

  switch(modal.kind){
    case "addRoom":       return <AddRoomModal floor={modal.floor} />;
    case "editRoom":      return <EditRoomModal id={modal.id} />;
    case "deleteRoom":    return <DeleteRoomModal id={modal.id} />;
    case "moveIn":        return <MoveInModal unitId={modal.unitId} />;
    case "moveOut":       return <MoveOutModal unitId={modal.unitId} />;
    case "editLease":     return <EditLeaseModal leaseId={modal.leaseId} />;
    case "deleteLease":   return <DeleteLeaseModal leaseId={modal.leaseId} />;
    case "meter":         return <MeterModal unitId={modal.unitId} />;
    case "editPrev":      return <EditPrevModal unitId={modal.unitId} />;
    case "fee":           return <FeeModal leaseId={modal.leaseId} feeId={modal.feeId} />;
    case "deleteFee":     return <DeleteFeeModal leaseId={modal.leaseId} feeId={modal.feeId} />;
    case "charge":        return <ChargeModal leaseId={modal.leaseId} />;
    case "feeType":       return <FeeTypeModal id={modal.id} />;
    case "deleteFeeType": return <DeleteFeeTypeModal id={modal.id} />;
    case "addTenant":     return <AddTenantModal />;
    case "editTenant":    return <EditTenantModal tenantId={modal.tenantId} />;
    case "deleteTenant":  return <DeleteTenantModal id={modal.id} />;
    case "deleteBill":    return <DeleteBillModal id={modal.id} />;
    case "issueReceipt":  return <IssueReceiptModal id={modal.id} />;
    default: return null;
  }
}

function Gone({ onClose }){
  return (
    <Modal>
      <h3>ข้อมูลนี้ไม่มีอยู่แล้ว</h3>
      <p className="lead">มีการเปลี่ยนแปลงจากที่อื่นหลังจากเปิดหน้านี้
        หน้าจอดึงข้อมูลล่าสุดมาให้แล้ว ปิดหน้าต่างนี้แล้วลองใหม่ได้เลย</p>
      <div className="actions"><button className="btn" onClick={onClose}>ปิด</button></div>
    </Modal>
  );
}
