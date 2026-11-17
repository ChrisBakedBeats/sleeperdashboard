import { useEffect, useState } from "react";
import type { Group } from "./metrics";
import { loadRedZone, rzCards, rzColumns, weekRows, type RedZoneData } from "./redzone";

type Props = { id: string; group: Group; played: number[]; team: string };

export default function RedZone({ id, group, played, team }: Props) {
  const [d, setD] = useState<RedZoneData | "missing">();
  useEffect(() => { loadRedZone().then(setD).catch(() => setD("missing")); }, []);

  let body;
  if (d === undefined) body = <p className="note">Loading red zone data…</p>;
  else if (d === "missing") body = <p className="note">The red zone file wasn't found. It's built during each deploy. When running locally, run npm run data first.</p>;
  else if (d.error) body = <p className="note">The red zone data didn't build: {d.error}</p>;
  else {
    const rows = weekRows(d.players[id]?.weeks ?? [], played, team);
    const cols = rzColumns(group);
    const recent = [...rows].reverse().slice(0, 8);
    body = (
      <>
        <dl className="bio">
          {rzCards(group, rows, d.teams).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="scroll">
          <table className="weeks">
            <thead><tr><th>Week</th>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>
              {recent.map((r) => <tr key={r.w}><td>{r.w}</td>{cols.map((c) => <td key={c.key}>{c.get(r)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
        <p className="note">
          Red zone means inside the opponent's 20-yard line. Counts include every game the player played this season and come from play-by-play data through week {d.through}.
          Team shares compare a player's red zone carries or targets to the team's total in the same games. Two-point tries are excluded.
        </p>
      </>
    );
  }
  return (<><h3>Red zone usage</h3><section className="panel">{body}</section></>);
}
