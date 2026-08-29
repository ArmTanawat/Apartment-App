import { useEffect, useRef } from 'react';
import { periodLabel, shiftPeriod, thisMonth } from '../lib/helpers.js';
import { useUi } from '../state/UiContext.jsx';

/* The month picker. Forward is capped at the current month; back is
   unlimited, because history is worth looking at and cannot be typed into. */
export default function MonthPicker(){
  const { period, setPeriod, shiftMonth, monthOpen, setMonthOpen } = useUi();
  const wrap = useRef(null);
  const atLatest = period >= thisMonth();

  // Eighteen months back is enough to reach any bill worth revisiting without
  // the list becoming something to scroll through.
  const options = [];
  for(let i = 0; i < 18; i++) options.push(shiftPeriod(thisMonth(), -i));

  // Any click elsewhere closes the month list.
  useEffect(() => {
    if(!monthOpen) return;
    const onDown = e => { if(wrap.current && !wrap.current.contains(e.target)) setMonthOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [monthOpen, setMonthOpen]);

  return (
    <div className="monthwrap" ref={wrap}>
      <div className="month">
        <button onClick={() => shiftMonth(-1)} aria-label="เดือนก่อน">‹</button>
        <button className="monthlabel" onClick={() => setMonthOpen(!monthOpen)}>{periodLabel(period)}</button>
        <button onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป" disabled={atLatest}>›</button>
      </div>
      {monthOpen && (
        <div className="monthmenu">
          {options.map(p => (
            <button key={p} className={"monthopt" + (p === period ? " on" : "")}
              onClick={() => setPeriod(p)}>
              {periodLabel(p)}{p === thisMonth() && <span className="now">เดือนนี้</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
