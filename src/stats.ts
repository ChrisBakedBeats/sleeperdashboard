import type { Matchup, Player, PlayerMap } from "./sleeper";
import { findIn } from "./metrics";

export type Stat = Record<string, number>;
export type StatEntry = { name?: string; pos: string; team: string; weeks: { w: number; s: Stat }[] };
export type StatsData = { generated?: string; season?: number; through?: number; error?: string; players: Record<string, StatEntry> };
export type Scoring = Record<string, number>;

let cache: Promise<StatsData> | undefined;
export function loadStats(): Promise<StatsData> {
  if (!cache) {
    cache = fetch("./data/stats.json").then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    cache.catch(() => { cache = undefined; });
  }
  return cache;
}

// Stat keys that use the same names as Sleeper's scoring settings, so points = weight * stat.
const DIRECT = new Set([
  "pass_att", "pass_cmp", "pass_inc", "pass_yd", "pass_td", "pass_int", "pass_2pt", "pass_fd", "pass_sack",
  "rush_att", "rush_yd", "rush_td", "rush_2pt", "rush_fd", "rec", "rec_tgt", "rec_yd", "rec_td", "rec_2pt", "rec_fd",
  "fum", "fum_lost", "st_td", "fgm", "fgmiss", "fgm_yds", "xpm", "xpmiss",
  "fgm_0_19", "fgm_20_29", "fgm_30_39", "fgm_40_49", "fgm_50_59", "fgm_50p", "fgm_60p",
  "fgmiss_0_19", "fgmiss_20_29", "fgmiss_30_39", "fgmiss_40_49", "fgmiss_50_59", "fgmiss_50p", "fgmiss_60p",
]);
const BONUS = new Set([
  "bonus_pass_yd_300", "bonus_pass_yd_400", "bonus_rush_yd_100", "bonus_rush_yd_200", "bonus_rec_yd_100", "bonus_rec_yd_200",
  "bonus_rec_te", "bonus_rec_rb", "bonus_rec_wr", "bonus_fd_qb", "bonus_fd_rb", "bonus_fd_wr", "bonus_fd_te",
]);
// Defense and team scoring don't apply to the players covered here.
const IGNORE = ["def", "pts_allow", "yds_allow", "sack", "int", "ff", "fum_rec", "safe", "blk", "tkl", "qb_hit", "pass_def", "st_ff", "st_fum", "st_tkl", "idp", "tfl"];

export const unsupportedKeys = (sc: Scoring) =>
  Object.keys(sc).filter((k) => sc[k] && !DIRECT.has(k) && !BONUS.has(k) && !IGNORE.some((p) => k.startsWith(p)));

function bonus(k: string, w: number, s: Stat, pos: string): number {
  const v = (x: string) => s[x] ?? 0;
  const atLeast = (x: string, n: number) => (v(x) >= n ? w : 0);
  switch (k) {
    case "bonus_pass_yd_300": return atLeast("pass_yd", 300);
    case "bonus_pass_yd_400": return atLeast("pass_yd", 400);
    case "bonus_rush_yd_100": return atLeast("rush_yd", 100);
    case "bonus_rush_yd_200": return atLeast("rush_yd", 200);
    case "bonus_rec_yd_100": return atLeast("rec_yd", 100);
    case "bonus_rec_yd_200": return atLeast("rec_yd", 200);
    case "bonus_rec_te": return pos === "TE" ? w * v("rec") : 0;
    case "bonus_rec_rb": return pos === "RB" ? w * v("rec") : 0;
    case "bonus_rec_wr": return pos === "WR" ? w * v("rec") : 0;
    case "bonus_fd_qb": case "bonus_fd_rb": case "bonus_fd_wr": case "bonus_fd_te":
      return k.endsWith(`_${pos.toLowerCase()}`) ? w * (v("pass_fd") + v("rush_fd") + v("rec_fd")) : 0;
    default: return 0;
  }
}

export function calcPoints(s: Stat, pos: string, sc: Scoring): number {
  const p = pos === "FB" ? "RB" : pos;
  let pts = 0;
  for (const [k, w] of Object.entries(sc)) {
    if (!w) continue;
    if (DIRECT.has(k)) pts += w * (s[k] ?? 0);
    else if (BONUS.has(k)) pts += bonus(k, w, s, p);
  }
  return pts;
}

// Points for weeks 1..n in this league's scoring. Undefined means no game that week (bye or inactive).
export function weeklyPoints(e: StatEntry, sc: Scoring, n: number): (number | undefined)[] {
  return Array.from({ length: n }, (_, i) => {
    const wk = e.weeks.find((x) => x.w === i + 1);
    return wk ? calcPoints(wk.s, e.pos, sc) : undefined;
  });
}

// Compare calculated points with Sleeper's own scores for rostered players in completed weeks.
export function validate(byWeek: Matchup[][], players: PlayerMap, st: StatsData, sc: Scoring) {
  let match = 0, total = 0;
  byWeek.forEach((ms, i) =>
    ms.forEach((m) =>
      Object.entries(m.players_points ?? {}).forEach(([pid, pts]) => {
        const g = players[pid]?.gsis;
        const e = g ? st.players[g] : undefined;
        const wk = e?.weeks.find((x) => x.w === i + 1);
        if (!e || !wk) return;
        total++;
        if (Math.abs(calcPoints(wk.s, e.pos, sc) - pts) < 0.06) match++;
      }),
    ),
  );
  return { match, total };
}

// Replace matchup-based points with calculated points for the given Sleeper player IDs where stats exist.
export function mergeCalc(season: Record<string, (number | undefined)[]>, ids: string[], players: PlayerMap, st: StatsData | null, sc: Scoring | undefined, weeks: number) {
  const out = { ...season };
  const calc = new Set<string>();
  if (!st || st.error || !sc) return { season: out, calc };
  for (const id of ids) {
    const p = players[id];
    const hit = p ? findIn(st.players, p.gsis, p.name, p.pos, p.team) : undefined;
    if (hit) { out[id] = weeklyPoints(hit[1], sc, weeks); calc.add(id); }
  }
  return { season: out, calc };
}

export function recentForm(st: StatsData | null, p: Player | undefined, sc: Scoring | undefined, week: number) {
  if (!st || st.error || !sc || !p) return undefined;
  const hit = findIn(st.players, p.gsis, p.name, p.pos, p.team);
  if (!hit) return undefined;
  const v = weeklyPoints(hit[1], sc, Math.max(week - 1, 0)).filter((x): x is number => x != null);
  if (!v.length) return undefined;
  const l3 = v.slice(-3);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return { avg: mean(v), l3: mean(l3) };
}
