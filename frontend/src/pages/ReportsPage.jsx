import MonthPicker from '../components/MonthPicker.jsx';
import YearPicker from '../components/YearPicker.jsx';
import ErrBox from '../components/ErrBox.jsx';
import { get, messageOf } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { baht, MONTHS_SHORT, periodLabel } from '../lib/helpers.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* รายงาน — three printable reports.
 *
 * The first two are built from what the API already returns for the other
 * screens: the month's bills, and the month's readings. There is nothing there
 * a report knows that a screen did not already know, which is why they needed
 * no endpoint of their own.
 *
 * The yearly meter report is the exception, and it earns one. Twelve months of
 * every room is twelve requests otherwise, and the usage behind each figure has
 * a rollover rule in it that already lives on the server — GET /readings/year
 * returns the finished numbers rather than letting a second copy of that rule
 * grow here.
 *
 * Printed the way an invoice is: the building's header at the top, everything
 * that is not the paper marked .noprint. */
export default function ReportsPage(){
  const { units, bills, readings, settings, h } = useData();
  const { period, reportKind, setReportKind, reportYear, openModal } = useUi();

  const KINDS = [
    { k: 'summary', l: 'สรุปยอดรวมประจำเดือน' },
    { k: 'meter',   l: 'รายงานมิเตอร์' },
    { k: 'year',    l: 'รายงานมิเตอร์รายปี' },
  ];
  const yearly = reportKind === 'year';

  // Only fetched while the yearly report is the one being looked at, and
  // refetched when the year changes. The other two reports read collections
  // that are already in hand.
  const yearReq = useApi(
    () => (yearly ? get(`/readings/year/${reportYear}`) : Promise.resolve(null)),
    [yearly, reportYear]);

  return <>
    <div className="head noprint">
      <h1>รายงาน</h1>
      <div className="tools">{yearly
        ? <YearPicker years={yearReq.data && yearReq.data.years} />
        : <MonthPicker />}</div>
    </div>
    <p className="sub noprint">พิมพ์ได้เหมือนใบแจ้งหนี้ · เลือกปลายทางเป็น
      "บันทึกเป็น PDF" ในกล่องพิมพ์ ถ้าอยากได้เป็นไฟล์</p>

    <div className="filters noprint">
      {KINDS.map(x => (
        <button key={x.k} className={"chip" + (x.k === reportKind ? " on" : "")}
          onClick={() => setReportKind(x.k)}>{x.l}</button>
      ))}
      <span style={{flex:1}} />
      <button className="btn" onClick={() => window.print()}>พิมพ์</button>
    </div>

    <div className="paper wide">
      <div className="phead">
        <div>
          <h2>{settings.building_name}</h2>
          <div className="small">{settings.building_address || ""}
            {settings.building_phone ? <><br />โทร {settings.building_phone}</> : null}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontWeight:500}}>{KINDS.find(x => x.k === reportKind).l}</div>
          <div className="small">{yearly ? "ปี" : "งวด"}<br />
            <span className="num">{yearly ? reportYear : periodLabel(period)}</span></div>
        </div>
      </div>
      {reportKind === 'summary'
        ? <Summary units={units} bills={bills} period={period} h={h} />
        : reportKind === 'meter'
        ? <Meters units={units} readings={readings} period={period} h={h} />
        : <YearMeters req={yearReq} year={reportYear}
            onOpen={unitId => openModal({ kind:"roomYear", unitId, year:reportYear })} />}
    </div>
  </>;
}

/* One row per bill, totalled at the foot.
 *
 * A room with no bill is not a row — there is nothing to put in the columns —
 * but it is counted at the bottom and named, because a room quietly missing
 * from a month's takings is the thing this report exists to make visible. */
