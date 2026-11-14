import { useEffect, useState } from "react";
import * as S from "./sleeper";
import Opportunity from "./Opportunity";

type Props = { id: string; players: S.PlayerMap; leagues: S.League[]; week: number; userId: string; trending: S.Trend[] };
type Row = { league: S.League; owner: string | null; mine: boolean; pts: (number | undefined)[] };

const f = (n?: number) => (n == null ? "-" : n.toFixed(1));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const height = (h?: string | null) => (h && /^\d+$/.test(h) ? `${Math.floor(+h / 12)}'${+h % 12}"` : h ?? undefined);

function WeekChart({ pts }: { pts: (number | undefined)[] }) {
  const W = 720, H = 260, L = 40, R = 12, T = 20, B = 30;
  const vals = pts.filter((p): p is number => p != null);
  const top = Math.max(20, ...vals);
  const bottom = Math.min(0, ...vals);
  const step = top - bottom > 40 ? 20 : 10;
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
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxWidth: 900 }} role="img" aria-label={`Points by week: ${pts.map((v) => v ?? "none").join(", ")}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{t}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((v, i) => (v == null ? null : (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={4} fill="var(--accent)" />
          <text x={x(i)} y={y(v) - 9} textAnchor="middle" fontSize="11" fill="var(--ink)">{v.toFixed(1)}</text>
        </g>
      )))}
      {pts.map((_, i) => <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">{i + 1}</text>)}
    </svg>
  );
}

export default function PlayerPage({ id, players, leagues, week, userId, trending }: Props) {
  const p = players[id];
  const [leagueId, setLeagueId] = useState(leagues[0]?.league_id);
  const league = leagues.find((l) => l.league_id === leagueId) ?? leagues[0];
  const [row, setRow] = useState<Row | "error">();

  useEffect(() => {
    if (!league) return;
    let live = true;
    setRow(undefined);
    S.getLeagueBundle(league.league_id, week)
      .then((b) => {
        const r = b.rosters.find((x) => [...(x.players ?? []), ...(x.reserve ?? []), ...(x.taxi ?? [])].includes(id));
        const u = b.users.find((x) => x.user_id === r?.owner_id);
        const season = S.toSeasonPoints(b.byWeek);
        const pts = Array.from({ length: b.byWeek.length }, (_, i) => season[id]?.[i]);
        const owner = r ? u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}` : null;
        if (live) setRow({ league, owner, mine: r?.owner_id === userId, pts });
      })
      .catch(() => live && setRow("error"));
    return () => { live = false; };
  }, [id, league?.league_id, week, userId]);

  const back = <a className="back" href="#/">Back to dashboard</a>;
  if (Object.keys(players).length === 0) return <>{back}<p className="note">Loading player data…</p></>;
  if (!p) return <>{back}<p className="error" role="alert">No player found with ID {id}.</p></>;

  const adds = trending.find((t) => t.player_id === id)?.count;
  const bio: [string, string | number | null | undefined][] = [
    ["Age", p.age],
    ["Height", height(p.height)],
    ["Weight", p.weight ? `${p.weight} lb` : undefined],
    ["College", p.college],
    ["Experience", p.exp != null ? (p.exp === 0 ? "Rookie" : `${p.exp} year${p.exp === 1 ? "" : "s"}`) : undefined],
    ["Status", p.status],
    ["Depth chart", p.depth != null ? `${p.depthPos ?? p.pos} ${p.depth}` : undefined],
    ["Eligible at", p.fpos?.join(", ")],
  ];

  return (
    <>
      {back}
      <header className="phead">
        <h2>{p.name}</h2>
        <p className="note">{[p.pos, p.team, p.num != null ? `#${p.num}` : ""].filter(Boolean).join(", ")}</p>
      </header>

      <div className="grid">
        <section className="panel">
          <h3>Profile</h3>
          <dl className="bio">
            {bio.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          {adds != null && <p className="note">{adds.toLocaleString()} Sleeper adds in the last 24 hours.</p>}
        </section>

        {p.injury && (
          <section className="panel">
            <h3>Injury report</h3>
            <p><b className="injury">{p.injury}</b>{p.injPart ? ` (${p.injPart})` : ""}</p>
            {p.injNotes && <p className="note">{p.injNotes}</p>}
          </section>
        )}
      </div>

      <h3>League stats</h3>
      <nav aria-label="Leagues">
        {leagues.map((l) => (
          <button key={l.league_id} aria-pressed={l.league_id === league?.league_id} onClick={() => setLeagueId(l.league_id)}>{l.name}</button>
        ))}
      </nav>
      {!league ? <p className="note">No leagues found for this season.</p> : row === undefined ? <p className="note">Loading {league.name}…</p> : row === "error" ? <p className="error" role="alert">Couldn't load {league.name}. Try again in a moment.</p> : (() => {
        const { owner, mine, pts } = row;
        const played = pts.slice(0, -1).filter((x): x is number => x != null && x !== 0);
        const l3 = played.slice(-3);
        return (
          <>
          <section className="panel">
            <p>{owner === null ? <b>Available as a free agent</b> : mine ? <b>On your team</b> : <>Owned by <b>{owner}</b></>}</p>
            <div className="facts">
              <div><span>This week</span><strong>{f(pts[pts.length - 1])}</strong></div>
              <div><span>Average</span><strong>{f(played.length ? sum(played) / played.length : undefined)}</strong></div>
              <div><span>Last 3</span><strong>{f(l3.length ? sum(l3) / l3.length : undefined)}</strong></div>
              <div><span>Total</span><strong>{f(played.length ? sum(played) : undefined)}</strong></div>
            </div>
            <div className="scroll">
              <table className="weeks">
                <thead><tr>{pts.map((_, i) => <th key={i}>{i + 1}</th>)}</tr></thead>
                <tbody><tr>{pts.map((x, i) => <td key={i}>{f(x)}</td>)}</tr></tbody>
              </table>
            </div>
            <p className="note">Weekly points use this league's scoring and only exist for weeks the player was on a roster.</p>
          </section>
          <h3>Per week</h3>
          <section className="panel">
            <WeekChart pts={pts} />
            <p className="note">Points by week in this league's scoring. Gaps are weeks the player wasn't on a roster.</p>
          </section>
          </>
        );
      })()}

      <Opportunity gsis={p.gsis} name={p.name} pos={p.pos} team={p.team} />
    </>
  );
}
