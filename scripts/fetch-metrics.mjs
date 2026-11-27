// Builds public/data/metrics.json from nflverse weekly player stats.
// Runs in GitHub Actions before the site build (and locally with `npm run data`).
import { mkdir, writeFile } from "node:fs/promises";

const now = new Date();
const season = Number(process.env.SEASON) || (now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear());
const base = "https://github.com/nflverse/nflverse-data/releases/download";
// nflverse has used two release names for this file, so try both.
const candidates = [
  `${base}/stats_player/stats_player_week_${season}.csv`,
  `${base}/player_stats/player_stats_${season}.csv`,
];
const expected = ["carries", "targets", "receptions", "receiving_air_yards", "target_share", "air_yards_share", "wopr", "attempts", "passing_air_yards", "fantasy_points_ppr", "completions", "passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds", "receiving_yards", "receiving_tds", "rushing_fumbles_lost", "receiving_fumbles_lost", "sack_fumbles_lost", "fg_made", "fg_blocked", "fg_blocked_list", "pat_made"];

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function download() {
  const errors = [];
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (res.ok) return { url, text: await res.text() };
      errors.push(`${url} returned HTTP ${res.status}`);
    } catch (e) {
      errors.push(`${url} failed: ${e.message}`);
    }
  }
  throw new Error(errors.join("; "));
}

const out = { generated: new Date().toISOString(), season, players: {} };
const statsPlayers = {};
let statsThrough = 0;

