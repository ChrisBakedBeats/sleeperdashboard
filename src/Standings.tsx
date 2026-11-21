import { useEffect, useState } from "react";
import * as S from "./sleeper";

export default function Standings({ league, userId }: { league: S.League; userId: string }) {
  const [rosters, setRosters] = useState<S.Roster[]>();
  const [users, setUsers] = useState<S.LeagueUser[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([S.getRosters(league.league_id), S.getLeagueUsers(league.league_id)])
      .then(([r, u]) => { setRosters(r); setUsers(u); })
      .catch((e) => setError((e as Error).message));
  }, [league.league_id]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!rosters) return <p className="note">Loading standings for {league.name}…</p>;

  const teamName = (r: S.Roster) => {
    const u = users.find((x) => x.user_id === r.owner_id);
    return u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`;
  };
  const pf = (r: S.Roster) => r.settings.fpts + (r.settings.fpts_decimal ?? 0) / 100;
  const pa = (r: S.Roster) => (r.settings.fpts_against == null ? undefined : r.settings.fpts_against + (r.settings.fpts_against_decimal ?? 0) / 100);
  const sorted = [...rosters].sort((a, b) => b.settings.wins - a.settings.wins || pf(b) - pf(a));

  return (
    <section className="panel wide">
      <h2>Standings</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>#</th><th>Team</th><th>Record</th><th>Points for</th><th>Points against</th></tr></thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.roster_id} className={r.owner_id === userId ? "me" : ""}>
                <td>{i + 1}</td>
                <td>{teamName(r)}</td>
                <td>{r.settings.wins}-{r.settings.losses}{r.settings.ties ? `-${r.settings.ties}` : ""}</td>
                <td>{pf(r).toFixed(2)}</td>
                <td>{pa(r)?.toFixed(2) ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Sorted by wins, then points for.</p>
    </section>
  );
}
