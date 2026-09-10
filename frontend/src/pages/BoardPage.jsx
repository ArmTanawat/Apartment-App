import RoomCard from '../components/RoomCard.jsx';
import { periodLabel, thisMonth } from '../lib/helpers.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* ห้องพัก — the room board.
 *
 * No month picker. Occupancy is always today's. The outstanding-work note
 * follows the shared working month, and the page says so in words, because
 * mixing the two frames silently is how someone trusts the wrong number. */
export default function BoardPage(){
  const { units, h, markUnit } = useData();
  const { period, setPeriod, editMode, setEditMode, filter, setFilter, go, openModal } = useUi();

  // is_occupied and leaving_on come straight from GET /units.
  const filterDefs = [
    {k:"all", l:"ทั้งหมด",        f:()=>true},
    {k:"vac", l:"ว่าง",           f:u=>!u.is_occupied},
    {k:"nom", l:"ยังไม่จดมิเตอร์", f:u=>u.is_occupied&&!h.metered(u.id, period)},
    {k:"nob", l:"ยังไม่ออกบิล",    f:u=>u.is_occupied&&!h.billed(u.id, period)},
    {k:"soon",l:"กำลังจะว่าง",     f:u=>!!u.is_leaving}
  ];

  const occ = units.filter(u=>u.is_occupied).length;
  const nm  = units.filter(u=>u.is_occupied&&!h.metered(u.id, period)).length;
  const fn  = filterDefs.find(f=>f.k===filter).f;
  const shown = units.filter(fn);

  const floorBlocks = h.floors().map(fl => {
    const rs = shown.filter(u=>u.floor===fl);
    if(!rs.length && !editMode) return null;
    return (
      <div className="floor" key={fl}>
        <div className="floorlab">ชั้น {fl}</div>
        <div className="grid">
          {rs.map(u => (
            <RoomCard key={u.id} unit={u}
              occupied={u.is_occupied} tenantName={u.tenant_name}
              leaving={u.leaving_on}
              metered={h.metered(u.id, period)}
              billed={h.billed(u.id, period)}
              onClick={() => go({name:"room", id:u.id})}
              onMark={mark => markUnit(u.id, mark).catch(() => {})} />
          ))}
          {editMode && (
            <button className="addcard" title={`เพิ่มห้องชั้น ${fl}`}
              onClick={() => openModal({kind:"addRoom", floor:fl})}>+</button>
          )}
        </div>
      </div>
    );
  }).filter(Boolean);

  const empty = floorBlocks.length === 0 && !editMode;

  return <>
    <div className="head">
      <h1>ห้องพัก</h1>
      <div className="tools">
        <button className={"iconbtn" + (editMode ? " on" : "")}
          title={editMode ? "เสร็จสิ้น" : "แก้ไขห้อง"}
          onClick={() => setEditMode(!editMode)}>{editMode ? "✓" : "✎"}</button>
      </div>
    </div>
    <p className="sub">มีผู้เช่า <span className="num">{occ}</span> ห้อง ·
      ว่าง <span className="num">{units.length-occ}</span> ห้อง
      <span style={{color:"var(--muted)"}}> — สถานะวันนี้</span></p>
    <p className="sub" style={{marginTop:"-18px"}}>
      งานค้างของงวด <b>{periodLabel(period)}</b> ·{" "}
      {nm ? <>ยังไม่จดมิเตอร์ <span className="num">{nm}</span> ห้อง</> : <>จดมิเตอร์ครบแล้ว</>}
      {period !== thisMonth() && (
        <button className="linkbtn" style={{marginLeft:"8px"}}
          onClick={() => setPeriod(thisMonth())}>กลับมาเดือนปัจจุบัน</button>
      )}</p>
    <div className="filters">
      {filterDefs.map(f => (
        <button key={f.k} className={"chip" + (f.k===filter ? " on" : "")}
          onClick={() => setFilter(f.k)}>
          {f.l}<span className="n num">{units.filter(f.f).length}</span></button>
      ))}
    </div>
    {empty ? <p className="none">ไม่มีห้องในหมวดนี้</p> : floorBlocks}
    {editMode && (
      <div className="addfloor">
        <button className="btn ghost"
          onClick={() => openModal({kind:"addRoom", floor:Math.max(0,...h.floors())+1})}>+ เพิ่มชั้น</button>
      </div>
    )}
    <div className="legend">
      <span><i className="swatch" style={{background:"var(--occupied)"}} />มีผู้เช่า</span>
      <span><i className="swatch" style={{background:"var(--vacant)"}} />ห้องว่าง</span>
      <span><i className="dot open" />ยังมีงานค้าง</span>
      <span><i className="dot full" />เรียบร้อยแล้ว</span>
      <span><i className="swatch" style={{background:"transparent",borderLeft:"3px dashed var(--occupied)",borderRadius:0,width:"3px"}} />มีกำหนดย้ายออก</span>
    </div>
  </>;
}
