import { useEffect, useRef } from 'react';
import { useUi } from '../state/UiContext.jsx';

/* The year picker on the yearly meter report.
 *
 * Built out of the month picker's markup and CSS deliberately — it sits in the
 * same corner of the same page and does the same job, so it should not be a
 * second thing to learn. Forward is capped at the current year for the reason
 * the month picker caps at the current month: nothing can be read for a year
 * that has not happened.
 *
 * The list is the years that actually have readings, which the year endpoint
 * returns alongside the data. Offering every year back to 1970 would be a list
 * to scroll rather than a choice to make. */
export default function YearPicker({ years }){
  const { reportYear, setReportYear, yearOpen, setYearOpen } = useUi();
  const wrap = useRef(null);

  const thisYear = String(new Date().getFullYear());
  const list = years && years.length ? years : [thisYear];
  const atLatest = reportYear >= thisYear;
  const atEarliest = reportYear <= list[list.length - 1];

  useEffect(() => {
    if(!yearOpen) return;
    const onDown = e => { if(wrap.current && !wrap.current.contains(e.target)) setYearOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [yearOpen, setYearOpen]);

  const shift = by => setReportYear(String(Number(reportYear) + by));

  return (
    <div className="monthwrap" ref={wrap}>
      <div className="month">
        <button onClick={() => shift(-1)} aria-label="ปีก่อน" disabled={atEarliest}>‹</button>
        <button className="monthlabel" onClick={() => setYearOpen(!yearOpen)}>
          ปี <span className="num">{reportYear}</span></button>
        <button onClick={() => shift(1)} aria-label="ปีถัดไป" disabled={atLatest}>›</button>
      </div>
      {yearOpen && (
        <div className="monthmenu">
          {list.map(y => (
            <button key={y} className={"monthopt" + (y === reportYear ? " on" : "")}
              onClick={() => { setReportYear(y); setYearOpen(false); }}>
              <span className="num">{y}</span>
              {y === thisYear ? <span className="now">ปีนี้</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