function Summary({ units, bills, period, h }){
  const monthBills = bills.filter(b => b.period === period);
  const billed = new Set(monthBills.map(b => b.unit_number));

  const unbilled = units.filter(u => !billed.has(u.unit_number)
    && h.leasesInPeriod(u.id, period).length > 0);
  const empty = units.filter(u => !billed.has(u.unit_number)
    && h.leasesInPeriod(u.id, period).length === 0);

  const sum = key => monthBills.reduce((t, b) => t + b[key], 0);

  return <>
    <table className="rtable">
      <thead><tr>
        <th>ห้อง</th><th>ผู้เช่า</th>
        <th className="r">ค่าเช่า</th><th className="r">ค่าน้ำ</th>
        <th className="r">ค่าไฟ</th><th className="r">อื่น ๆ</th><th className="r">รวม</th>
      </tr></thead>
      <tbody>
        {monthBills.map(b => (
          <tr key={b.id}>
            <td className="num">{b.unit_number}</td>
            <td>{b.tenant_name}</td>
            <td className="r">{baht(b.rent_amount)}</td>
            <td className="r">{baht(b.water_amount)}</td>
            <td className="r">{baht(b.elec_amount)}</td>
            <td className="r">{baht(b.fees_amount)}</td>
            <td className="r">{baht(b.total)}</td>
          </tr>
        ))}
        {monthBills.length ? (
          <tr className="sum">
            <td colSpan={2}>รวม {monthBills.length} ใบ</td>
            <td className="r">{baht(sum('rent_amount'))}</td>
            <td className="r">{baht(sum('water_amount'))}</td>
            <td className="r">{baht(sum('elec_amount'))}</td>
            <td className="r">{baht(sum('fees_amount'))}</td>
            <td className="r">{baht(sum('total'))}</td>
          </tr>
        ) : (
          <tr><td colSpan={7} style={{color:"var(--muted)",padding:"18px 0"}}>
            งวดนี้ยังไม่ได้ออกบิล</td></tr>
        )}
      </tbody>
    </table>

    <div className="rnote">
      <b>ห้องที่ไม่ได้อยู่ในรายงานนี้ {unbilled.length + empty.length} ห้อง</b>
      {unbilled.length > 0 && (
        <div>มีผู้เช่าแต่ยังไม่ได้ออกบิล {unbilled.length} ห้อง —{" "}
          <span className="num">{unbilled.map(u => u.unit_number).join(", ")}</span></div>
      )}
      {empty.length > 0 && (
        <div>ไม่มีผู้เช่าในงวดนี้ {empty.length} ห้อง —{" "}
          <span className="num">{empty.map(u => u.unit_number).join(", ")}</span></div>
      )}
      {unbilled.length + empty.length === 0 && <div>ออกบิลครบทุกห้องแล้ว</div>}
    </div>
  </>;
}

/* One row per room, for spotting a meter that has gone wrong.
 *
 * Every room appears, including ones with a reading but no bill — which is
 * exactly when a wrong number is still worth catching — and ones with no
 * reading at all, marked rather than left out. */
