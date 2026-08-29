import { useRef, useState } from 'react';
import MonthPicker from '../components/MonthPicker.jsx';
import Switch from '../components/Switch.jsx';
import { messageOf } from '../lib/api.js';
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
  const { readings, settings, h, createReading, patchReading } = useData();
  const { period, meterFilter, openModal, bumpMeter } = useUi();

  // What is in the boxes. Kept as the typed text rather than a number, so a
  // half-typed figure is not rewritten under the caret.
  const [drafts, setDrafts] = useState({});
  // Per room: whether it has been typed into since the table was drawn, which
  // of its two meters came out below last month, and whether the last save of
  // each meter failed. A failed write must never look like a successful one —
  // this page saves silently as you type, and an unnoticed failure means a
  // missing reading discovered at billing time.
  const [rowState, setRowState] = useState({});

  // Writes for one room run one after another. Two meters typed before the
  // row exists would otherwise both POST, and the second would be refused by
  // UNIQUE (unit_id, period).
  const queues = useRef({});
  // The id of a row this table created, before the reload that will carry it.
  const madeRows = useRef({});
  const timers = useRef({});

  const shown = rows.filter(u => {
    if(meterFilter === "no")   return !h.metered(u.id, period);
    if(meterFilter === "done") return h.metered(u.id, period);
    return true;
  });

  const readingFor = unitId => readings.find(x => x.unit_id === unitId && x.period === period);
  const rowIdFor = unitId => { const r = readingFor(unitId); return r ? r.id : madeRows.current[unitId]; };

  const displayed = (unitId, kind) => {
    const d = drafts[unitId];
    if(d && d[kind] !== undefined) return d[kind];
    const r = readingFor(unitId);
    const v = r ? (kind === "w" ? r.water_curr : r.elec_curr) : null;
    return v === null || v === undefined ? "" : String(v);
  };

  const setRow = (unitId, patch) =>
    setRowState(s => ({ ...s, [unitId]: { ...(s[unitId] || {}), ...patch } }));

  const enqueue = (unitId, fn) => {
    const prev = queues.current[unitId] || Promise.resolve();
    const next = prev.then(fn, fn);
    queues.current[unitId] = next.catch(() => {});
    return next;
  };

  // Each meter is stored on its own. A water figure that is wrong must not
  // discard an electricity figure that was typed correctly beside it.
  const save = (unitId, kind, value) => enqueue(unitId, async () => {
    const r = readingFor(unitId);
    const prev = h.previousReading(unitId);
    const isWater = kind === "w";
    const p    = r ? (isWater ? r.water_prev : r.elec_prev) : (isWater ? prev.water : prev.elec);
    const roll = r ? (isWater ? r.water_rollover : r.elec_rollover) || 0 : 0;
    const n = value.trim() === "" ? null : parseFloat(value);
    const curr = n === null || isNaN(n) ? null : n;
    const currKey = isWater ? "water_curr" : "elec_curr";

    // A meter counts up. Below last month is a typo, a replaced meter, or a
    // dial that wrapped, and the three bill differently — so the number is not
    // stored, and the screen asks which it was rather than guessing. The
    // server refuses it too; not sending it is what lets the question be asked
    // in Thai, beside the meter it is about.
    const bad = curr !== null && (curr + roll) - p < 0;

    try {
      const id = rowIdFor(unitId);
      // Writing null clears the figure, which is what an emptied box means and
      // what a refused number leaves behind: the room goes back to outstanding.
      const write = { [currKey]: bad ? null : curr };
      if(id) await patchReading(id, write);
      else {
        const made = await createReading({ unit_id: unitId, period,
          water_prev: r ? r.water_prev : prev.water,
          elec_prev:  r ? r.elec_prev  : prev.elec,
          ...write });
        if(made && made.id) madeRows.current[unitId] = made.id;
      }
      setRow(unitId, { touched: true, error: null,
        [isWater ? "wBad" : "eBad"]: bad });
    } catch (e) {
      setRow(unitId, { touched: true, error: messageOf(e),
        [isWater ? "wBad" : "eBad"]: bad });
    }
  });

  // The prototype wrote to memory on every keystroke. Over a network that
  // would be a request per character, so the save follows shortly behind the
  // typing and is flushed on the way out of the box.
  const onType = (unitId, kind, value) => {
    setDrafts(d => ({ ...d, [unitId]: { ...(d[unitId] || {}), [kind]: value } }));
    const key = `${unitId}:${kind}`;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => save(unitId, kind, value), 350);
  };
  const onBlur = (unitId, kind, value) => {
    const key = `${unitId}:${kind}`;
    if(timers.current[key]){ clearTimeout(timers.current[key]); delete timers.current[key];
      save(unitId, kind, value); }
  };

  // The dial wrapped: usage is what it counted up to its last digit, plus the
  // new number. The rollover amount is the meter's capacity, which comes from
  // how many digits it has — a property of the meter, kept in settings.
  // Counting the digits in the reading would get it wrong for any meter
  // showing a number padded with zeros.
  const applyRollover = (unitId, kind) => enqueue(unitId, async () => {
    const prev = h.previousReading(unitId);
    const isWater = kind === "w";
    const cap = Math.pow(10, isWater ? settings.water_meter_digits : settings.electricity_meter_digits);
    const typed = parseFloat(displayed(unitId, kind)) || 0;
    try {
      const id = rowIdFor(unitId);
      if(id) await patchReading(id, { [isWater ? "water_rollover" : "elec_rollover"]: cap });
      else await createReading({ unit_id: unitId, period,
        water_prev: prev.water, water_curr: isWater ? typed : prev.water,
        water_rollover: isWater ? cap : 0,
        elec_prev: prev.elec, elec_curr: isWater ? prev.elec : typed,
        elec_rollover: isWater ? 0 : cap });
      setRow(unitId, { error: null });
      bumpMeter();
    } catch (e) { setRow(unitId, { error: messageOf(e) }); }
  });

  // The meter was replaced, so it starts from zero and usage is just the new
  // number. Same symptom as a rollover, different arithmetic.
  const applyNewMeter = (unitId, kind) => enqueue(unitId, async () => {
    const prev = h.previousReading(unitId);
    const isWater = kind === "w";
    try {
      const id = rowIdFor(unitId);
      if(id) await patchReading(id, { [isWater ? "water_prev" : "elec_prev"]: 0 });
      else await createReading({ unit_id: unitId, period,
        water_prev: isWater ? 0 : prev.water, water_curr: isWater ? 0 : prev.water,
        elec_prev:  isWater ? prev.elec : 0, elec_curr:  isWater ? prev.elec : 0 });
      setRow(unitId, { error: null });
      bumpMeter();
    } catch (e) { setRow(unitId, { error: messageOf(e) }); }
  });

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
      const prev = h.previousReading(u.id);
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
              onChange={e => onType(u.id, kind, e.target.value)}
              onBlur={e => onBlur(u.id, kind, e.target.value)} />
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
      if(st && st.error){
        statClass = "statcell mstat no";
        statBody = <><span className="fixhead">ยังไม่ได้บันทึก</span>
          <span style={{display:"block",whiteSpace:"normal",fontSize:"11px"}}>{st.error}</span></>;
      } else if(st && st.touched && (st.wBad || st.eBad)){
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
