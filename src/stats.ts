import type { Matchup, Player, PlayerMap } from "./sleeper";
import { findIn } from "./metrics";

export type Stat = Record<string, number>;
export type StatEntry = { name?: string; pos: string; team: string; weeks: { w: number; s: Stat }[] };
export type Fumble = { w: number; off: string; def: string; play: string; fumbler: string; rec: string; lost: number; desc: string };
export type StatsData = { generated?: string; season?: number; through?: number; error?: string; players: Record<string, StatEntry>; fumbles?: Fumble[] };
export type Scoring = Record<string, number>;

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Player stat lines plus team defense lines (optional) merged into one lookup.
let cache: Promise<StatsData> | undefined;
export function loadStats(): Promise<StatsData> {
  if (!cache) {
    cache = Promise.all([
      json<StatsData>("./data/stats.json"),
      json<StatsData>("./data/defense.json").catch(() => null),
      json<StatsData>("./data/plays.json").catch(() => null),
    ]).then(([st, def, plays]) => {
      if (def && !def.error) { Object.assign(st.players, def.players); st.fumbles = def.fumbles; }
      // Big-play counts (40+ yard plays and long touchdowns) are added onto the matching weekly stat lines.
      if (plays && !plays.error) {
        for (const [id, pl] of Object.entries(plays.players)) {
          const e = st.players[id];
          if (!e) continue;
          for (const w of pl.weeks) {
            let row = e.weeks.find((x) => x.w === w.w);
            if (!row) { row = { w: w.w, s: {} }; e.weeks.push(row); }
            for (const [k, v] of Object.entries(w.s)) {
              // Fumbles counted from play-by-play fill gaps in the weekly totals: take the larger, never add both.
              if (k === "pbp_fum" || k === "pbp_fum_lost") { const t = k.slice(4); row.s[t] = Math.max(row.s[t] ?? 0, v); }
              else row.s[k] = v;
            }
          }
        }
      }
      return st;
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
  "rec_0_4", "rec_5_9", "rec_10_19", "rec_20_29", "rec_30_39", "pass_int_td",
  "rush_40p", "rec_40p", "pass_cmp_40p", "rush_td_40p", "rush_td_50p", "rec_td_40p", "rec_td_50p", "pass_td_40p", "pass_td_50p",
  // team defense
  "sack", "int", "ff", "fum_rec", "def_st_fum_rec", "fum_rec_td", "def_td", "def_st_td", "def_pr_td", "def_kr_td", "def_2pt", "def_forced_punts", "def_pass_def", "pts_allow", "tkl_loss", "def_st_ff", "safe", "blk_kick", "def_3_and_out", "def_4_and_stop",
]);
const BONUS = new Set([
  "bonus_pass_yd_300", "bonus_pass_yd_400", "bonus_rush_yd_100", "bonus_rush_yd_200", "bonus_rec_yd_100", "bonus_rec_yd_200",
  "bonus_rec_te", "bonus_rec_rb", "bonus_rec_wr", "bonus_fd_qb", "bonus_fd_rb", "bonus_fd_wr", "bonus_fd_te",
  "bonus_rush_rec_yd_100", "bonus_rush_rec_yd_200",
]);
const ALLOW = /^(pts|yds)_allow_/;

export const unsupportedKeys = (sc: Scoring) =>
  Object.keys(sc).filter((k) => sc[k] && !DIRECT.has(k) && !BONUS.has(k) && !ALLOW.test(k));

function bonus(k: string, w: number, s: Stat, pos: string): number {
  const v = (x: string) => s[x] ?? 0;
  const atLeast = (x: string, n: number) => (v(x) >= n ? w : 0);
  const between = (x: string, lo: number, hi: number) => (v(x) >= lo && v(x) < hi ? w : 0);
  switch (k) {
    // Yardage bonuses are separate tiers: the 100 bonus covers 100-199 yards and the 200 bonus covers 200 or more.
    case "bonus_pass_yd_300": return between("pass_yd", 300, 400);
    case "bonus_pass_yd_400": return atLeast("pass_yd", 400);
    case "bonus_rush_yd_100": return between("rush_yd", 100, 200);
    case "bonus_rush_yd_200": return atLeast("rush_yd", 200);
    case "bonus_rec_yd_100": return between("rec_yd", 100, 200);
    case "bonus_rec_yd_200": return atLeast("rec_yd", 200);
    case "bonus_rush_rec_yd_100": { const t = v("rush_yd") + v("rec_yd"); return t >= 100 && t < 200 ? w : 0; }
    case "bonus_rush_rec_yd_200": return v("rush_yd") + v("rec_yd") >= 200 ? w : 0;
    case "bonus_rec_te": return pos === "TE" ? w * v("rec") : 0;
    case "bonus_rec_rb": return pos === "RB" ? w * v("rec") : 0;
    case "bonus_rec_wr": return pos === "WR" ? w * v("rec") : 0;
    case "bonus_fd_qb": case "bonus_fd_rb": case "bonus_fd_wr": case "bonus_fd_te":
      return k.endsWith(`_${pos.toLowerCase()}`) ? w * (statValue("pass_fd", s) + statValue("rush_fd", s) + statValue("rec_fd", s)) : 0;
    default: return 0;
  }
}

// Points-allowed and yards-allowed buckets, like pts_allow_7_13, pts_allow_35p, yds_allow_300_349.
function inBucket(k: string, prefix: string, v: number): boolean {
  const m = /^(\d+)(?:_(\d+)|(p))?$/.exec(k.slice(prefix.length));
  if (!m) return false;
  const lo = +m[1];
  if (m[3]) return v >= lo;
  if (m[2] === undefined) return v === lo;
  let hi = +m[2];
  if (prefix === "yds_allow_" && hi - lo === 100) hi -= 1; // a "0_100" style bucket means 0 to 99
  return v >= lo && v <= hi;
}

// Sleeper doesn't count first downs on touchdown plays, but the NFL data does.
const FIRST_DOWN: Record<string, string> = { rush_fd: "rush_td", rec_fd: "rec_td", pass_fd: "pass_td" };
// A 40+ yard play can't exist in a game where the player's total yards are below 40 (a lateral, for example).
const BIG_PLAY: Record<string, [string, number]> = {
  rush_40p: ["rush_yd", 40], rec_40p: ["rec_yd", 40], pass_cmp_40p: ["pass_yd", 40],
  rush_td_40p: ["rush_yd", 40], rush_td_50p: ["rush_yd", 50], rec_td_40p: ["rec_yd", 40], rec_td_50p: ["rec_yd", 50],
  pass_td_40p: ["pass_yd", 40], pass_td_50p: ["pass_yd", 50],
};
function statValue(k: string, s: Stat): number {
  const v = s[k] ?? 0;
  if (FIRST_DOWN[k]) return Math.max(0, v - (s[FIRST_DOWN[k]] ?? 0));
  const b = BIG_PLAY[k];
  if (b) return Math.max(0, Math.min(v, Math.floor((s[b[0]] ?? 0) / b[1]))); // never below zero, even when the player's yards are negative
  return v;
}

// Points from each scoring rule, so a total can be traced back to individual rules.
export function contributions(raw: Stat, pos: string, sc: Scoring): [string, number][] {
  const p = pos === "FB" ? "RB" : pos;
  // A touchdown is paid once, under the most specific rule the league scores: a fumble-recovery touchdown as fum_rec_td
  // (not also def_td), and punt or kick return touchdowns as def_pr_td / def_kr_td (not also def_st_td).
  const s: Stat = { ...raw };
  if (sc.fum_rec_td) s.def_td = Math.max(0, (raw.def_td ?? 0) - (raw.fum_rec_td ?? 0));
  const specific = (sc.def_pr_td ? raw.def_pr_td ?? 0 : 0) + (sc.def_kr_td ? raw.def_kr_td ?? 0 : 0);
  if (specific) s.def_st_td = Math.max(0, (raw.def_st_td ?? 0) - specific);
  const out: [string, number][] = [];
  const add = (k: string, v: number) => { if (v) out.push([k, v]); };
  for (const [k, w] of Object.entries(sc)) {
    if (!w) continue;
    if (DIRECT.has(k)) add(k, w * statValue(k, s));
    else if (BONUS.has(k)) add(k, bonus(k, w, s, p));
    else if (k.startsWith("pts_allow_") && s.pts_allow !== undefined) add(k, inBucket(k, "pts_allow_", s.pts_allow) ? w : 0);
    else if (k.startsWith("yds_allow_") && s.yds_allow !== undefined) add(k, inBucket(k, "yds_allow_", s.yds_allow) ? w : 0);
  }
  return out;
}

export const calcPoints = (s: Stat, pos: string, sc: Scoring): number =>
  contributions(s, pos, sc).reduce((a, [, v]) => a + v, 0);

// Find a Sleeper player's stat lines: team defenses by team ID, everyone else by NFL ID or name.
export function entryFor(st: StatsData, id: string, p: Player | undefined): StatEntry | undefined {
  if (p?.pos === "DEF") return st.players[`DEF-${id}`];
  return p ? findIn(st.players, p.gsis, p.name, p.pos, p.team, p.fpos)?.[1] : undefined;
}

// Points for weeks 1..n in this league's scoring. Undefined means no game that week (bye or inactive).
export function weeklyPoints(e: StatEntry, sc: Scoring, n: number): (number | undefined)[] {
  return Array.from({ length: n }, (_, i) => {
    const wk = e.weeks.find((x) => x.w === i + 1);
    return wk ? calcPoints(wk.s, e.pos, sc) : undefined;
  });
}

// Compare calculated points with Sleeper's own scores for rostered players in completed weeks.
// Team defenses are counted separately so they can't hide behind the offensive players.
export function validate(byWeek: Matchup[][], players: PlayerMap, st: StatsData, sc: Scoring) {
  let match = 0, total = 0, dMatch = 0, dTotal = 0;
  byWeek.forEach((ms, i) =>
    ms.forEach((m) =>
      Object.entries(m.players_points ?? {}).forEach(([pid, pts]) => {
        const p = players[pid];
        const e = p ? entryFor(st, pid, p) : undefined;
        const wk = e?.weeks.find((x) => x.w === i + 1);
        if (!p || !e || !wk) return;
        const ok = Math.abs(calcPoints(wk.s, e.pos, sc) - pts) < 0.06;
        if (p.pos === "DEF") { dTotal++; if (ok) dMatch++; }
        else { total++; if (ok) match++; }
      }),
    ),
  );
  return { match, total, dMatch, dTotal };
}

// Replace matchup-based points with calculated points for the given Sleeper player IDs where stats exist.
export function mergeCalc(season: Record<string, (number | undefined)[]>, ids: string[], players: PlayerMap, st: StatsData | null, sc: Scoring | undefined, weeks: number) {
  const out = { ...season };
  const calc = new Set<string>();
  if (!st || st.error || !sc) return { season: out, calc };
  for (const id of ids) {
    const e = entryFor(st, id, players[id]);
    if (e) { out[id] = weeklyPoints(e, sc, weeks); calc.add(id); }
  }
  return { season: out, calc };
}

export function recentForm(st: StatsData | null, id: string, p: Player | undefined, sc: Scoring | undefined, week: number) {
  if (!st || st.error || !sc || !p) return undefined;
  const e = entryFor(st, id, p);
  if (!e) return undefined;
  const v = weeklyPoints(e, sc, Math.max(week - 1, 0)).filter((x): x is number => x != null);
  if (!v.length) return undefined;
  const l3 = v.slice(-3);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return { avg: mean(v), l3: mean(l3) };
}
