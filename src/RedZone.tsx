import { useEffect, useState, type ReactNode } from "react";
import WeekChart from "./WeekChart";
import type { Group } from "./metrics";
import { loadRedZone, rzCards, rzColumns, weekRows, type RedZoneData } from "./redzone";

type Props = { id: string; group: Group; played: number[]; team: string };

export default function RedZone({ id, group, played, team }: Props) {
  const [d, setD] = useState<RedZoneData | "missing">();
  useEffect(() => { loadRedZone().then(setD).catch(() => setD("missing")); }, []);

  let body;
  let chart: ReactNode = null;
  if (d === undefined) body = <p className="note">Loading red zone data…</p>;
  else if (d === "missing") body = <p className="note">The red zone file wasn't found. It's built during each deploy. When running locally, run npm run data first.</p>;
  else if (d.error) body = <p className="note">The red zone data didn't build: {d.error}</p>;
  else {
    const rows = weekRows(d.players[id]?.weeks ?? [], played, team);
    const cols = rzColumns(group);
    const last = Math.max(0, d.through ?? 0, ...rows.map((r) => r.w));
    const byWeek = new Map(rows.map((r) => [r.w, r]));
    const touches = (r: (typeof rows)[number]) => (group === "QB" ? r.rzpa + r.rzc : r.rzt + r.rzc);
    if (last > 0) {
      const pts = Array.from({ length: last }, (_, i) => {
        const r = rows.find((x) => x.w === i + 1);
        return r ? touches(r) : undefined;
      });
      chart = (
        <>
          <h3>Red zone touches per game</h3>
          <section className="panel">
            <WeekChart pts={pts} minTop={4} decimals={0} />
            <p className="note">
              {group === "QB" ? "Red zone pass attempts plus rushes" : "Red zone carries plus targets"} in each game this season. Gaps are weeks the player didn't play.
            </p>
          </section>
        </>
      );
    }
    body = (
      <>
        <dl className="bio">
          {rzCards(group, rows, d.teams).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="scroll">
          <table className="weeks">
            <thead><tr><th>Week</th>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: last }, (_, i) => last - i).map((wk) => {
                const r = byWeek.get(wk);
                return <tr key={wk}><td>{wk}</td>{cols.map((c) => <td key={c.key}>{r ? c.get(r) : "-"}</td>)}</tr>;
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          Red zone means inside the opponent's 20-yard line. Counts include every game the player played this season and come from play-by-play data through week {d.through}.
          Team shares compare a player's red zone carries or targets to the team's total in the same games. Two-point tries are excluded. A dash means the player didn't play that week.
        </p>
      </>
    );
  }
  return (<><h3>Red zone usage</h3><section className="panel">{body}</section>{chart}</>);
}
