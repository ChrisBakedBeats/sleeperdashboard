import type { League, LeagueBundle, PlayerMap } from "./sleeper";
import { calcPoints, contributions, entryFor, unsupportedKeys, type StatsData } from "./stats";

const f2 = (n: number) => n.toFixed(2);
const signed = (n: number) => `${n > 0 ? "+" : ""}${f2(n)}`;
const tally = (items: string[]) => {
  const m = new Map<string, number>();
  items.forEach((k) => m.set(k, (m.get(k) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ") || "none";
};

// Compare calculated points with Sleeper's own scores for rostered players in completed weeks.
export function buildReport(league: League, b: LeagueBundle, st: StatsData, players: PlayerMap): string {
  const sc = league.scoring_settings ?? {};
  const off: { name: string; pos: string; w: number; pts: number; calc: number; diff: number; line: unknown; parts: [string, number][] }[] = [];
  const miss: { name: string; pos: string; w: number; pts: number }[] = [];
  let compared = 0, within = 0;

  b.byWeek.slice(0, -1).forEach((ms, i) =>
    ms.forEach((m) =>
      Object.entries(m.players_points ?? {}).forEach(([pid, pts]) => {
        const p = players[pid];
        const e = p ? entryFor(st, pid, p) : undefined;
        const wk = e?.weeks.find((x) => x.w === i + 1);
        const name = p?.name ?? pid, pos = p?.pos ?? "?";
        if (!e || !wk) { if (Math.abs(pts) >= 0.005) miss.push({ name, pos, w: i + 1, pts }); return; }
        compared++;
        const calc = calcPoints(wk.s, e.pos, sc);
        const diff = calc - pts;
        if (Math.abs(diff) < 0.05) { within++; return; }
        off.push({ name, pos, w: i + 1, pts, calc, diff, line: wk.s, parts: contributions(wk.s, e.pos, sc) });
      }),
    ),
  );

  off.sort((a, c) => Math.abs(c.diff) - Math.abs(a.diff));
  miss.sort((a, c) => Math.abs(c.pts) - Math.abs(a.pts));
  const lines = [
    `League: ${league.name} (${league.league_id})`,
    `Scoring settings: ${JSON.stringify(sc)}`,
    `Rules not modeled: ${unsupportedKeys(sc).join(", ") || "none"}`,
    `Stats data through week ${st.through ?? "?"}, generated ${st.generated ?? "?"}`,
    "",
    `Compared ${compared} rostered player-weeks (completed weeks): ${within} within 0.05, ${off.length} off.`,
    `Off by position: ${tally(off.map((o) => o.pos))}`,
    `Off by week: ${tally(off.map((o) => `wk${o.w}`))}`,
    `Sleeper gave points but there is no stat line: ${miss.length}. By position: ${tally(miss.map((o) => o.pos))}`,
    "",
    `LARGEST DIFFERENCES (up to 40):`,
  ];
  off.slice(0, 40).forEach((o) => {
    lines.push(`${o.name} (${o.pos}) week ${o.w}: Sleeper ${f2(o.pts)}, calculated ${f2(o.calc)}, diff ${signed(o.diff)}`);
    lines.push(`  stats: ${JSON.stringify(o.line)}`);
    lines.push(`  points: ${o.parts.map(([k, v]) => `${k} ${f2(v)}`).join(", ")}`);
  });
  lines.push("", `NO STAT LINE (up to 25):`);
  miss.slice(0, 25).forEach((o) => lines.push(`${o.name} (${o.pos}) week ${o.w}: Sleeper ${f2(o.pts)}`));
  return lines.join("\n");
}
