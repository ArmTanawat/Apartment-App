import { MONTHS_SHORT } from '../lib/helpers.js';

/* Twelve months of one meter, as an area under a line.
 *
 * Hand-drawn SVG rather than a charting library: it is twelve points and one
 * shape, and a library would be the largest dependency in the app for it.
 *
 * The two meters are drawn on their own scales, one chart each, because a room
 * using 18 units of water and 146 of electricity on one axis flattens the water
 * line to nothing — and the water line is exactly what somebody is looking at
 * when they wonder whether a tap is running somewhere.
 *
 * That means the two charts cannot be compared by height against each other,
 * only each against its own year. The figure above each one says its own peak
 * so the scale is never a guess. */
export default function UsageChart({ values, colour, fill, label, unitLabel = "หน่วย" }){
  const W = 520, H = 150, PAD_L = 34, PAD_R = 8, PAD_T = 12, PAD_B = 22;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const max = Math.max(...values, 0);
  // A year with nothing in it still draws — a flat line along the bottom, which
  // is the truthful picture of a room nobody read a meter for.
  const scale = max > 0 ? max : 1;
  const x = i => PAD_L + (plotW * i) / 11;
  const y = v => PAD_T + plotH - (plotH * v) / scale;

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(11).toFixed(1)},${(PAD_T + plotH).toFixed(1)} L${x(0).toFixed(1)},${(PAD_T + plotH).toFixed(1)} Z`;

  return (
    <div className="chart">
      <div className="charthead">
        <span>{label}</span>
        <span className="num">สูงสุด {max.toLocaleString()} {unitLabel}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chartsvg" role="img"
        aria-label={`${label} รายเดือน สูงสุด ${max} ${unitLabel}`}>
        {/* Three gridlines and their figures. Enough to read a value off the
            shape without turning the chart into a table. */}
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(scale * f)} y2={y(scale * f)} className="gridline" />
            <text x={PAD_L - 6} y={y(scale * f) + 3.5} className="gridnum" textAnchor="end">
              {Math.round(scale * f).toLocaleString()}</text>
          </g>
        ))}
        <path d={area} fill={fill} />
        <path d={line} fill="none" stroke={colour} strokeWidth="1.8"
          strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.4" fill={colour} />)}
        {MONTHS_SHORT.map((m, i) => (
          <text key={m} x={x(i)} y={H - 6} className="gridnum" textAnchor="middle">{m}</text>
        ))}
      </svg>
    </div>
  );
}
