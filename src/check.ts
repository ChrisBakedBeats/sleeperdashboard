import type { League, LeagueBundle, PlayerMap } from "./sleeper";
import { calcPoints, contributions, entryFor, unsupportedKeys, type Stat, type StatsData } from "./stats";

const f2 = (n: number) => n.toFixed(2);
const signed = (n: number) => `${n > 0 ? "+" : ""}${f2(n)}`;
const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
const tally = (items: string[]) => {
  const m = new Map<string, number>();
  items.forEach((k) => m.set(k, (m.get(k) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ") || "none";
};

type Row = { name: string; pos: string; w: number; pts: number; calc: number; diff: number; line: Stat; parts: [string, number][]; match: string };

// Which stats move with the difference? A stat whose value tracks the gap points at the rule that is off.
// diff is calculated minus Sleeper, so a negative slope means Sleeper pays more per unit than the dashboard.
function drivers(rows: Row[]): string[] {
  if (rows.length < 8) return [];
  const keys = new Set<string>();
  rows.forEach((r) => Object.keys(r.line).forEach((k) => keys.add(k)));
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const d = rows.map((r) => r.diff);
  const md = mean(d);
  const out: { k: string; corr: number; slope: number; nz: number }[] = [];
  keys.forEach((k) => {
    const xs = rows.map((r) => r.line[k] ?? 0);
    const nz = xs.filter(Boolean).length;
    if (nz < 4) return;
    const mx = mean(xs);
    let cov = 0, vx = 0, vd = 0;
    xs.forEach((x, i) => { cov += (x - mx) * (d[i] - md); vx += (x - mx) ** 2; vd += (d[i] - md) ** 2; });
    if (!vx || !vd) return;
    out.push({ k, corr: cov / Math.sqrt(vx * vd), slope: cov / vx, nz });
  });
  out.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
  return out.slice(0, 5).map((o) => `  ${o.k}: correlation ${o.corr.toFixed(2)}, difference changes ${signed(o.slope)} per unit (${o.nz} rows)`);
}

// Compare calculated points with Sleeper's own scores for rostered players in completed weeks.
export function buildReport(league: League, b: LeagueBundle, st: StatsData, players: PlayerMap): string {
  const sc = league.scoring_settings ?? {};
  const all: Row[] = [];
  const miss: { name: string; pos: string; w: number; pts: number; match: string }[] = [];

  b.byWeek.slice(0, -1).forEach((ms, i) =>
    ms.forEach((m) =>
      Object.entries(m.players_points ?? {}).forEach(([pid, pts]) => {
        const p = players[pid];
        const e = p ? entryFor(st, pid, p) : undefined;
        const wk = e?.weeks.find((x) => x.w === i + 1);
        const name = p?.name ?? pid, pos = p?.pos ?? "?";
        const match = e ? `${e.name ?? "?"} (${e.team})` : "no stats entry";
        if (!e || !wk) { if (Math.abs(pts) >= 0.005) miss.push({ name, pos, w: i + 1, pts, match }); return; }
        const calc = calcPoints(wk.s, e.pos, sc);
        all.push({ name, pos, w: i + 1, pts, calc, diff: calc - pts, line: wk.s, parts: contributions(wk.s, e.pos, sc), match });
      }),
    ),
  );

  const off = all.filter((r) => Math.abs(r.diff) >= 0.05);
  miss.sort((a, c) => Math.abs(c.pts) - Math.abs(a.pts));
  const lines = [
    `League: ${league.name} (${league.league_id})`,
    `Scoring settings: ${JSON.stringify(sc)}`,
    `Rules not modeled: ${unsupportedKeys(sc).join(", ") || "none"}`,
    `Stats data through week ${st.through ?? "?"}, generated ${st.generated ?? "?"}`,
    "",
    `Compared ${all.length} rostered player-weeks (completed weeks): ${all.length - off.length} within 0.05, ${off.length} off.`,
    `Off by position: ${tally(off.map((o) => o.pos))}`,
    `Off by week: ${tally(off.map((o) => `wk${o.w}`))}`,
    `Sleeper gave points but there is no stat line: ${miss.length}. By position: ${tally(miss.map((o) => o.pos))}`,
  ];

  lines.push("", "BY POSITION (compared, within 0.05, average difference):");
  const groups = POSITIONS.map((pos) => ({ pos, rows: all.filter((r) => r.pos === pos) })).filter((g) => g.rows.length);
  groups.forEach(({ pos, rows }) => {
    const ok = rows.filter((r) => Math.abs(r.diff) < 0.05).length;
    const avg = rows.reduce((a, r) => a + r.diff, 0) / rows.length;
    lines.push(`${pos}: ${rows.length} compared, ${ok} within 0.05, average difference ${signed(avg)}`);
  });

  lines.push("", "STATS THAT TRACK THE DIFFERENCE (by position):");
  groups.forEach(({ pos, rows }) => {
    const d = drivers(rows);
    if (d.length) lines.push(`${pos}:`, ...d);
  });

  lines.push("", "LARGEST DIFFERENCES PER POSITION (up to 8 each):");
  groups.forEach(({ pos, rows }) => {
    const bad = rows.filter((r) => Math.abs(r.diff) >= 0.05).sort((a, c) => Math.abs(c.diff) - Math.abs(a.diff)).slice(0, 8);
    bad.forEach((o) => {
      lines.push(`${o.name} (${pos}) week ${o.w}: Sleeper ${f2(o.pts)}, calculated ${f2(o.calc)}, diff ${signed(o.diff)}`);
      lines.push(`  matched stats: ${o.match}`);
      lines.push(`  stats: ${JSON.stringify(o.line)}`);
      lines.push(`  points: ${o.parts.map(([k, v]) => `${k} ${f2(v)}`).join(", ")}`);
    });
  });

  lines.push("", `NO STAT LINE (up to 25):`);
  miss.slice(0, 25).forEach((o) => lines.push(`${o.name} (${o.pos}) week ${o.w}: Sleeper ${f2(o.pts)} [${o.match}]`));
  return lines.join("\n");
}
