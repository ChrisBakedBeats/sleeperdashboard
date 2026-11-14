import type { PlayerMap, SeasonPoints } from "./sleeper";

type Props = { players: PlayerMap; season: SeasonPoints; week: number; starters: string[]; slots: string[]; bench: string[] };

const f = (n?: number) => (n == null ? "-" : n.toFixed(1));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

function Spark({ pts }: { pts: (number | undefined)[] }) {
  const w = 5, h = 24;
  const max = Math.max(20, ...pts.map((p) => p ?? 0));
  return (
    <svg width={pts.length * (w + 1)} height={h} role="img" aria-label={`Points by week: ${pts.map((p) => p ?? "none").join(", ")}`}>
      {pts.map((p, i) => {
        const bh = p == null || p <= 0 ? 1 : Math.max(1, (p / max) * h);
        return <rect key={i} x={i * (w + 1)} y={h - bh} width={w} height={bh} fill="var(--accent)" opacity={p == null ? 0.2 : 1} />;
      })}
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
      <td>{id === "0" ? "Empty" : p?.name ?? id} <small>{p?.pos} {p?.team}</small>{p?.injury && <b className="injury"> {p.injury}</b>}</td>
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
            <tr><th>Slot</th><th>Player</th><th>Week {week}</th><th>Last wk</th><th>Avg</th><th>Last 3</th><th>Total</th><th>By week</th></tr>
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
