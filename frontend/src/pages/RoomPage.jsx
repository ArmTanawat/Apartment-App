import { useState } from 'react';
import ErrBox from '../components/ErrBox.jsx';
import MonthPicker from '../components/MonthPicker.jsx';
import { get, messageOf } from '../lib/api.js';
import { baht } from '../lib/helpers.js';
import { useApi } from '../lib/useApi.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* ห้อง — the room page. Reached by tapping a card, not in the nav.
 *
 * Fees and charges are scoped to leases that occupied the room during the
 * working month, not to the lease active today. A tenant who left on the 10th
 * still gets a bill for that month, and a repair found afterwards is theirs to
 * pay. Filtering by "who is here now" makes that impossible, silently. */
export default function RoomPage({ id }){
  const { units, leases, bills, readings, h, updateLease, deleteCharge } = useData();
  const { period, go, openModal, detailRevision, bumpDetail } = useUi();

  const u = units.find(x=>x.id===id);
  const l = h.activeLease(u.id);
  const t = l ? h.tenantOf(l.id) : null;
  const TODAY = h.today();
  const r = readings.find(x=>x.unit_id===u.id && x.period===period);
  const past = bills.filter(b => leases.some(x=>x.id===b.lease_id && x.unit_id===u.id));
  // Fees and charges are scoped to every lease that occupied the room during
  // the working month, not to the lease active today.
  const periodLeases = h.leasesInPeriod(u.id, period);
  const hasHistory = leases.some(x=>x.unit_id===u.id);

  const feesReq = useApi(() => get(`/fees/lease/${l.id}`),
    [l && l.id, detailRevision], { skip: !l });
  const fees = feesReq.data || [];

  const chargeIds = periodLeases.map(x => x.id).join(",");
  const chargesReq = useApi(
    () => Promise.all(periodLeases.map(pl =>
      get(`/fees/onetime/${pl.id}?period=${period}`).then(cs => [pl.id, cs])))
      .then(Object.fromEntries),
    [chargeIds, period, detailRevision], { skip: periodLeases.length === 0 });
  const chargesFor = leaseId => (chargesReq.data && chargesReq.data[leaseId]) || [];

  const [actionError, setActionError] = useState(null);
  const run = async fn => {
    setActionError(null);
    try { await fn(); } catch(e){ setActionError(messageOf(e)); }
  };

  const missing = t ? [!t.phone?"เบอร์โทร":null,!t.address?"ที่อยู่":null].filter(Boolean) : [];

  return <>
    <button className="back" onClick={() => go({name:"board"})}>← ห้องพัก</button>
    <div className="roomhead">
      <div className="roomtitle">
        <h1 className="num">{u.unit_number}</h1>
        <span className={"tag " + (l ? "occ" : "vac")}>
          {l ? (l.end_date ? "จะว่าง "+l.end_date : "มีผู้เช่า") : "ว่าง"}</span>
      </div>
      <div className="tools">
        <MonthPicker />
        <button className="btn danger" title="ลบห้องนี้"
          onClick={() => openModal({kind:"deleteRoom", id:u.id})}>ลบห้อง</button>
      </div>
    </div>
    {/* Two frames on one page, so the page says which is which. Who is in the
        room is a live fact and does not follow the picker; the meter and the
        one-time charges do, and each of those cards names its งวด. Mixing the
        two silently is how a reader ends up trusting the wrong number. */}
    <p className="sub">ชั้น {u.floor} · ค่าเช่ามาตรฐาน <span className="num">{baht(u.base_rent)}</span> บาท
      <span style={{color:"var(--muted)"}}> — ผู้เช่าและสัญญาเป็นสถานะวันนี้</span></p>
    {/* A refused action is not an error state — the message names the reason
        and, where there is one, the alternative. */}
    <ErrBox>{actionError}</ErrBox>

    <div className="cards">
      <div className="card">
        <h2>ข้อมูลห้อง <button className="linkbtn"
          onClick={() => openModal({kind:"editRoom", id:u.id})}>แก้ไข</button></h2>
        <dl className="kv">
          <dt>เลขห้อง</dt><dd className="num">{u.unit_number}</dd>
          <dt>ชั้น</dt><dd className="num">{u.floor}</dd>
          <dt>ค่าเช่ามาตรฐาน</dt><dd className="num">{baht(u.base_rent)}</dd>
        </dl>
        {hasHistory && <div className="warn" style={{margin:"14px 0 0"}}>ห้องนี้มีประวัติสัญญาเช่าแล้ว ลบไม่ได้</div>}
      </div>

      <div className="card">
        <h2>ผู้เช่าปัจจุบัน</h2>
        {l ? <>
          <dl className="kv">
            <dt>ชื่อ</dt><dd>{t.full_name}</dd>
            <dt>โทร</dt><dd className="num">{t.phone||"—"}</dd>
            <dt>ที่อยู่</dt><dd>{t.address||"—"}</dd>
            <dt>เข้าอยู่</dt><dd className="num">{l.start_date}</dd>
            <dt>ค่าเช่า</dt><dd className="num">{baht(l.monthly_rent)}</dd>
            <dt>มัดจำ</dt><dd className="num">{baht(l.deposit)}</dd>
          </dl>
          {missing.length > 0 && (
            <div className="warn" style={{margin:"14px 0 0",borderColor:"var(--vacant)",color:"var(--vacant)"}}>
              ยังไม่มี {missing.join(" และ ")} ซึ่งต้องขึ้นบนใบแจ้งหนี้</div>
          )}
          {l.end_date && (
            <div className="warn" style={{margin:"14px 0 0"}}>
              มีกำหนดย้ายออก ห้องจะว่างวันที่ <b className="num">{l.end_date}</b>
              {/* Clearing end_date is a real action, not an omission. The API
                  takes an explicit null here; sending nothing would leave the
                  old date in place. */}
              <button className="linkbtn" style={{marginLeft:"8px"}}
                onClick={() => run(() => updateLease(l.id, {end_date:null}))}>ยกเลิกกำหนด</button>
            </div>
          )}
          <div className="actions">
            <button className="btn quiet" onClick={() => openModal({kind:"editTenant", tenantId:t.id})}>แก้ข้อมูลผู้เช่า</button>
            <button className="btn quiet" onClick={() => openModal({kind:"editLease", leaseId:l.id})}>แก้สัญญา</button>
            <button className="btn quiet" onClick={() => openModal({kind:"moveOut", unitId:u.id})}>
              {l.end_date ? "แก้กำหนดย้ายออก" : "ย้ายออก"}</button>
          </div>
        </> : <>
          <p className="none">ยังไม่มีผู้เช่า</p>
          {periodLeases.length > 0 && (
            <div className="warn" style={{margin:"12px 0 0"}}>
              เดือนนี้ {periodLeases.map(x=>h.tenantOf(x.id).full_name).join(" และ ")} เคยอยู่ห้องนี้
              และยังต้องออกบิลให้</div>
          )}
          <div className="actions">
            <button className="btn" onClick={() => openModal({kind:"moveIn", unitId:u.id})}>ย้ายเข้า</button>
          </div>
        </>}
      </div>

      <div className="card">
        <h2>ค่าธรรมเนียมประจำ {l && <button className="linkbtn"
          onClick={() => openModal({kind:"fee", leaseId:l.id, feeId:null})}>+ เพิ่ม</button>}</h2>
        {!l ? <p className="none">ต้องมีผู้เช่าก่อน</p>
          : fees.length ? (
            <div className="rowlist">{fees.map(f => (
              <div className="rowitem" key={f.id}>
                <span>{f.name}<small>เก็บทุกเดือน</small></span>
                <span><span className="num">{baht(f.amount)}</span>
                  <button className="linkbtn" style={{marginLeft:"10px"}}
                    onClick={() => openModal({kind:"fee", leaseId:f.lease_id, feeId:f.id})}>แก้</button>
                  <button className="linkbtn danger" style={{marginLeft:"6px"}}
                    onClick={() => openModal({kind:"deleteFee", leaseId:l.id, feeId:f.id})}>ลบ</button>
                </span>
              </div>
            ))}</div>
          ) : <p className="none">ยังไม่มี</p>}
      </div>

      <div className="card">
        <h2>มิเตอร์ <span className="period">งวด {period}</span>
          {r && <button className="linkbtn"
            onClick={() => openModal({kind:"meter", unitId:u.id})}>แก้ไข</button>}</h2>
        {r ? (
          <dl className="kv">
            <dt>น้ำ</dt><dd className="num">{r.water_prev} → {r.water_curr ?? "—"}
              {r.water_curr != null ? ` (${(r.water_curr+(r.water_rollover||0))-r.water_prev} หน่วย)` : ""}</dd>
            <dt>ไฟ</dt><dd className="num">{r.elec_prev} → {r.elec_curr ?? "—"}
              {r.elec_curr != null ? ` (${(r.elec_curr+(r.elec_rollover||0))-r.elec_prev} หน่วย)` : ""}</dd>
          </dl>
        ) : <>
          <p className="none">ยังไม่ได้จดมิเตอร์</p>
          <div className="actions">
            <button className="btn quiet" onClick={() => openModal({kind:"meter", unitId:u.id})}>จดมิเตอร์</button>
          </div>
        </>}
      </div>

      <div className="card">
        <h2>ค่าใช้จ่ายครั้งเดียว <span className="period">งวด {period}</span></h2>
        {periodLeases.length === 0
          ? <p className="none">เดือนนี้ไม่มีผู้เช่าอยู่</p>
          : periodLeases.map(pl => {
              const pt = h.tenantOf(pl.id);
              const pc = chargesFor(pl.id);
              const gone = !!(pl.end_date && pl.end_date <= TODAY);
              return (
                <div style={{marginBottom:"14px"}} key={pl.id}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    fontSize:"13px",color:"var(--muted)",marginBottom:"4px"}}>
                    <span>{pt.full_name}{gone ? ` · ย้ายออก ${pl.end_date}` : ``}</span>
                    <button className="linkbtn" onClick={() => openModal({kind:"charge", leaseId:pl.id})}>+ เพิ่ม</button>
                  </div>
                  {pc.length ? (
                    <div className="rowlist">{pc.map(c => (
                      <div className="rowitem" key={c.id}>
                        <span>{c.description}</span>
                        <span><span className="num">{baht(c.amount)}</span>
                          <button className="linkbtn danger" style={{marginLeft:"10px"}}
                            onClick={() => run(async () => { await deleteCharge(c.id); bumpDetail(); })}>ลบ</button>
                        </span>
                      </div>
                    ))}</div>
                  ) : <p className="none" style={{margin:0}}>ยังไม่มี</p>}
                </div>
              );
            })}
      </div>

      <div className="card">
        <h2>บิลย้อนหลัง</h2>
        {past.length ? (
          <div className="rowlist">{past.map(b => {
            const bt = h.tenantOf(b.lease_id);
            return (
              <div className="rowitem" key={b.id}>
                <span className="num">{b.period}<small>{bt?bt.full_name:""}</small></span>
                <span className="num">{baht(b.total)}</span>
              </div>
            );
          })}</div>
        ) : <p className="none">ยังไม่มีบิล</p>}
      </div>
    </div>
  </>;
}
