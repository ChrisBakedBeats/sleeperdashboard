import type { PlayerMap, SeasonPoints } from "./sleeper";
import PlayerLink from "./PlayerLink";

type Props = { players: PlayerMap; season: SeasonPoints; week: number; starters: string[]; slots: string[]; bench: string[] };

const f = (n?: number) => (n == null ? "-" : n.toFixed(1));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export function Spark({ pts }: { pts: (number | undefined)[] }) {
  const step = 8, h = 28, pad = 3;
  const max = Math.max(20, ...pts.map((p) => p ?? 0));
  const x = (i: number) => i * step + step / 2;
  const y = (p: number) => h - pad - (Math.max(p, 0) / max) * (h - pad * 2);
  let d = "";
  let pen = false;
  pts.forEach((p, i) => {
    if (p == null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i)} ${y(p)}`;
    pen = true;
  });
  return (
    <svg width={pts.length * step} height={h} role="img" aria-label={`Points by week: ${pts.map((p) => p ?? "none").join(", ")}`}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (p == null ? null : <circle key={i} cx={x(i)} cy={y(p)} r={1.8} fill="var(--accent)" />))}
    </svg>
  );
}

function Row({ id, slot, players, season, week }: { id: string; slot: string; players: PlayerMap; season: SeasonPoints; week: number }) {
  const p = players[id];
  const pts = Array.from({ length: week }, (_, i) => season[id]?.[i]);
  const done = pts.slice(0, week - 1);
  const played = done.filter((x): x is number => x != null && x !== 0);
  const avg = played.length ? sum(played) / played.length : undefined;
  const l3 = played.slice(-3);
  const l3avg = l3.length ? sum(l3) / l3.length : undefined;
  return (
    <tr>
      <td>{slot}</td>
      <td>{id === "0" ? "Empty" : <PlayerLink id={id} name={p?.name ?? id} />} <small>{p?.pos} {p?.team}</small>{p?.injury && <b className="injury"> {p.injury}</b>}</td>
      <td>{f(pts[week - 1])}</td>
      <td>{f(done[week - 2])}</td>
      <td>{f(avg)}</td>
      <td>{f(l3avg)}</td>
      <td>{f(played.length ? sum(played) : undefined)}</td>
      <td><Spark pts={pts} /></td>
    </tr>
  );
}

export default function RosterTable({ players, season, week, starters, slots, bench }: Props) {
  const head = (label: string) => <tr className="group"><th colSpan={8}>{label}</th></tr>;
  return (
    <section className="panel wide">
      <h2>Your roster</h2>
      <div className="scroll">
        <table className="roster">
          <thead>
            <tr><th>Slot</th><th>Player</th><th>Week {week}</th><th>Last wk</th><th>Avg</th><th>Last 3</th><th>Total</th><th>Per Week</th></tr>
          </thead>
          <tbody>
            {head("Starters")}
            {starters.map((id, i) => <Row key={"s" + i + id} id={id} slot={slots[i]} players={players} season={season} week={week} />)}
            {head("Bench")}
            {bench.map((id) => <Row key={"b" + id} id={id} slot="BN" players={players} season={season} week={week} />)}
          </tbody>
        </table>
      </div>
      <p className="note">Points use your league's scoring. Avg, Last 3, and Total cover completed weeks and skip zero-point weeks, so byes and inactive games don't drag them down. The current week may be partial.</p>
    </section>
  );
}
