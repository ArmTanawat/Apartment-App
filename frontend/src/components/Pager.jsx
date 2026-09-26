/* The ← → pair that steps to the room, bill or receipt beside this one.
 *
 * Reading a building is reading it room by room: 101, then 102, then 103. Done
 * through the back button that is back to the board, find the next card, open
 * it — three actions and a scroll to move one room, fourteen times over.
 *
 * It rides in `.pagebar`, which sticks to the top of the window, because these
 * pages are taller than the screen and a pager that scrolls away is missing
 * exactly where it is wanted — at the bottom of a room, beside the bills, or
 * under a bill's total.
 *
 * Sticky and not `position:fixed`. Fixed was tried: at 1280 wide, the size
 * this app's window opens at, the content column reaches within 30px of the
 * right edge, so a floating button sits on top of a figure somebody is trying
 * to read. Staying inside the column covers nothing and still never scrolls
 * away.
 *
 * The order is the list the user came from, handed in: rooms in board order,
 * bills in the order บิลเดือนนี้ shows them. Working it out here instead would
 * be a second ordering to disagree with the first.
 *
 * Each button carries where it goes — `← 102`, `104 →` — because an arrow on
 * its own asks the user to press it to find out.
 */
export default function Pager({ items, current, onGo }){
  const i = items.findIndex(x => x.id === current);
  // One of a thing has nothing beside it, and a current id that is not in the
  // list (a bill opened from a room's history, in a month this list is not
  // about) would otherwise page from the wrong end.
  if(items.length < 2 || i === -1) return null;

  const prev = i > 0 ? items[i - 1] : null;
  const next = i < items.length - 1 ? items[i + 1] : null;

  // Both sides are always rendered, disabled at the ends. Hiding one would
  // move the other, and a button that moves is a button that gets mis-clicked.
  const btn = (side, to) => (
    <button key={side} className={`pager ${side}`} disabled={!to}
      onClick={() => to && onGo(to.id)}
      title={to ? to.title || to.label : undefined}
      aria-label={to ? `ไป${to.title || to.label}` : undefined}>
      {side === 'prev' ? <><span className="arrow">←</span><span className="num">{to ? to.label : ""}</span></>
        : <><span className="num">{to ? to.label : ""}</span><span className="arrow">→</span></>}
    </button>
  );

  return <div className="pagergroup">{btn('prev', prev)}{btn('next', next)}</div>;
}
