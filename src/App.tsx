import { useEffect, useState } from "react";
import * as S from "./sleeper";

const SAVED_USER = "sleeper-username";
const startUser = () => { try { return localStorage.getItem(SAVED_USER) || "belicheckyoself14"; } catch { return "belicheckyoself14"; } };

export default function App() {
  const [input, setInput] = useState(startUser);
  const [username, setUsername] = useState(input);
  const [state, setState] = useState<S.NflState>();
  const [userId, setUserId] = useState<string>();
  const [leagues, setLeagues] = useState<S.League[]>([]);
  const [leagueId, setLeagueId] = useState<string>();
  const [players, setPlayers] = useState<S.PlayerMap>({});
  const [trending, setTrending] = useState<S.Trend[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setError(undefined);
    (async () => {
      try {
        const st = await S.getState();
        const user = await S.getUser(username);
        if (!user) throw new Error(`No Sleeper user named "${username}". Check the spelling and try again.`);
        const ls = await S.getLeagues(user.user_id, st.season);
        setState(st); setUserId(user.user_id); setLeagues(ls); setLeagueId(ls[0]?.league_id);
        try { localStorage.setItem(SAVED_USER, username); } catch { /* ignore */ }
        S.getPlayers().then(setPlayers).catch(() => {});
        S.getTrending().then(setTrending).catch(() => {});
      } catch (e) { setError((e as Error).message); }
    })();
  }, [username]);

  const league = leagues.find((l) => l.league_id === leagueId);
  const who = (id: string) => players[id]?.name ?? id;

  return (
    <main>
      <header>
        <h1>Sleeper Dashboard</h1>
        <form onSubmit={(e) => { e.preventDefault(); setUsername(input.trim()); }}>
          <label htmlFor="u">Sleeper username</label>
          <input id="u" value={input} onChange={(e) => setInput(e.target.value)} />
          <button>Load leagues</button>
        </form>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {state && <p className="note">{state.season} season, week {state.week}. {leagues.length} league{leagues.length === 1 ? "" : "s"} found.</p>}

      <nav aria-label="Leagues">
        {leagues.map((l) => (
          <button key={l.league_id} aria-pressed={l.league_id === leagueId} onClick={() => setLeagueId(l.league_id)}>{l.name}</button>
        ))}
      </nav>

      <div className="grid">
        {league && state && userId && <LeagueView key={league.league_id} league={league} userId={userId} week={state.week} players={players} />}
        <section className="panel">
          <h2>Most added in the last 24 hours</h2>
          {trending.length === 0 ? <p className="note">Loading trending players…</p> : (
            <ol className="plain">
              {trending.map((t) => (
                <li key={t.player_id}><span>{who(t.player_id)} <small>{players[t.player_id]?.pos} {players[t.player_id]?.team}</small></span><b>{t.count.toLocaleString()}</b></li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}

type LeagueData = { rosters: S.Roster[]; users: S.LeagueUser[]; matchups: S.Matchup[] };

function LeagueView({ league, userId, week, players }: { league: S.League; userId: string; week: number; players: S.PlayerMap }) {
  const [data, setData] = useState<LeagueData>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([S.getRosters(league.league_id), S.getLeagueUsers(league.league_id), S.getMatchups(league.league_id, week)])
      .then(([rosters, users, matchups]) => setData({ rosters, users, matchups }))
      .catch((e) => setError((e as Error).message));
  }, [league.league_id, week]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="note">Loading {league.name}…</p>;

  const teamName = (r?: S.Roster) => {
    const u = data.users.find((x) => x.user_id === r?.owner_id);
    return u?.metadata?.team_name || u?.display_name || (r ? `Team ${r.roster_id}` : "Unknown");
  };
  const fpts = (r: S.Roster) => r.settings.fpts + (r.settings.fpts_decimal ?? 0) / 100;
  const standings = [...data.rosters].sort((a, b) => b.settings.wins - a.settings.wins || fpts(b) - fpts(a));

  const mine = data.rosters.find((r) => r.owner_id === userId);
  const myM = data.matchups.find((m) => m.roster_id === mine?.roster_id);
  const oppM = myM?.matchup_id != null ? data.matchups.find((m) => m.matchup_id === myM.matchup_id && m.roster_id !== myM.roster_id) : undefined;
  const opp = data.rosters.find((r) => r.roster_id === oppM?.roster_id);

  const starters = mine?.starters ?? [];
  const bench = (mine?.players ?? []).filter((p) => !starters.includes(p));
  const row = (id: string, slot: string) => {
    const p = players[id];
    return (
      <li key={slot + id}>
        <span><em>{slot}</em> {id === "0" ? "Empty" : p?.name ?? id} <small>{p?.pos} {p?.team}</small></span>
        {p?.injury && <b className="injury">{p.injury}</b>}
      </li>
    );
  };

  return (
    <>
      <section className="panel scoreboard">
        <h2>Week {week} matchup</h2>
        {myM ? (
          <div className="score">
            <div><span>{teamName(mine)}</span><strong>{myM.points.toFixed(2)}</strong></div>
            {oppM ? <div><span>{teamName(opp)}</span><strong>{oppM.points.toFixed(2)}</strong></div> : <p className="note">No head-to-head opponent in this league format.</p>}
          </div>
        ) : <p className="note">No matchup found for you this week.</p>}
      </section>

      <section className="panel">
        <h2>Your roster</h2>
        <h3>Starters</h3>
        <ul className="plain">{starters.map((id, i) => row(id, league.roster_positions[i] ?? "—"))}</ul>
        <h3>Bench</h3>
        <ul className="plain">{bench.map((id) => row(id, "BN"))}</ul>
      </section>

      <section className="panel">
        <h2>Standings</h2>
        <table>
          <thead><tr><th>Team</th><th>Record</th><th>Points</th></tr></thead>
          <tbody>
            {standings.map((r) => (
              <tr key={r.roster_id} className={r.owner_id === userId ? "me" : ""}>
                <td>{teamName(r)}</td>
                <td>{r.settings.wins}-{r.settings.losses}{r.settings.ties ? `-${r.settings.ties}` : ""}</td>
                <td>{fpts(r).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
