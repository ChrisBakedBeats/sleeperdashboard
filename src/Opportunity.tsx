import { useEffect, useState, type ReactNode } from "react";
import WeekChart from "./WeekChart";
import RedZone from "./RedZone";
import { cards, columns, findEntry, groupOf, loadMetrics, oppPts, type Metrics } from "./metrics";

export default function Opportunity({ gsis, name, pos, team }: { gsis?: string | null; name: string; pos: string; team: string }) {
  const [m, setM] = useState<Metrics | "missing">();
  useEffect(() => { loadMetrics().then(setM).catch(() => setM("missing")); }, []);

  const group = groupOf(pos);
  let body;
  let chart: ReactNode = null;
  let rz: ReactNode = null;
  if (!group) body = <p className="note">Opportunity metrics cover QB, RB, WR, and TE. Kickers and defenses depend on team and matchup context, so they aren't included yet.</p>;
  else if (m === undefined) body = <p className="note">Loading metrics…</p>;
  else if (m === "missing") body = <p className="note">The metrics file wasn't found. It's built during each deploy. When running locally, run npm run data first.</p>;
  else if (m.error) body = <p className="note">The metrics data didn't build: {m.error}</p>;
  else {
    const hit = findEntry(m, gsis, name, pos, team);
    const rec = hit?.[1];
    if (!rec) body = <p className="note">No {m.season} game data was found for this player. They may not have played yet, or couldn't be matched by NFL ID or name.</p>;
    else {
      const cols = columns(group);
      const last = m.through ?? Math.max(...rec.weeks.map((w) => w.w));
      const byWeek = new Map(rec.weeks.map((w) => [w.w, w]));
      const pts = Array.from({ length: last }, (_, i) => {
        const w = rec.weeks.find((x) => x.w === i + 1);
        return w ? oppPts(w, group) : undefined;
      });
      const vals = pts.filter((v): v is number => v != null);
      chart = (
        <>
          <h3>Opportunity points per game</h3>
          <section className="panel">
            <WeekChart pts={pts} avg={vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined} />
            <p className="note">Estimated PPR value of each game's volume for the {m.season} season. The dashed line is the season average. Gaps are weeks the player didn't play.</p>
          </section>
        </>
      );
      rz = <RedZone id={hit![0]} group={group} played={rec.weeks.map((w) => w.w)} team={rec.team} />;
      body = (
        <>
          <dl className="bio">
            {cards(group, rec.weeks).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <div className="scroll">
            <table className="weeks">
              <thead><tr><th>Week</th>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>
                {Array.from({ length: last }, (_, i) => last - i).map((wk) => {
                  const w = byWeek.get(wk);
                  return <tr key={wk}><td>{wk}</td>{cols.map((c) => <td key={c.key}>{w ? c.fmt(w) : "-"}</td>)}</tr>;
                })}
              </tbody>
            </table>
          </div>
          <p className="note">
            Data through week {m.through}, updated {m.generated ? new Date(m.generated).toLocaleDateString() : "recently"}.
            Opportunity points estimate what a player's volume is normally worth in PPR scoring (about 0.65 per carry, 1.7 per target, and 0.45 per pass attempt), so treat them as a rough baseline.
            Points over expected is actual PPR points minus that baseline: positive can mean regression risk, negative can mean production is due. A dash means no volume that week (a bye, an inactive game, or no carries, targets, or attempts).
          </p>
        </>
      );
    }
  }
  return (<><h3>Opportunity</h3><section className="panel">{body}</section>{chart}{rz}</>);
}
