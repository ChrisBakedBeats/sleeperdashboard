import { useEffect, useState } from "react";
import * as S from "./sleeper";
import WeekChart from "./WeekChart";
import Opportunity from "./Opportunity";
import DefenseStats from "./DefenseStats";
import { entryFor, loadStats, unsupportedKeys, validate, weeklyPoints } from "./stats";

type Props = { id: string; players: S.PlayerMap; leagues: S.League[]; leagueId?: string; onLeague: (id: string) => void; week: number; userId: string; trending: S.Trend[] };
type Row = {
  league: S.League; owner: string | null; mine: boolean; pts: (number | undefined)[];
  calc: boolean; check?: { match: number; total: number; dMatch: number; dTotal: number }; unsupported: string[];
};

const f = (n?: number) => (n == null ? "-" : n.toFixed(1));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const height = (h?: string | null) => (h && /^\d+$/.test(h) ? `${Math.floor(+h / 12)}'${+h % 12}"` : h ?? undefined);

export default function PlayerPage({ id, players, leagues, leagueId, onLeague, week, userId, trending }: Props) {
  const p = players[id];
  const league = leagues.find((l) => l.league_id === leagueId) ?? leagues[0];
  const [row, setRow] = useState<Row | "error">();

  useEffect(() => {
    if (!league) return;
    let live = true;
    setRow(undefined);
    Promise.all([S.getLeagueBundle(league.league_id, week), loadStats().catch(() => null)])
      .then(([b, st]) => {
        const r = b.rosters.find((x) => [...(x.players ?? []), ...(x.reserve ?? []), ...(x.taxi ?? [])].includes(id));
        const u = b.users.find((x) => x.user_id === r?.owner_id);
        const season = S.toSeasonPoints(b.byWeek);
        let pts = Array.from({ length: b.byWeek.length }, (_, i) => season[id]?.[i]);
        const sc = league.scoring_settings;
        let calc = false;
        let check: Row["check"];
        if (st && !st.error && sc) {
          const entry = p ? entryFor(st, id, p) : undefined;
          if (entry) { pts = weeklyPoints(entry, sc, b.byWeek.length); calc = true; }
          check = validate(b.byWeek.slice(0, -1), players, st, sc);
        }
        const owner = r ? u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}` : null;
        if (live) setRow({ league, owner, mine: r?.owner_id === userId, pts, calc, check, unsupported: sc ? unsupportedKeys(sc) : [] });
      })
      .catch(() => live && setRow("error"));
    return () => { live = false; };
  }, [id, league?.league_id, week, userId, players]);

  const back = <a className="back" href="#/">Back to dashboard</a>;
  if (Object.keys(players).length === 0) return <>{back}<p className="note">Loading player data…</p></>;
  if (!p) return <>{back}<p className="error" role="alert">No player found with ID {id}. Sleeper's player list doesn't include this ID, which usually means a retired or long-inactive player.</p></>;

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
          <button key={l.league_id} aria-pressed={l.league_id === league?.league_id} onClick={() => onLeague(l.league_id)}>{l.name}</button>
        ))}
      </nav>
      {!league ? <p className="note">No leagues found for this season.</p> : row === undefined ? <p className="note">Loading {league.name}…</p> : row === "error" ? <p className="error" role="alert">Couldn't load {league.name}. Try again in a moment.</p> : (() => {
        const { owner, mine, pts, calc, check, unsupported } = row;
        const played = pts.slice(0, -1).filter((x): x is number => x != null && (calc || x !== 0));
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
            {calc ? (
              <p className="note">Points are calculated from NFL stats using this league's scoring settings, so every game the player played is included, whether or not he was on a roster. Average, Last 3, and Total count games played. A dash means no game that week (bye or inactive).</p>
            ) : (
              <p className="note">Calculated stats weren't available for this player, so these points come from league matchups and only cover weeks he was on a roster.</p>
            )}
            {check && (p.pos === "DEF" ? check.dTotal : check.total) > 0 && <p className="note">Check: the calculated points match Sleeper's own scores for {p.pos === "DEF" ? check.dMatch : check.match} of {p.pos === "DEF" ? check.dTotal : check.total} rostered {p.pos === "DEF" ? "defense" : "player"}-weeks in this league (completed weeks).</p>}
            {unsupported.length > 0 && <p className="note">Scoring rules not modeled: {unsupported.join(", ")}.</p>}
          </section>
          <h3>Per week</h3>
          <section className="panel">
            <WeekChart pts={pts} />
            <p className="note">Points by week in this league's scoring. Gaps are weeks with no data: {calc ? "no game (bye or inactive)" : "the player wasn't on a roster"}.</p>
          </section>
          </>
        );
      })()}

      {p.pos === "DEF" ? <DefenseStats id={id} /> : <Opportunity gsis={p.gsis} name={p.name} pos={p.pos} team={p.team} />}
    </>
  );
}
