import { useEffect, useMemo, useState } from "react";
import * as S from "./sleeper";
import { loadStats, type StatsData } from "./stats";
import { buildReport } from "./check";

type Props = { leagues: S.League[]; leagueId?: string; onLeague: (id: string) => void; week: number; players: S.PlayerMap };

export default function CheckPage({ leagues, leagueId, onLeague, week, players }: Props) {
  const league = leagues.find((l) => l.league_id === leagueId) ?? leagues[0];
  const [bundle, setBundle] = useState<S.LeagueBundle | "error">();
  const [stats, setStats] = useState<StatsData | null>();
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadStats().then(setStats).catch(() => setStats(null)); }, []);
  useEffect(() => {
    if (!league) return;
    setBundle(undefined);
    S.getLeagueBundle(league.league_id, week).then(setBundle).catch(() => setBundle("error"));
  }, [league?.league_id, week]);

  const report = useMemo(
    () => (league && bundle && bundle !== "error" && stats && !stats.error && Object.keys(players).length ? buildReport(league, bundle, stats, players) : null),
    [league, bundle, stats, players],
  );

  const copy = async () => {
    if (!report) return;
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  return (
    <>
      <a className="back" href="#/">Back to dashboard</a>
      <h2>Score check</h2>
      <p className="note">Compares the dashboard's calculated points with Sleeper's own scores for rostered players in completed weeks. Pick a league, copy the report, and paste it into the chat.</p>
      <nav aria-label="Leagues">
        {leagues.map((l) => <button key={l.league_id} aria-pressed={l.league_id === league?.league_id} onClick={() => onLeague(l.league_id)}>{l.name}</button>)}
      </nav>
      {stats === null || stats?.error ? <p className="error" role="alert">Stats data isn't available{stats?.error ? `: ${stats.error}` : ""}.</p>
        : bundle === "error" ? <p className="error" role="alert">Couldn't load this league.</p>
        : !report ? <p className="note">Building report…</p>
        : (
          <section className="panel">
            <button onClick={copy}>{copied ? "Copied" : "Copy report"}</button>
            <pre className="report">{report}</pre>
          </section>
        )}
    </>
  );
}
