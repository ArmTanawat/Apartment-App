import { thaiDate } from '../lib/helpers.js';

/* One card on the board.
 *
 * Colour answers one question: can somebody be put in this room today. Green
 * for occupied, red for empty, and for an empty room two notes the landlord can
 * add — amber for จอง, black for ล็อค. Everything still outstanding is a small
 * grey note instead.
 *
 * The two dots are only on an empty card, because neither note means anything
 * about a room somebody is living in. They stop the click from reaching the
 * card, so pressing one changes the colour and pressing anywhere else opens the
 * room, which is what the whole card looked like it did before they existed. */
export default function RoomCard({ unit, occupied, tenantName, leaving, metered, billed,
                                   onClick, onMark }){
  const mark = occupied ? null : unit.mark;
  const toggle = (e, which) => { e.stopPropagation(); onMark(mark === which ? null : which); };
  let note = null;
  if(occupied && !metered)      note = <><i className="dot open" />ยังไม่จด</>;
  else if(occupied && !billed)  note = <><i className="dot open" />ยังไม่มีบิล</>;
  else if(occupied)             note = <><i className="dot full" />ครบ</>;
  // A scheduled move-out replaces the work note. For this room, the fact
  // that it frees up on a known date is the more useful thing to see.
  if(leaving) note = <span className="leaving">ว่าง {thaiDate(leaving)}</span>;

  // An empty room says why it is coloured, so the dot is not the only thing
  // carrying it — a colour nobody can name is a colour nobody trusts.
  const vacantLabel = mark === "reserved" ? "จองแล้ว" : mark === "locked" ? "ล็อค" : "ว่าง";

  return (
    <button className={"room" + (occupied ? " occ" : "") + (leaving ? " soon" : "")
        + (mark === "reserved" ? " res" : "") + (mark === "locked" ? " lock" : "")}
      onClick={onClick}>
      {!occupied && (
        <span className="rmark">
          <span className={"mk res" + (mark === "reserved" ? " on" : "")}
            title="มีคนจองแล้ว" onClick={e => toggle(e, "reserved")} />
          <span className={"mk lock" + (mark === "locked" ? " on" : "")}
            title="ห้องล็อค — เข้าห้องไม่ได้" onClick={e => toggle(e, "locked")} />
        </span>
      )}
      <div className="rno num">{unit.unit_number}</div>
      {occupied
        ? <div className="rname">{tenantName}</div>
        : <div className="rvac">{vacantLabel}</div>}
      <div className="rfoot">{note}</div>
    </button>
  );
}
