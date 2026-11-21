import { useEffect, useState } from "react";
import { loadStats, type StatsData } from "./stats";

const COLS: { label: string; get: (s: Record<string, number>) => number }[] = [
  { label: "Sacks", get: (s) => s.sack ?? 0 },
  { label: "INT", get: (s) => s.int ?? 0 },
  { label: "Fum rec", get: (s) => s.fum_rec ?? 0 },
  { label: "Forced fum", get: (s) => s.ff ?? 0 },
  { label: "TD", get: (s) => s.def_st_td ?? 0 },
  { label: "Safeties", get: (s) => s.safe ?? 0 },
  { label: "Blocked", get: (s) => s.blk_kick ?? 0 },
  { label: "Pts allowed", get: (s) => s.pts_allow ?? 0 },
  { label: "Yds allowed", get: (s) => s.yds_allow ?? 0 },
];

export default function DefenseStats({ id }: { id: string }) {
  const [st, setSt] = useState<StatsData | null>();
  useEffect(() => { loadStats().then(setSt).catch(() => setSt(null)); }, []);

  const entry = st?.players[`DEF-${id}`];
  let body;
  if (st === undefined) body = <p className="note">Loading defense stats…</p>;
  else if (!entry) body = <p className="note">Defense stats aren't available yet. They're built during each deploy. When running locally, run npm run data first.</p>;
  else {
    const last = Math.max(0, ...entry.weeks.map((w) => w.w), st?.through ?? 0);
    const byWeek = new Map(entry.weeks.map((w) => [w.w, w.s]));
    body = (
      <>
        <div className="scroll">
          <table className="weeks">
            <thead><tr><th>Week</th>{COLS.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: last }, (_, i) => last - i).map((wk) => {
                const s = byWeek.get(wk);
                return <tr key={wk}><td>{wk}</td>{COLS.map((c) => <td key={c.label}>{s ? Math.round(c.get(s)) : "-"}</td>)}</tr>;
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          Counts come from play-by-play data. Points allowed are points scored by the opposing offense (touchdowns, extra points, two-point tries, and field goals).
          Yards allowed are net yards from passing and rushing plays. A dash means the team didn't play that week.
        </p>
      </>
    );
  }
  return (<><h3>Defense stats by week</h3><section className="panel">{body}</section></>);
}
