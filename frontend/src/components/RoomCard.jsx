import { thaiDate } from '../lib/helpers.js';

/* One card on the board. Colour carries one meaning only: green for occupied,
   red for vacant. Everything still outstanding is a small grey note. */
export default function RoomCard({ unit, occupied, tenantName, leaving, metered, billed, onClick }){
  let note = null;
  if(occupied && !metered)      note = <><i className="dot open" />ยังไม่จด</>;
  else if(occupied && !billed)  note = <><i className="dot open" />ยังไม่มีบิล</>;
  else if(occupied)             note = <><i className="dot full" />ครบ</>;
  // A scheduled move-out replaces the work note. For this room, the fact
  // that it frees up on a known date is the more useful thing to see.
  if(leaving) note = <span className="leaving">ว่าง {thaiDate(leaving)}</span>;

  return (
    <button className={"room" + (occupied ? " occ" : "") + (leaving ? " soon" : "")} onClick={onClick}>
      <div className="rno num">{unit.unit_number}</div>
      {occupied
        ? <div className="rname">{tenantName}</div>
        : <div className="rvac">ว่าง</div>}
      <div className="rfoot">{note}</div>
    </button>
  );
}