try {
  const { url, text } = await download();
  console.log(`Source: ${url}`);
  const [header, ...rows] = parseCsv(text);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const required = ["player_id", "week", "position"].filter((k) => !(k in idx));
  if (required.length) throw new Error(`Required columns missing: ${required.join(", ")}`);
  const absent = expected.filter((k) => !(k in idx));
  if (absent.length) console.warn(`Missing columns (will be blank): ${absent.join(", ")}`);

  const str = (r, k) => (k in idx ? r[idx[k]] ?? "" : "");
  const num = (r, k) => {
    const v = str(r, k);
    if (v === "" || v === "NA") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  let through = 0;
  for (const r of rows) {
    if (r.length < header.length) continue;
    const type = str(r, "season_type");
    if (type && type !== "REG") continue;
    const pos = str(r, "position");
    if (!["QB", "RB", "FB", "WR", "TE", "K"].includes(pos)) continue;
    const id = str(r, "player_id");
    const week = num(r, "week");
    if (!id || !week) continue;

    // Full stat line, named like Sleeper's scoring settings, so any league's scoring can be applied later.
    const n = (k) => num(r, k) ?? 0;
    const st = {
      pass_att: n("attempts"), pass_cmp: n("completions"), pass_yd: n("passing_yards"), pass_td: n("passing_tds"),
      pass_int: n("passing_interceptions"), pass_2pt: n("passing_2pt_conversions"), pass_fd: n("passing_first_downs"), pass_sack: n("sacks_suffered"),
      rush_att: n("carries"), rush_yd: n("rushing_yards"), rush_td: n("rushing_tds"), rush_2pt: n("rushing_2pt_conversions"), rush_fd: n("rushing_first_downs"),
      rec: n("receptions"), rec_tgt: n("targets"), rec_yd: n("receiving_yards"), rec_td: n("receiving_tds"), rec_2pt: n("receiving_2pt_conversions"), rec_fd: n("receiving_first_downs"),
      fum: n("rushing_fumbles") + n("receiving_fumbles") + n("sack_fumbles"),
      fum_lost: n("rushing_fumbles_lost") + n("receiving_fumbles_lost") + n("sack_fumbles_lost"),
      st_td: n("special_teams_tds"),
      fgm: n("fg_made"), // nflverse lists blocked field goals apart from misses; Sleeper scores a blocked kick as a miss.
      fgmiss: n("fg_missed") + n("fg_blocked"), fgm_yds: n("fg_made_distance"), xpm: n("pat_made"), xpmiss: n("pat_missed"),
      fgm_0_19: n("fg_made_0_19"), fgm_20_29: n("fg_made_20_29"), fgm_30_39: n("fg_made_30_39"), fgm_40_49: n("fg_made_40_49"),
      fgm_50_59: n("fg_made_50_59"), fgm_60p: n("fg_made_60_"), fgm_50p: n("fg_made_50_59") + n("fg_made_60_"),
      fgmiss_0_19: n("fg_missed_0_19"), fgmiss_20_29: n("fg_missed_20_29"), fgmiss_30_39: n("fg_missed_30_39"), fgmiss_40_49: n("fg_missed_40_49"),
      fgmiss_50_59: n("fg_missed_50_59"), fgmiss_60p: n("fg_missed_60_"), fgmiss_50p: n("fg_missed_50_59") + n("fg_missed_60_"),
    };
    // Blocked kicks: Sleeper scores them as misses at the kick's distance, so they join the distance buckets too.
    const blocked = str(r, "fg_blocked_list").split(/[^0-9]+/).filter(Boolean).map(Number);
    const bb = (lo, hi) => blocked.filter((d) => d >= lo && d <= hi).length;
    st.fgmiss_0_19 += bb(0, 19); st.fgmiss_20_29 += bb(20, 29); st.fgmiss_30_39 += bb(30, 39); st.fgmiss_40_49 += bb(40, 49);
    st.fgmiss_50_59 += bb(50, 59); st.fgmiss_60p += bb(60, 200); st.fgmiss_50p += bb(50, 200);
    st.pass_inc = Math.max(0, st.pass_att - st.pass_cmp);
    const nonzero = Object.fromEntries(Object.entries(st).filter(([, v]) => v));
    if (Object.keys(nonzero).length) {
      (statsPlayers[id] ??= { name: str(r, "player_display_name") || str(r, "player_name"), pos: pos === "FB" ? "RB" : pos, team: str(r, "team") || str(r, "recent_team"), weeks: [] }).weeks.push({ w: week, s: nonzero });
      statsThrough = Math.max(statsThrough, week);
    }
    if (pos === "K") continue; // kickers only feed the full stat lines, not the opportunity metrics
    const w = {
      w: week, car: num(r, "carries") ?? 0, tgt: num(r, "targets") ?? 0, rec: num(r, "receptions") ?? 0,
      ay: num(r, "receiving_air_yards") ?? 0, ts: num(r, "target_share"), ays: num(r, "air_yards_share"), wopr: num(r, "wopr"),
      att: num(r, "attempts") ?? 0, pay: num(r, "passing_air_yards") ?? 0, pts: num(r, "fantasy_points_ppr"),
    };
    if (w.car + w.tgt + w.att === 0) continue;
    (out.players[id] ??= { name: str(r, "player_display_name") || str(r, "player_name"), pos, team: str(r, "team") || str(r, "recent_team"), weeks: [] }).weeks.push(w);
    through = Math.max(through, week);
  }
  for (const p of Object.values(out.players)) p.weeks.sort((a, b) => a.w - b.w);
  for (const p of Object.values(statsPlayers)) p.weeks.sort((a, b) => a.w - b.w);
  out.through = through;
  out.source = url;
  if (!through) throw new Error(`No regular-season rows found for ${season}`);
  console.log(`Wrote ${Object.keys(out.players).length} players through week ${through}`);
} catch (e) {
  console.warn(`Metrics not built: ${e.message}`);
  out.error = e.message;
}

await mkdir("public/data", { recursive: true });
await writeFile("public/data/metrics.json", JSON.stringify(out, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)));

await writeFile(
  "public/data/stats.json",
  JSON.stringify({ generated: out.generated, season, through: statsThrough, source: out.source, error: out.error, players: statsPlayers }, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)),
);
