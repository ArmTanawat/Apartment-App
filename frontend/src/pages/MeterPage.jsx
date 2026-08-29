import { useState } from 'react';
import MonthPicker from '../components/MonthPicker.jsx';
import Switch from '../components/Switch.jsx';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* บันทึกมิเตอร์ — one row per room, split into a water line and an
   electricity line. Only the current number is typed; the previous one is
   filled from the last completed month.
 
   Saving happens per meter as the number is typed, so leaving the page
   mid-way never loses anything. There is deliberately no submit button. */
export default function MeterPage(){
  const { units, bills, h } = useData();
  const { period, meterFilter, setMeterFilter, showVacant, setShowVacant, meterRevision } = useUi();

  // Rooms with someone in them during this period. A tenant who left on the
  // 10th still has a meter to read for the days they were here.
  const rows = units.filter(u => showVacant || h.leasesInPeriod(u.id, period).length > 0);
  const need = units.filter(u => h.leasesInPeriod(u.id, period).length > 0);
  const done = need.filter(u => h.metered(u.id, period));
  const pct = need.length ? Math.round(done.length / need.length * 100) : 100;
  const billed = bills.filter(b => b.period === period).length;

  return <>
    <div className="head">
      <h1>บันทึกมิเตอร์</h1>
      <div className="tools"><MonthPicker /></div>
    </div>
    <p className="sub">พิมพ์เฉพาะเลขปัจจุบัน เลขก่อนหน้าดึงมาจากงวดที่แล้วให้แล้ว ·
      กด Enter เพื่อไปช่องถัดไป · บันทึกเองอัตโนมัติ</p>

    {billed > 0 && (
      <div className="warn" style={{maxWidth:"640px"}}>งวดนี้ออกบิลไปแล้ว{" "}
        <b className="num">{billed}</b> ใบ การแก้เลขมิเตอร์ตรงนี้จะยังไม่เปลี่ยนบิลที่ออกไป
        ต้องไปกดออกบิลใหม่ที่หน้าบิลอีกครั้ง</div>
    )}

    <div className="mprogress">
      <span>จดแล้ว <span className="num">{done.length}</span> จาก <span className="num">{need.length}</span> ห้อง</span>
      <div className="bar"><i style={{width:pct+"%"}} /></div>
      <span className="num" style={{color:"var(--muted)"}}>{pct}%</span>
    </div>

    <div className="filters" style={{alignItems:"center", gap:"8px"}}>
      <button className={"chip"+(meterFilter==="all"?" on":"")} onClick={()=>setMeterFilter("all")}>
        ทั้งหมด<span className="n num">{rows.length}</span></button>
      <button className={"chip"+(meterFilter==="no"?" on":"")} onClick={()=>setMeterFilter("no")}>
        ยังไม่จด<span className="n num">{need.length-done.length}</span></button>
      <button className={"chip"+(meterFilter==="done"?" on":"")} onClick={()=>setMeterFilter("done")}>
        จดแล้ว<span className="n num">{done.length}</span></button>
      <Switch on={showVacant} onClick={()=>setShowVacant(!showVacant)}>แสดงห้องว่าง</Switch>
    </div>

    <table className="mtable">
      <thead><tr>
        <th>ห้อง / ผู้เช่า</th>
        <th></th><th className="r">ก่อนหน้า</th><th></th><th className="c">ปัจจุบัน</th>
        <th className="r">หน่วย</th>
        <th className="r">สถานะ</th>
      </tr></thead>
      <tbody>
        {/* Remounted whenever the month changes or something outside this table
            writes to a reading, which is what render() used to do. */}
        <MeterRows key={`${period}:${meterRevision}`} rows={rows} />
      </tbody>
    </table>
  </>;
}