function Meters({ units, readings, period, h }){
  const rowFor = u => readings.find(r => r.unit_id === u.id && r.period === period) || null;
  const used = (curr, prev, roll) =>
    curr === null || curr === undefined ? null : (curr + (roll || 0)) - prev;

  const entered = units.filter(u => { const r = rowFor(u); return r && r.water_curr != null && r.elec_curr != null; });
  const partial = units.filter(u => { const r = rowFor(u); return r && (r.water_curr == null || r.elec_curr == null); });
  const missing = units.filter(u => !rowFor(u));

  const num = v => v === null || v === undefined ? "—" : String(v);

  return <>
    <table className="rtable">
      <thead>
        <tr>
          <th>ห้อง</th><th>ผู้เช่า</th>
          <th className="r g">น้ำ ก่อนหน้า</th><th className="r">ปัจจุบัน</th><th className="r">หน่วย</th>
          <th className="r g">ไฟ ก่อนหน้า</th><th className="r">ปัจจุบัน</th><th className="r">หน่วย</th>
        </tr>
      </thead>
      <tbody>
        {units.map(u => {
          const r = rowFor(u);
          const pl = h.leasesInPeriod(u.id, period);
          const who = pl.length ? h.tenantOf(pl[pl.length - 1].id).full_name : "—";
          const w = r ? used(r.water_curr, r.water_prev, r.water_rollover) : null;
          const e = r ? used(r.elec_curr, r.elec_prev, r.elec_rollover) : null;
          return (
            <tr key={u.id}>
              <td className="num">{u.unit_number}</td>
              <td className={pl.length ? "" : "gap"}>{who}</td>
              {r ? <>
                <td className="r g">{num(r.water_prev)}</td>
                <td className="r">{num(r.water_curr)}</td>
                <td className="r">{w === null ? "—" : w}{r.water_rollover ? " *" : ""}</td>
                <td className="r g">{num(r.elec_prev)}</td>
                <td className="r">{num(r.elec_curr)}</td>
                <td className="r">{e === null ? "—" : e}{r.elec_rollover ? " *" : ""}</td>
              </> : (
                <td className="g gap" colSpan={6} style={{fontSize:"12px"}}>ยังไม่ได้จดมิเตอร์</td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>

    <div className="rnote">
      <div><b>จดครบแล้ว {entered.length} ห้อง</b>
        {partial.length > 0 && <> · จดไม่ครบ {partial.length} ห้อง —{" "}
          <span className="num">{partial.map(u => u.unit_number).join(", ")}</span></>}
        {missing.length > 0 && <> · ยังไม่ได้จด {missing.length} ห้อง —{" "}
          <span className="num">{missing.map(u => u.unit_number).join(", ")}</span></>}
      </div>
      <div>* คือมิเตอร์ที่ตั้งไว้ว่าหมุนครบรอบ จำนวนหน่วยจึงรวมรอบที่หมุนไปแล้วด้วย</div>
    </div>
  </>;
}

/* One room per pair of rows — น้ำ above, ไฟ below — and one column per month.
 *
 * Every room is here and every cell has a number. A month nobody read a meter
 * for is 0, not a blank: the report is a grid to run an eye down, and a gap
 * reads as something to look into when the answer is that nothing was recorded.
 *
 * Pressing a row opens that room's year as two charts. The table answers "what
 * did 203 use in March"; the shape over twelve months, which is what shows a
 * leak or a meter that stopped, is the thing a row of figures is worst at. */
function YearMeters({ req, year, onOpen }){
  if(req.loading) return <p className="none">กำลังโหลด…</p>;
  if(req.error) return <ErrBox>{messageOf(req.error)}</ErrBox>;
  if(!req.data) return null;

  const rooms = req.data.rooms;
  if(!rooms.length) return <p className="none">ยังไม่มีห้องในระบบ</p>;

  const sum = a => a.reduce((t, n) => t + n, 0);
  const anyReading = rooms.some(r => sum(r.water) > 0 || sum(r.elec) > 0);

  return <>
    <table className="rtable ytable">
      <thead>
        <tr>
          <th>ห้อง</th><th>มิเตอร์</th>
          {MONTHS_SHORT.map(m => <th key={m} className="r">{m}</th>)}
          <th className="r">รวม</th>
        </tr>
      </thead>
      <tbody>
        {rooms.map(r => [
          <tr key={`${r.unit_id}-w`} className="yrow" onClick={() => onOpen(r.unit_id)}>
            <td className="num" rowSpan={2}>{r.unit_number}</td>
            <td className="ykind">น้ำ</td>
            {r.water.map((v, i) => <td key={i} className="r num">{v.toLocaleString()}</td>)}
            <td className="r num" style={{fontWeight:500}}>{sum(r.water).toLocaleString()}</td>
          </tr>,
          <tr key={`${r.unit_id}-e`} className="yrow yrow-last" onClick={() => onOpen(r.unit_id)}>
            <td className="ykind">ไฟ</td>
            {r.elec.map((v, i) => <td key={i} className="r num">{v.toLocaleString()}</td>)}
            <td className="r num" style={{fontWeight:500}}>{sum(r.elec).toLocaleString()}</td>
          </tr>,
        ])}
      </tbody>
    </table>
    <p className="rnote">
      {anyReading
        ? <>เดือนที่ไม่ได้จดมิเตอร์นับเป็น 0 · กดที่แถวเพื่อดูกราฟรายเดือนของห้องนั้น</>
        : <>ปี {year} ยังไม่มีการจดมิเตอร์เลย ทุกช่องจึงเป็น 0</>}
    </p>
  </>;
}
