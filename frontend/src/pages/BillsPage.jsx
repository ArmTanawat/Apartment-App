import { useEffect, useRef, useState } from 'react';
import ErrBox from '../components/ErrBox.jsx';
import MonthPicker from '../components/MonthPicker.jsx';
import Switch from '../components/Switch.jsx';
import { messageOf } from '../lib/api.js';
import { previewOrReason } from '../lib/bills.js';
import { baht, daysInPeriod } from '../lib/helpers.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* บิล — room selection, a live preview, and generating.
 *
 * Two switches live here rather than in settings, because both are decisions
 * about this month's bills: the minimum charge, and charging rent by the day. */
export default function BillsPage(){
  const { units, bills, h, generateBills, setApplyMinimum } = useData();
  const { period, go, picked, setPicked, prorateOn, setProrateOn,
          prorateDays, setProrateDays, lastResult, setLastResult } = useUi();

  const rgfrom = useRef(null), rgto = useRef(null);
  // The days box holds its own text so clearing it leaves it empty rather than
  // snapping back to the month length under the caret.
  const [daysText, setDaysText] = useState(null);

  const monthBills = bills.filter(b => b.period === period);
  const monthTotal = monthBills.reduce((s, b) => s + b.total, 0);
  const totalDays = daysInPeriod(period);

  // Every lease that was in a room during the month. Two in a handover month,
  // and each gets its own bill.
  const billableLeases = unitId => h.leasesInPeriod(unitId, period);
  const billFor = leaseId => bills.find(b => b.lease_id === leaseId && b.period === period);

  const toggle = id => {
    const next = new Set(picked);
    if(next.has(id)) next.delete(id); else next.add(id);
    setPicked(next); setLastResult(null);
  };

  // Grouped by floor with a select-all per floor. Picking a whole floor is the
  // common case; a hand-typed range does the same thing more slowly.
  const picks = h.floors().map(fl => {
    const rs = units.filter(u => u.floor === fl);
    const pickable = rs.filter(u => billableLeases(u.id).length);
    const allOn = pickable.length > 0 && pickable.every(u => picked.has(u.id));
    return (
      <div className="floorpick" key={fl}>
        <div className="floorpicklab"><span>ชั้น {fl}</span>
          <button className="linkbtn" onClick={() => {
            const next = new Set(picked);
            pickable.forEach(u => allOn ? next.delete(u.id) : next.add(u.id));
            setPicked(next); setLastResult(null);
          }}>{allOn ? "เอาออก" : "เลือกทั้งชั้น"}</button></div>
        <div className="pickgrid">{rs.map(u => {
          const ls = billableLeases(u.id);
          const has = ls.length > 0;
          const done = has && ls.every(l => billFor(l.id));
          return (
            <button key={u.id}
              className={"pick" + (picked.has(u.id) ? " on" : "") + (has ? "" : " gone")}
              onClick={has ? () => toggle(u.id) : undefined}
              title={has ? (done ? "ออกบิลแล้ว" : "") : "ไม่มีผู้เช่าเดือนนี้"}>
              <span className="box" /><span className="rn">{u.unit_number}</span>
              {done && <span style={{fontSize:"11px",color:"var(--muted)"}}>✓</span>}
            </button>
          );
        })}</div>
      </div>
    );
  });

  // Preview comes from GET /bills/preview — the same figures POST would store,
  // calculated without writing anything. Nothing on this page works out a
  // charge itself; there is only one copy of that arithmetic and it is on the
  // server.
  const [previews, setPreviews] = useState([]);
  const [previewing, setPreviewing] = useState(false);
  const [pageError, setPageError] = useState(null);
  const pickedKey = [...picked].sort((a,b)=>a-b).join(",");

  useEffect(() => {
    if(!picked.size){ setPreviews([]); return; }
    let alive = true;
    setPreviewing(true);
    // One request per lease. A room that cannot be billed answers 400 with the
    // reason, which is a row in the table rather than a failure of the page.
    const jobs = [];
    picked.forEach(uid => billableLeases(uid).forEach(l => {
      const unit = units.find(u => u.id === uid).unit_number;
      const tenant = h.tenantOf(l.id).full_name;
      if(billFor(l.id)){
        jobs.push(Promise.resolve({ unit, tenant, skip: "ออกบิลเดือนนี้ไปแล้ว" }));
        return;
      }
      jobs.push(previewOrReason(l.id, period, { prorate: prorateOn, days: prorateDays })
        .then(r => r.built
          ? { unit: r.built.unit_number, tenant: r.built.tenant_name, built: r.built, lease_id: l.id }
          : { unit, tenant, skip: r.skip }));
    }));
    Promise.all(jobs)
      .then(rows => { if(alive){ setPreviews(rows); setPageError(null); } })
      .catch(e => { if(alive){ setPreviews([]); setPageError(messageOf(e)); } })
      .finally(() => { if(alive) setPreviewing(false); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedKey, period, prorateOn, prorateDays, bills]);

  const ready = previews.filter(p => p.built);
  const readyTotal = ready.reduce((s, p) => s + p.built.total, 0);

  // POST /bills/batch. One failing room must not stop the rest, and both
  // leases in a handover month are billed separately — the route does both,
  // and reports what it skipped and why. A write is never retried on its own:
  // repeating this after a timeout could produce two bills.
  const [generating, setGenerating] = useState(false);
  const generate = async () => {
    setGenerating(true);
    setPageError(null);
    try {
      const r = await generateBills({ period, unit_ids: [...picked],
        prorate: prorateOn, prorate_days: prorateOn ? prorateDays : null });
      setLastResult({
        made: r.generated_count,
        total: r.generated.reduce((s, g) => s + g.total, 0),
        skipped: r.skipped.map(x => ({ unit: x.unit_number, reason: x.reason })),
      });
      setPicked(new Set());
    } catch (e) {
      setPageError(messageOf(e));
    } finally {
      setGenerating(false);
    }
  };

  const applyRange = () => {
    // A range is just a filter over the room list — the same set of rooms a
    // tick list would produce, typed faster.
    const from = rgfrom.current.value.trim();
    const to = rgto.current.value.trim();
    setPicked(new Set(units.filter(u => billableLeases(u.id).length
      && (!from || u.unit_number >= from) && (!to || u.unit_number <= to)).map(u => u.id)));
    setLastResult(null);
  };

  return <>
    <div className="head">
      <h1>บิล</h1>
      <div className="tools"><MonthPicker /></div>
    </div>
    <p className="sub">ดึงข้อมูลจากห้องพักและมิเตอร์มาคำนวณ ไม่ต้องกรอกอะไรเพิ่ม</p>

    <div className="billwrap">
      <div className="setcard">
        <h2>ออกบิล</h2>
        <p className="lead">เลือกห้อง ตรวจตัวเลข แล้วกดออกบิล</p>

        <div className="rangebar" style={{marginBottom:"4px"}}>
          <span>ช่วงห้อง</span>
          <input ref={rgfrom} placeholder="101" />
          <span>ถึง</span>
          <input ref={rgto} placeholder="601" />
          <button className="btn quiet" style={{padding:"6px 12px",fontSize:"13px"}} onClick={applyRange}>เลือก</button>
          <span style={{flex:1}} />
          <button className="btn quiet" style={{padding:"6px 12px",fontSize:"13px"}}
            onClick={() => { setPicked(new Set(units.filter(u => billableLeases(u.id).length).map(u => u.id))); setLastResult(null); }}>เลือกทั้งหมด</button>
          <button className="btn quiet" style={{padding:"6px 12px",fontSize:"13px"}}
            onClick={() => { setPicked(new Set(units.filter(u => {
              const ls = billableLeases(u.id);
              return ls.length && ls.some(l => !billFor(l.id));
            }).map(u => u.id))); setLastResult(null); }}>เฉพาะที่ยังไม่ออก</button>
          <button className="btn quiet" style={{padding:"6px 12px",fontSize:"13px"}}
            onClick={() => { setPicked(new Set()); setLastResult(null); }}>ล้าง</button>
        </div>
        {picks}

        <div style={{display:"flex",gap:"22px",flexWrap:"wrap",marginTop:"6px"}}>
          <Switch on={h.appliesMinimum()}
            onClick={async () => {
              setLastResult(null);
              try { await setApplyMinimum(period, !h.appliesMinimum()); }
              catch(e){ setPageError(messageOf(e)); }
            }}>
            คิดขั้นต่ำค่าน้ำค่าไฟ</Switch>
          <Switch on={prorateOn}
            onClick={() => { setProrateOn(!prorateOn); if(prorateOn){ setProrateDays(null); setDaysText(null); } setLastResult(null); }}>
            คิดค่าเช่าตามวันที่อยู่จริง</Switch>
          {prorateOn && (
            <span style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"14px"}}>
              <input className="num" value={daysText ?? String(prorateDays ?? totalDays)}
                onChange={e => { setDaysText(e.target.value);
                  const v = parseInt(e.target.value,10); setProrateDays(isNaN(v) ? null : v); }}
                style={{width:"56px",padding:"5px 8px",border:"1px solid var(--line)",borderRadius:"6px",
                        textAlign:"right",background:"var(--surface)",color:"var(--ink)"}} />
              <span style={{color:"var(--muted)"}}>จาก {totalDays} วัน</span></span>
          )}
        </div>
        <p className="lead" style={{margin:"8px 0 0"}}>สวิตช์ขั้นต่ำเป็นของทั้งตึกสำหรับเดือนนี้
          ส่วนคิดรายวันใช้กับรอบที่กำลังจะออกนี้เท่านั้น</p>

        {/* The same thing บันทึกมิเตอร์ says when a month is already billed.
            PUT /settings/period/:period reports the count too — a bill stores
            what it charged, so flipping this switch cannot reach one that has
            already been written, and saying nothing leaves the user waiting
            for a total to move that never will. */}
        {monthBills.length > 0 && (
          <div className="warn" style={{margin:"12px 0 0"}}>งวดนี้ออกบิลไปแล้ว{" "}
            <b className="num">{monthBills.length}</b> ใบ การเปลี่ยนสวิตช์ตรงนี้จะยังไม่เปลี่ยนบิลที่ออกไป
            ถ้าต้องการให้มีผล ต้องลบบิลเดิมแล้วออกใหม่</div>
        )}

        {picked.size ? (
          <table className="pvtable">
            <thead><tr><th>ห้อง</th><th>ผู้เช่า</th><th className="r">ค่าเช่า</th>
              <th className="r">น้ำ</th><th className="r">ไฟ</th><th className="r">อื่น ๆ</th><th className="r">รวม</th></tr></thead>
            <tbody>
              {previews.map((p, i) => p.skip
                ? <tr key={i}><td className="num">{p.unit}</td><td>{p.tenant}</td>
                    <td colSpan={5} className="bad" style={{fontSize:"13px"}}>{p.skip}</td></tr>
                : <tr key={i}><td className="num">{p.unit}</td><td>{p.tenant}</td>
                    <td className="r">{baht(p.built.rent_amount)}</td>
                    <td className="r">{baht(p.built.water_amount)}</td>
                    <td className="r">{baht(p.built.elec_amount)}</td>
                    <td className="r">{baht(p.built.fees_amount)}</td>
                    <td className="r">{baht(p.built.total)}</td></tr>)}
              {ready.length > 0 && (
                <tr className="sum"><td colSpan={6}>รวม {ready.length} ใบ</td>
                  <td className="r">{baht(readyTotal)}</td></tr>
              )}
            </tbody>
          </table>
        ) : <p className="none" style={{marginTop:"14px"}}>ยังไม่ได้เลือกห้อง</p>}

        <div className="actions">
          <button className="btn" disabled={!ready.length || generating || previewing} onClick={generate}>
            ออกบิล {ready.length ? `${ready.length} ใบ` : ""}</button>
        </div>
        <ErrBox>{pageError}</ErrBox>

        {lastResult && (
          <div className="result">
            <h4>ออกบิลแล้ว {lastResult.made} ใบ{lastResult.skipped.length ? ` · ข้าม ${lastResult.skipped.length}` : ``}</h4>
            {lastResult.made > 0 && (
              <div style={{fontSize:"13px",color:"var(--muted)"}}>รวม {baht(lastResult.total)} บาท</div>
            )}
            {lastResult.skipped.length > 0 && (
              <div className="skip">{lastResult.skipped.map((x, i) => (
                <span key={i}>ห้อง {x.unit} — {x.reason}{i < lastResult.skipped.length-1 ? <br/> : null}</span>
              ))}</div>
            )}
          </div>
        )}
      </div>

      <div className="setcard">
        <h2>บิลเดือนนี้</h2>
        {monthBills.length ? <>
          <div className="actions" style={{margin:"0 0 14px"}}>
            <button className="btn quiet" onClick={() => go({name:"printall"})}>พิมพ์ทั้งเดือน {monthBills.length} ใบ</button>
          </div>
          <table className="blist">
            <thead><tr><th>ห้อง</th><th>ผู้เช่า</th><th>ออกเมื่อ</th><th className="r">ยอด</th></tr></thead>
            <tbody>
              {monthBills.map(b => (
                <tr key={b.id} onClick={() => go({name:"bill", id:b.id})}>
                  <td className="num">{b.unit_number}</td>
                  <td>{b.tenant_name}</td>
                  <td className="num" style={{color:"var(--muted)",fontSize:"13px"}}>{b.created_at}</td>
                  <td className="r num">{baht(b.total)}</td>
                </tr>
              ))}
              <tr><td colSpan={3} style={{fontWeight:500,borderBottom:0,paddingTop:"11px"}}>
                รวม {monthBills.length} ใบ</td>
                <td className="r num" style={{fontWeight:500,borderBottom:0,paddingTop:"11px"}}>{baht(monthTotal)}</td></tr>
            </tbody>
          </table>
        </> : <p className="none">ยังไม่ได้ออกบิลเดือนนี้</p>}
      </div>
    </div>
  </>;
}
