import { baht, dmy, missingForBill } from '../lib/helpers.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

export default function TenantPage({ id }){
  const { tenants, leases, units, bills, h } = useData();
  const { go, openModal } = useUi();

  const t = tenants.find(x => x.id === id);
  const rooms = h.roomsOf(id);
  const miss = missingForBill(t);
  const cur = rooms.filter(r => r.current);
  const theirBills = bills.filter(b => leases.some(l => l.id === b.lease_id && l.tenant_id === id));

  return <>
    <button className="back" onClick={() => go({name:"tenants"})}>← ผู้เช่า</button>
    <div className="roomhead">
      <div className="roomtitle"><h1 style={{fontSize:"32px"}}>{t.full_name}</h1>
        {cur.length
          ? <span className="tag occ">เช่าอยู่ {cur.length} ห้อง</span>
          : <span className="tag vac">ไม่ได้เช่าอยู่</span>}</div>
      <button className="btn danger" onClick={() => openModal({kind:"deleteTenant", id:t.id})}>ลบผู้เช่า</button>
    </div>
    <p className="sub">&nbsp;</p>

    <div className="cards">
      <div className="card">
        <h2>ข้อมูลสำหรับใบแจ้งหนี้ <button className="linkbtn"
          onClick={() => openModal({kind:"editTenant", tenantId:t.id})}>แก้ไข</button></h2>
        <dl className="kv">
          <dt>ชื่อ</dt><dd>{t.full_name}</dd>
          <dt>เบอร์โทร</dt><dd className="num">{t.phone || "—"}</dd>
          <dt>ที่อยู่</dt><dd>{t.address || "—"}</dd>
          <dt>เลขบัตรประชาชน</dt><dd className="num">{t.id_card || "—"}</dd>
        </dl>
        {miss.length > 0 && (
          <div className="warn" style={{margin:"14px 0 0",borderColor:"var(--vacant)",color:"var(--vacant)"}}>
            ยังไม่มี {miss.join(" และ ")} ซึ่งจะเป็นช่องว่างบนใบแจ้งหนี้</div>
        )}
      </div>

      {/* Entered on both tenant forms and, until now, readable on neither —
          the only way back to a หมายเหตุ or a วันหมดอายุบัตร was to open the
          edit dialog and look. Its own card rather than more rows on the one
          above, because that card's heading is a promise about what prints on
          an invoice and none of this does. */}
      <div className="card">
        <h2>เก็บไว้ดูเอง <button className="linkbtn"
          onClick={() => openModal({kind:"editTenant", tenantId:t.id})}>แก้ไข</button></h2>
        <dl className="kv">
          <dt>วันออกบัตร</dt><dd className="num">{dmy(t.id_card_issued) || "—"}</dd>
          <dt>วันหมดอายุบัตร</dt><dd className="num">{dmy(t.id_card_expires) || "—"}</dd>
          <dt>ไอดีไลน์</dt><dd>{t.line_id || "—"}</dd>
          <dt>เลขทะเบียนรถ</dt><dd>{t.vehicle_plate || "—"}</dd>
          <dt>หมายเหตุ</dt><dd>{t.note || "—"}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>ห้องที่เช่า</h2>
        {rooms.length ? (
          <div className="rowlist">{rooms.map(r => (
            <div className="rowitem" key={r.lease.id}>
              <span><span className="num">{r.unit.unit_number}</span>
                <small>{r.lease.start_date} {r.lease.end_date ? `ถึง ${r.lease.end_date}` : "— อยู่ต่อ"}</small></span>
              <span><span className="num">{baht(r.lease.monthly_rent)}</span>
                <button className="linkbtn" style={{marginLeft:"10px"}}
                  onClick={() => go({name:"room", id:r.unit.id})}>ดูห้อง</button></span>
            </div>
          ))}</div>
        ) : <p className="none">ยังไม่เคยเช่าห้องไหน</p>}
        {cur.length > 1 && (
          <div className="warn" style={{margin:"14px 0 0"}}>
            ผู้เช่ารายนี้ถือหลายห้องพร้อมกัน แต่ละห้องมีบิลของตัวเองแยกกัน</div>
        )}
      </div>

      <div className="card">
        <h2>บิลย้อนหลัง</h2>
        {theirBills.length ? (
          <div className="rowlist">{theirBills.map(b => {
            const l = leases.find(x => x.id === b.lease_id);
            const u = units.find(x => x.id === l.unit_id);
            return (
              <div className="rowitem" key={b.id}>
                <span className="num">{b.period}<small>ห้อง {u.unit_number}</small></span>
                <span className="num">{baht(b.total)}</span>
              </div>
            );
          })}</div>
        ) : <p className="none">ยังไม่มีบิล</p>}
      </div>
    </div>
  </>;
}
