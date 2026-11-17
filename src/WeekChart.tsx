type Props = { pts: (number | undefined)[]; avg?: number; minTop?: number; decimals?: number };

// Line chart with one point per week. Missing weeks leave a gap. An optional dashed line marks the average.
export default function WeekChart({ pts, avg, minTop = 20, decimals = 1 }: Props) {
  const W = 720, H = 260, L = 40, R = 12, T = 20, B = 30;
  const vals = pts.filter((p): p is number => p != null);
  const top = Math.max(minTop, ...vals, avg ?? 0);
  const bottom = Math.min(0, ...vals);
  const range = top - bottom;
  const step = range > 40 ? 20 : range > 12 ? 10 : range > 6 ? 2 : 1;
  const hi = Math.ceil(top / step) * step;
  const lo = Math.floor(bottom / step) * step;
  const slot = (W - L - R) / pts.length;
  const x = (i: number) => L + (i + 0.5) * slot;
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  let d = "";
  let pen = false;
  pts.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i)} ${y(v)}`;
    pen = true;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxWidth: 900 }} role="img" aria-label={`Points by week: ${pts.map((v) => (v == null ? "none" : v.toFixed(1))).join(", ")}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{t}</text>
        </g>
      ))}
      {avg != null && (
        <g>
          <line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} stroke="var(--muted)" strokeDasharray="5 4" />
          <text x={W - R} y={y(avg) - 5} textAnchor="end" fontSize="11" fill="var(--muted)">Avg {avg.toFixed(1)}</text>
        </g>
      )}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((v, i) => (v == null ? null : (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={4} fill="var(--accent)" />
          <text x={x(i)} y={y(v) - 9} textAnchor="middle" fontSize="11" fill="var(--ink)">{v.toFixed(decimals)}</text>
        </g>
      )))}
      {pts.map((_, i) => <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">{i + 1}</text>)}
    </svg>
  );
}
