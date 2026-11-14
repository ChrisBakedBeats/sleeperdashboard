import { useEffect, useMemo, useState } from "react";
import * as S from "./sleeper";
import Waivers from "./Waivers";
import RosterTable from "./RosterTable";
import PlayerLink from "./PlayerLink";
import PlayerPage from "./PlayerPage";
import Splash from "./Splash";
import ThemeToggle from "./ThemeToggle";

const SAVED_USER = "sleeper-username";
const savedUser = () => { try { return localStorage.getItem(SAVED_USER); } catch { return null; } };

const parseRoute = () => {
  const m = window.location.hash.match(/^#\/player\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};

export default function App() {
  const [username, setUsername] = useState<string | null>(savedUser);
  const [lastTried, setLastTried] = useState(() => savedUser() ?? "");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<S.NflState>();
  const [userId, setUserId] = useState<string>();
  const [leagues, setLeagues] = useState<S.League[]>([]);
  const [leagueId, setLeagueId] = useState<string>();
  const [players, setPlayers] = useState<S.PlayerMap>({});
  const [trending, setTrending] = useState<S.Trend[]>([]);
  const [error, setError] = useState<string>();
  const [view, setView] = useState<"waivers" | "league">("waivers");
  const [playerId, setPlayerId] = useState<string | null>(parseRoute);

  useEffect(() => {
    const onHash = () => { setPlayerId(parseRoute()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!username) return;
    let live = true;
    setError(undefined); setLoading(true); setLastTried(username);
    (async () => {
      try {
        const st = await S.getState();
        const user = await S.getUser(username);
        if (!user) throw new Error(`No Sleeper user named "${username}". Check the spelling and try again.`);
        const ls = await S.getLeagues(user.user_id, st.season);
        if (!live) return;
        setState(st); setUserId(user.user_id); setLeagues(ls); setLeagueId(ls[0]?.league_id);
        try { localStorage.setItem(SAVED_USER, username); } catch { /* ignore */ }
        S.getPlayers().then(setPlayers).catch(() => {});
        S.getTrending().then(setTrending).catch(() => {});
      } catch (e) {
        if (!live) return;
        setError((e as Error).message);
        setUsername(null);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [username]);

  const signOut = () => {
    try { localStorage.removeItem(SAVED_USER); } catch { /* ignore */ }
    setUsername(null); setUserId(undefined); setState(undefined); setLeagues([]); setLeagueId(undefined); setError(undefined);
    window.location.hash = "#/";
  };

  const league = leagues.find((l) => l.league_id === leagueId);
  const who = (id: string) => players[id]?.name ?? id;

  if (!userId) return <Splash initial={lastTried} loading={loading} error={error} onSubmit={setUsername} />;

  return (
    <main>
      <header>
        <h1>Sleeper Dashboard</h1>
        <div className="who">
          <ThemeToggle />
          <span>Signed in as <b>{username}</b></span>
          <button onClick={signOut}>Change user</button>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {state && <p className="note">{state.season} season, week {state.week}. {leagues.length} league{leagues.length === 1 ? "" : "s"} found.</p>}

      {playerId && state && userId && <PlayerPage id={playerId} players={players} leagues={leagues} week={state.week} userId={userId} trending={trending} />}

      <div hidden={playerId != null}>
      <nav aria-label="Leagues">
        {leagues.map((l) => (
          <button key={l.league_id} aria-pressed={l.league_id === leagueId} onClick={() => setLeagueId(l.league_id)}>{l.name}</button>
        ))}
      </nav>

      <div className="chips" role="tablist">
        <button aria-pressed={view === "waivers"} onClick={() => setView("waivers")}>Waivers</button>
        <button aria-pressed={view === "league"} onClick={() => setView("league")}>Matchup and roster</button>
      </div>

      <div className="grid">
        {league && state && userId && view === "waivers" && <Waivers key={league.league_id} league={league} userId={userId} week={state.week} players={players} trending={trending} />}
        {league && state && userId && view === "league" && <LeagueView key={league.league_id} league={league} userId={userId} week={state.week} players={players} />}
        <section className="panel" hidden={view === "waivers"}>
          <h2>Most added in the last 24 hours</h2>
          {trending.length === 0 ? <p className="note">Loading trending players…</p> : (
            <ol className="plain">
              {trending.slice(0, 15).map((t) => (
                <li key={t.player_id}><span><PlayerLink id={t.player_id} name={who(t.player_id)} /> <small>{players[t.player_id]?.pos} {players[t.player_id]?.team}</small></span><b>{t.count.toLocaleString()}</b></li>
              ))}
            </ol>
          )}
        </section>
      </div>
      </div>
    </main>
  );
}

type LeagueData = { rosters: S.Roster[]; users: S.LeagueUser[]; byWeek: S.Matchup[][] };

function LeagueView({ league, userId, week, players }: { league: S.League; userId: string; week: number; players: S.PlayerMap }) {
  const [data, setData] = useState<LeagueData>();
  const [error, setError] = useState<string>();
  const [sel, setSel] = useState(week);

  useEffect(() => {
    S.getLeagueBundle(league.league_id, week)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [league.league_id, week]);

  const season = useMemo(() => (data ? S.toSeasonPoints(data.byWeek) : {}), [data]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="note">Loading {league.name}…</p>;

  const weeks = data.byWeek.length;
  const selWeek = Math.min(sel, weeks);
  const weekMatchups = data.byWeek[selWeek - 1] ?? [];

  const teamName = (r?: S.Roster) => {
    const u = data.users.find((x) => x.user_id === r?.owner_id);
    return u?.metadata?.team_name || u?.display_name || (r ? `Team ${r.roster_id}` : "Unknown");
  };
  const fpts = (r: S.Roster) => r.settings.fpts + (r.settings.fpts_decimal ?? 0) / 100;
  const standings = [...data.rosters].sort((a, b) => b.settings.wins - a.settings.wins || fpts(b) - fpts(a));

  const mine = data.rosters.find((r) => r.owner_id === userId);
  const myM = weekMatchups.find((m) => m.roster_id === mine?.roster_id);
  const oppM = myM?.matchup_id != null ? weekMatchups.find((m) => m.matchup_id === myM.matchup_id && m.roster_id !== myM.roster_id) : undefined;
  const opp = data.rosters.find((r) => r.roster_id === oppM?.roster_id);

  const starters = myM?.starters ?? mine?.starters ?? [];
  const bench = (myM?.players ?? mine?.players ?? []).filter((p) => !starters.includes(p));

  return (
    <>
      <section className="panel weekbar">
        <label htmlFor="wk">Week</label>
        <select id="wk" value={selWeek} onChange={(e) => setSel(Number(e.target.value))}>
          {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>{w === week ? `${w} (current)` : w}</option>
          ))}
        </select>
      </section>

      <section className="panel scoreboard">
        <h2>Week {selWeek} matchup</h2>
        {myM ? (
          <div className="score">
            <div><span>{teamName(mine)}</span><strong>{myM.points.toFixed(2)}</strong></div>
            {oppM ? <div><span>{teamName(opp)}</span><strong>{oppM.points.toFixed(2)}</strong></div> : <p className="note">No head-to-head opponent in this league format.</p>}
          </div>
        ) : <p className="note">No matchup found for you in week {selWeek}.</p>}
      </section>

      <RosterTable
        players={players}
        season={season}
        week={selWeek}
        starters={starters}
        slots={starters.map((_, i) => league.roster_positions[i] ?? "-")}
        bench={bench}
      />

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