function MeterRows({ rows }){
  const { readings, settings, h, upsertReading } = useData();
  const { period, meterFilter, openModal, bumpMeter } = useUi();

  // What is in the boxes. Kept as the typed text rather than a number, so a
  // half-typed figure is not rewritten under the caret.
  const [drafts, setDrafts] = useState({});
  // Whether this row has been typed into since the table was drawn, and which
  // of its two meters came out below last month.
  const [rowState, setRowState] = useState({});

  const shown = rows.filter(u => {
    if(meterFilter === "no")   return !h.metered(u.id, period);
    if(meterFilter === "done") return h.metered(u.id, period);
    return true;
  });

  const readingFor = unitId => readings.find(x => x.unit_id === unitId && x.period === period);

  const displayed = (unitId, kind) => {
    const d = drafts[unitId];
    if(d && d[kind] !== undefined) return d[kind];
    const r = readingFor(unitId);
    const v = r ? (kind === "w" ? r.water_curr : r.elec_curr) : null;
    return v === null || v === undefined ? "" : String(v);
  };

  // Each meter is stored on its own. A water figure that is wrong must not
  // discard an electricity figure that was typed correctly beside it, which is
  // what returning early here used to do.
  const commitMeter = (unitId, next) => {
    const wIn = next.w !== undefined ? next.w : displayed(unitId, "w");
    const eIn = next.e !== undefined ? next.e : displayed(unitId, "e");
    setDrafts(d => ({ ...d, [unitId]: { w: wIn, e: eIn } }));

    const r = readingFor(unitId);
    const prev = h.previousReading(unitId, period);
    const wp = r ? r.water_prev : prev.water;
    const ep = r ? r.elec_prev  : prev.elec;
    const wroll = r ? (r.water_rollover || 0) : 0;
    const eroll = r ? (r.elec_rollover  || 0) : 0;
    const wc = wIn.trim() === "" ? null : parseFloat(wIn);
    const ec = eIn.trim() === "" ? null : parseFloat(eIn);

    const wUsed = wc === null || isNaN(wc) ? null : (wc + wroll) - wp;
    const eUsed = ec === null || isNaN(ec) ? null : (ec + eroll) - ep;
    const wBad = wUsed !== null && wUsed < 0;
    const eBad = eUsed !== null && eUsed < 0;

    const water_curr = (wc !== null && !isNaN(wc) && !wBad) ? wc : null;
    const elec_curr  = (ec !== null && !isNaN(ec) && !eBad) ? ec : null;

    upsertReading(unitId, period, existing => existing
      ? { water_curr, elec_curr }
      : { water_prev: wp, water_curr, water_rollover: 0,
          elec_prev: ep,  elec_curr,  elec_rollover: 0 });

    setRowState(s => ({ ...s, [unitId]: { touched: true, wBad, eBad } }));
  };

  // The dial wrapped: usage is what it counted up to its last digit, plus the
  // new number. The rollover amount is the meter's capacity, from its digits.
  const applyRollover = (unitId, kind) => {
    const prev = h.previousReading(unitId, period);
    // The dial's capacity comes from how many digits it has, which is a property
    // of the meter and is kept in settings. Counting the digits in the reading
    // would get it wrong for any meter showing a number padded with zeros.
    const digits = kind === "w" ? settings.water_meter_digits : settings.electricity_meter_digits;
    const cap = Math.pow(10, digits);
    const typed = parseFloat(displayed(unitId, kind)) || 0;

    upsertReading(unitId, period, existing => existing
      ? { [kind === "w" ? "water_rollover" : "elec_rollover"]: cap }
      : { water_prev: prev.water, water_curr: kind==="w" ? typed : prev.water,
          water_rollover: kind==="w" ? cap : 0,
          elec_prev: prev.elec, elec_curr: kind==="e" ? typed : prev.elec,
          elec_rollover: kind==="e" ? cap : 0 });
    bumpMeter();
  };

  // The meter was replaced, so it starts from zero and usage is just the new
  // number. Same symptom as a rollover, different arithmetic.
  const applyNewMeter = (unitId, kind) => {
    const prev = h.previousReading(unitId, period);
    upsertReading(unitId, period, existing => existing
      ? { [kind === "w" ? "water_prev" : "elec_prev"]: 0 }
      : { water_prev: kind==="w" ? 0 : prev.water, water_curr: kind==="w" ? 0 : prev.water,
          water_rollover: 0,
          elec_prev: kind==="e" ? 0 : prev.elec, elec_curr: kind==="e" ? 0 : prev.elec,
          elec_rollover: 0 });
    bumpMeter();
  };

  // Enter walks down the column of inputs, which is how the numbers arrive off
  // a clipboard: room by room, water then electricity.
  const onKeyDown = e => {
    if(e.key !== "Enter") return;
    const cur = e.target;
    if(!cur.dataset || (!cur.dataset.w && !cur.dataset.e)) return;
    e.preventDefault();
    const all = [...document.querySelectorAll("[data-w],[data-e]")];
    const next = all[all.indexOf(cur) + 1];
    if(next){ next.focus(); next.select(); }
    else cur.blur();
  };

  const out = [];
  h.floors().forEach(fl => {
    const rs = shown.filter(u => u.floor === fl);
    if(!rs.length) return;
    out.push(<tr className="frow" key={`f${fl}`}><td colSpan={6}>ชั้น {fl}</td></tr>);
    rs.forEach(u => {
      const r = readingFor(u.id);
      const prev = h.previousReading(u.id, period);
      const pl = h.leasesInPeriod(u.id, period);
      const who = pl.length ? h.tenantOf(pl[pl.length-1].id).full_name : "ว่าง";
      const st = rowState[u.id];

      const line = (kind, label, p, roll) => {
        const c = displayed(u.id, kind);
        const used = c !== "" && !isNaN(c) ? (Number(c) + (roll||0)) - p : null;
        const bad = st && st.touched && (kind === "w" ? st.wBad : st.eBad);
        const attr = kind === "w" ? { "data-w": u.id } : { "data-e": u.id };
        return <>
          <td className="mlab">{label}</td>
          <td className="mprev num">{p}<button className="editprev"
            title="แก้เลขก่อนหน้าของห้องนี้"
            onClick={() => openModal({kind:"editPrev", unitId:u.id})}>✎</button></td>
          <td className="marrow">→</td>
          <td className="mcell">
            <input className={"num" + (bad ? " bad" : "")} {...attr} value={c} placeholder="—"
              inputMode="numeric" onKeyDown={onKeyDown}
              onChange={e => commitMeter(u.id, { [kind]: e.target.value })} />
          </td>
          <td className="munit">
            {used !== null && used >= 0
              ? <><b>{used}</b>{roll ? <span className="rollnote">ครบรอบ</span> : null}</>
              : null}
          </td>
        </>;
      };

      // Water and electricity can both be wrong at once, and they are fixed
      // separately. One unlabelled pair of buttons would silently apply to
      // whichever meter the code happened to pick.
      const fixFor = (kind, label) => (
        <div className="fixrow" key={kind}>
          <span className="fixlab">{label}</span>
          <button title="มิเตอร์ถูกเปลี่ยนใหม่ เริ่มนับจาก 0"
            onClick={() => applyNewMeter(u.id, kind)}>เปลี่ยนมิเตอร์</button>
          <button title="มิเตอร์หมุนครบรอบกลับมาเริ่มใหม่"
            onClick={() => applyRollover(u.id, kind)}>ครบรอบ</button>
        </div>
      );

      let statClass = "statcell mstat", statBody = null;
      if(st && st.touched && (st.wBad || st.eBad)){
        statClass = "statcell mstat no";
        statBody = <><span className="fixhead">เลขน้อยกว่าเดิม</span>
          {st.wBad ? fixFor("w","น้ำ") : null}{st.eBad ? fixFor("e","ไฟ") : null}</>;
      } else if(st && st.touched){
        const wNull = displayed(u.id,"w").trim() === "", eNull = displayed(u.id,"e").trim() === "";
        if(!wNull && !eNull){ statClass = "statcell mstat ok"; statBody = "บันทึกแล้ว"; }
        else statBody = (wNull && eNull) ? "" : "ยังไม่ครบ";
      } else {
        const ok = h.metered(u.id, period);
        if(ok) statClass = "statcell mstat ok";
        statBody = ok ? "บันทึกแล้ว" : (r ? "รอกรอกใหม่" : "");
      }

      out.push(
        <tr className="sub" key={`a${u.id}`}>
          <td className="roomcell" rowSpan={2}>
            <div className="mno num">{u.unit_number}</div>
            <div className="mname">{who}</div>
          </td>
          {line("w","น้ำ", r ? r.water_prev : prev.water, r ? r.water_rollover : 0)}
          <td className={statClass} rowSpan={2}>{statBody}</td>
        </tr>
      );
      out.push(
        <tr className="sub last" key={`b${u.id}`}>
          {line("e","ไฟ", r ? r.elec_prev : prev.elec, r ? r.elec_rollover : 0)}
        </tr>
      );
    });
  });

  if(!out.length) return (
    <tr><td colSpan={7} style={{padding:"20px",color:"var(--muted)"}}>ไม่มีห้องในหมวดนี้</td></tr>
  );
  return out;
}
