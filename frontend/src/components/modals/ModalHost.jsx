import { useUi } from '../../state/UiContext.jsx';
import { AddRoomModal, DeleteRoomModal, EditRoomModal } from './RoomModals.jsx';
import { DeleteLeaseModal, EditLeaseModal, MoveInModal, MoveOutModal } from './LeaseModals.jsx';
import { EditPrevModal, MeterModal } from './MeterModals.jsx';
import { ChargeModal, DeleteFeeModal, DeleteFeeTypeModal, FeeModal, FeeTypeModal } from './FeeModals.jsx';
import { AddTenantModal, DeleteTenantModal, EditTenantModal } from './TenantModals.jsx';
import { DeleteBillModal } from './BillModals.jsx';

/* The prototype's openModal(html) wrote a string into #modalRoot. Here the
   descriptor names which dialog to show and the component owns its own form
   state, so nothing is rebuilt from a template on every keystroke. */
export default function ModalHost(){
  const { modal } = useUi();
  if(!modal) return null;

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
    default: return null;
  }
}
