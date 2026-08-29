import { thaiDate } from '../lib/helpers.js';

/* One card on the board. Colour carries one meaning only: green for occupied,
   red for vacant. Everything still outstanding is a small grey note. */
export default function RoomCard({ unit, lease, tenant, leaving, metered, billed, onClick }){
  let note = null;
  if(lease && !metered)      note = <><i className="dot open" />ยังไม่จด</>;
  else if(lease && !billed)  note = <><i className="dot open" />ยังไม่มีบิล</>;
  else if(lease)             note = <><i className="dot full" />ครบ</>;
  // A scheduled move-out replaces the work note. For this room, the fact
  // that it frees up on a known date is the more useful thing to see.
  if(leaving) note = <span className="leaving">ว่าง {thaiDate(leaving)}</span>;

  return (
    <button className={"room" + (lease ? " occ" : "") + (leaving ? " soon" : "")} onClick={onClick}>
      <div className="rno num">{unit.unit_number}</div>
      {lease
        ? <div className="rname">{tenant.full_name}</div>
        : <div className="rvac">ว่าง</div>}
      <div className="rfoot">{note}</div>
    </button>
  );
}
