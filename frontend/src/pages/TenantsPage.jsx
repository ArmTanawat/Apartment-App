import { missingForBill } from '../lib/helpers.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* ผู้เช่า — the least-visited page. Its real job is the data that prints on an
   invoice — name, phone, address — so the table shows exactly those three and
   flags what is missing. */
export default function TenantsPage(){
  const { tenants, h } = useData();
  const { go, openModal, tenantSearch, setTenantSearch, tenantFilter, setTenantFilter } = useUi();

  const withRooms = tenants.map(t => ({ t, rooms: h.roomsOf(t.id) }));
  const q = tenantSearch.trim().toLowerCase();

  const filters = [
    {k:"all",  l:"ทั้งหมด",       f:() => true},
    {k:"cur",  l:"อยู่ปัจจุบัน",   f:x => x.rooms.some(r => r.current)},
    {k:"gone", l:"ย้ายออกแล้ว",   f:x => x.rooms.length > 0 && !x.rooms.some(r => r.current)},
    {k:"miss", l:"ข้อมูลไม่ครบ",  f:x => missingForBill(x.t).length > 0}
  ];

  const shown = withRooms
    .filter(filters.find(f => f.k === tenantFilter).f)
    .filter(x => !q || x.t.full_name.toLowerCase().includes(q) || (x.t.phone||"").includes(q))
    .sort((a,b) => a.t.full_name.localeCompare(b.t.full_name, "th"));

  return <>
    <div className="head">
      <h1>ผู้เช่า</h1>
      <div className="tools"><button className="btn" onClick={() => openModal({kind:"addTenant"})}>+ เพิ่มผู้เช่า</button></div>
    </div>
    <p className="sub">ชื่อ เบอร์ และที่อยู่ที่เก็บไว้ที่นี่ คือข้อมูลที่จะพิมพ์ลงใบแจ้งหนี้</p>

    <div className="filters" style={{alignItems:"center", gap:"8px"}}>
      {filters.map(f => (
        <button key={f.k} className={"chip" + (f.k===tenantFilter?" on":"")}
          onClick={() => setTenantFilter(f.k)}>
          {f.l}<span className="n num">{withRooms.filter(f.f).length}</span></button>
      ))}
      <span style={{flex:1}} />
      <div className="search"><span>ค้นหา</span>
        <input value={tenantSearch} onChange={e => setTenantSearch(e.target.value)} /></div>
    </div>

    <table className="ttable">
      <thead><tr><th>ชื่อ</th><th>เบอร์โทร</th><th>ที่อยู่</th><th>ห้อง</th></tr></thead>
      <tbody>
        {shown.length ? shown.map(({t, rooms}) => {
          const miss = missingForBill(t);
          const cur = rooms.filter(r => r.current);
          const past = rooms.filter(r => !r.current);
          return (
            <tr key={t.id} onClick={() => go({name:"tenant", id:t.id})}>
              <td>
                <span className="tname">{t.full_name}</span>
                {miss.length > 0 && <span className="tmiss">ยังไม่มี {miss.join(" และ ")}</span>}
              </td>
              <td className={"num " + (t.phone?"":"tdim")}>{t.phone || "—"}</td>
              <td className={t.address?"":"tdim"} style={{maxWidth:"240px"}}>{t.address || "—"}</td>
              <td>
                {cur.map(r => <span className="roomtag" key={r.lease.id}>{r.unit.unit_number}</span>)}
                {past.map(r => <span className="roomtag past" key={r.lease.id}>{r.unit.unit_number}</span>)}
                {rooms.length === 0 && <span className="tdim">—</span>}
              </td>
            </tr>
          );
        }) : (
          <tr><td colSpan={4} style={{padding:"20px",color:"var(--muted)"}}>ไม่พบผู้เช่า</td></tr>
        )}
      </tbody>
    </table>

    <p className="sub" style={{marginTop:"14px", fontSize:"13px"}}>
      <span className="roomtag">201</span> เช่าอยู่ตอนนี้ ·{" "}
      <span className="roomtag past">201</span> เคยเช่า</p>
  </>;
}
