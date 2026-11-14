import { useEffect, useState } from "react";
import * as S from "./sleeper";
import { Spark } from "./RosterTable";

type Props = { id: string; players: S.PlayerMap; leagues: S.League[]; week: number; userId: string; trending: S.Trend[] };
type Row = { league: S.League; owner: string | null; mine: boolean; pts: (number | undefined)[] };

const f = (n?: number) => (n == null ? "-" : n.toFixed(1));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const height = (h?: string | null) => (h && /^\d+$/.test(h) ? `${Math.floor(+h / 12)}'${+h % 12}"` : h ?? undefined);

export default function PlayerPage({ id, players, leagues, week, userId, trending }: Props) {
  const p = players[id];
  const [rows, setRows] = useState<Row[]>();

  useEffect(() => {
    let live = true;
    setRows(undefined);
    Promise.all(
      leagues.map(async (league): Promise<Row> => {
        const b = await S.getLeagueBundle(league.league_id, week);
        const r = b.rosters.find((x) => [...(x.players ?? []), ...(x.reserve ?? []), ...(x.taxi ?? [])].includes(id));
        const u = b.users.find((x) => x.user_id === r?.owner_id);
        const season = S.toSeasonPoints(b.byWeek);
        const pts = Array.from({ length: b.byWeek.length }, (_, i) => season[id]?.[i]);
        return { league, owner: r ? u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}` : null, mine: r?.owner_id === userId, pts };
      }),
    )
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]));
    return () => { live = false; };
  }, [id, leagues, week, userId]);

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

      <h3>In your leagues</h3>
      {!rows ? <p className="note">Loading your leagues…</p> : rows.length === 0 ? <p className="note">Couldn't load league data.</p> : (
        <div className="grid">
          {rows.map(({ league, owner, mine, pts }) => {
            const played = pts.slice(0, -1).filter((x): x is number => x != null && x !== 0);
            const l3 = played.slice(-3);
            return (
              <section className="panel wide" key={league.league_id}>
                <h2>{league.name}</h2>
                <p>{owner === null ? <b>Available as a free agent</b> : mine ? <b>On your team</b> : <>Owned by <b>{owner}</b></>}</p>
                <div className="facts">
                  <div><span>This week</span><strong>{f(pts[pts.length - 1])}</strong></div>
                  <div><span>Average</span><strong>{f(played.length ? sum(played) / played.length : undefined)}</strong></div>
                  <div><span>Last 3</span><strong>{f(l3.length ? sum(l3) / l3.length : undefined)}</strong></div>
                  <div><span>Total</span><strong>{f(played.length ? sum(played) : undefined)}</strong></div>
                  <div><span>Per week</span><Spark pts={pts} /></div>
                </div>
                <div className="scroll">
                  <table className="weeks">
                    <thead><tr>{pts.map((_, i) => <th key={i}>{i + 1}</th>)}</tr></thead>
                    <tbody><tr>{pts.map((x, i) => <td key={i}>{f(x)}</td>)}</tr></tbody>
                  </table>
                </div>
                <p className="note">Weekly points use this league's scoring and only exist for weeks the player was on a roster.</p>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
