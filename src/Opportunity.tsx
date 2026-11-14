import { useEffect, useState } from "react";
import { cards, columns, findPlayer, groupOf, loadMetrics, type Metrics } from "./metrics";

export default function Opportunity({ gsis, name, pos, team }: { gsis?: string | null; name: string; pos: string; team: string }) {
  const [m, setM] = useState<Metrics | "missing">();
  useEffect(() => { loadMetrics().then(setM).catch(() => setM("missing")); }, []);

  const group = groupOf(pos);
  let body;
  if (!group) body = <p className="note">Opportunity metrics cover QB, RB, WR, and TE. Kickers and defenses depend on team and matchup context, so they aren't included yet.</p>;
  else if (m === undefined) body = <p className="note">Loading metrics…</p>;
  else if (m === "missing") body = <p className="note">The metrics file wasn't found. It's built during each deploy. When running locally, run npm run data first.</p>;
  else if (m.error) body = <p className="note">The metrics data didn't build: {m.error}</p>;
  else {
    const rec = findPlayer(m, gsis, name, pos, team);
    if (!rec) body = <p className="note">No {m.season} game data was found for this player. They may not have played yet, or couldn't be matched by NFL ID or name.</p>;
    else {
      const cols = columns(group);
      const recent = [...rec.weeks].reverse().slice(0, 8);
      body = (
        <>
          <dl className="bio">
            {cards(group, rec.weeks).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <div className="scroll">
            <table className="weeks">
              <thead><tr><th>Week</th>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>
                {recent.map((w) => <tr key={w.w}><td>{w.w}</td>{cols.map((c) => <td key={c.key}>{c.fmt(w)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <p className="note">
            Data through week {m.through}, updated {m.generated ? new Date(m.generated).toLocaleDateString() : "recently"}.
            Opportunity points estimate what a player's volume is normally worth in PPR scoring (about 0.65 per carry, 1.7 per target, and 0.45 per pass attempt), so treat them as a rough baseline.
            Points over expected is actual PPR points minus that baseline: positive can mean regression risk, negative can mean production is due.
          </p>
        </>
      );
    }
  }
  return (<><h3>Opportunity</h3><section className="panel">{body}</section></>);
}
