import { useEffect, useState } from "react";
import * as S from "./sleeper";
import PlayerLink from "./PlayerLink";
import { loadStats, recentForm, type StatsData } from "./stats";

const POS = ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"];

type Props = { league: S.League; userId: string; week: number; players: S.PlayerMap; trending: S.Trend[] };

export default function Waivers({ league, userId, week, players, trending }: Props) {
  const [rosters, setRosters] = useState<S.Roster[]>();
  const [users, setUsers] = useState<S.LeagueUser[]>([]);
  const [txns, setTxns] = useState<S.Txn[]>([]);
  const [pos, setPos] = useState("ALL");
  const [error, setError] = useState<string>();
  const [stats, setStats] = useState<StatsData | null>(null);
  useEffect(() => { loadStats().then(setStats).catch(() => setStats(null)); }, []);

  useEffect(() => {
    (async () => {
      try {
        const weeks = week > 1 ? [week, week - 1] : [week];
        const [r, u, ...t] = (await Promise.all([
          S.getRosters(league.league_id), S.getLeagueUsers(league.league_id),
          ...weeks.map((w) => S.getTxns(league.league_id, w)),
        ] as Promise<any>[])) as [S.Roster[], S.LeagueUser[], ...S.Txn[][]];
        setRosters(r); setUsers(u); setTxns(t.flat());
      } catch (e) { setError((e as Error).message); }
    })();
  }, [league.league_id, week]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!rosters) return <p className="note">Loading waivers for {league.name}…</p>;

  const mine = rosters.find((r) => r.owner_id === userId);
  const isFaab = league.settings?.waiver_type === 2;
  const budget = league.settings?.waiver_budget ?? 0;
  const left = budget - (mine?.settings.waiver_budget_used ?? 0);

  const teamName = (rid: number) => {
    const r = rosters.find((x) => x.roster_id === rid);
    const u = users.find((x) => x.user_id === r?.owner_id);
    return u?.metadata?.team_name || u?.display_name || `Team ${rid}`;
  };

  const taken = new Set<string>();
  rosters.forEach((r) => [...(r.players ?? []), ...(r.reserve ?? []), ...(r.taxi ?? [])].forEach((p) => taken.add(p)));
  const ready = Object.keys(players).length > 0;
  const available = trending.filter((t) => !taken.has(t.player_id) && players[t.player_id] && (pos === "ALL" || players[t.player_id].pos === pos));

  const claims = txns
    .filter((t) => t.type === "waiver" && t.adds)
    .flatMap((t) => Object.entries(t.adds!).map(([pid, rid]) => ({ key: t.transaction_id + pid, pid, rid, won: t.status === "complete", bid: t.settings?.waiver_bid, at: t.created })))
    .filter((c) => c.won || c.rid === mine?.roster_id)
    .sort((a, b) => b.at - a.at)
    .slice(0, 25);
  const bids = claims.filter((c) => c.won && c.bid != null).map((c) => c.bid as number).sort((a, b) => a - b);
  const median = bids.length ? bids[Math.floor(bids.length / 2)] : undefined;

  return (
    <>
      <section className="panel facts">
        <div><span>Waiver system</span><strong>{isFaab ? "FAAB" : "Priority"}</strong></div>
        {isFaab
          ? <div><span>Your budget left</span><strong>${left} <small>of ${budget}</small></strong></div>
          : <div><span>Your waiver position</span><strong>{mine?.settings.waiver_position ?? "n/a"}</strong></div>}
        {isFaab && <div><span>Winning bids lately</span><strong>{median != null ? `$${median} median, $${bids[bids.length - 1]} high` : "none yet"}</strong></div>}
      </section>

      <section className="panel">
        <h2>Available and trending</h2>
        <div className="chips">
          {POS.map((p) => <button key={p} aria-pressed={p === pos} onClick={() => setPos(p)}>{p}</button>)}
        </div>
        {!ready ? <p className="note">Loading player data…</p> : available.length === 0 ? <p className="note">No trending players at this position are available in this league.</p> : (
          <ol className="plain">
            {available.slice(0, 20).map((t) => {
              const p = players[t.player_id];
              const form = recentForm(stats, p, league.scoring_settings, week);
              return (
                <li key={t.player_id}>
                  <span><PlayerLink id={t.player_id} name={p.name} /> <small>{p.pos} {p.team}</small></span>
                  <span>{p.injury && <b className="injury">{p.injury} </b>}{form && <small>{form.avg.toFixed(1)} avg, {form.l3.toFixed(1)} last 3 </small>}<b>{t.count.toLocaleString()} adds</b></span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="panel">
        <h2>Recent waiver results</h2>
        {claims.length === 0 ? <p className="note">No waiver claims processed in the last two weeks.</p> : (
          <table>
            <thead><tr><th>Player</th><th>Team</th>{isFaab && <th>Bid</th>}<th>Result</th></tr></thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.key} className={c.rid === mine?.roster_id ? "me" : ""}>
                  <td><PlayerLink id={c.pid} name={players[c.pid]?.name ?? c.pid} /></td>
                  <td>{teamName(c.rid)}</td>
                  {isFaab && <td>{c.bid != null ? `$${c.bid}` : "n/a"}</td>}
                  <td>{c.won ? "Won" : "Lost"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
