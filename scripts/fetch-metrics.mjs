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
const expected = ["carries", "targets", "receptions", "receiving_air_yards", "target_share", "air_yards_share", "wopr", "attempts", "passing_air_yards", "fantasy_points_ppr"];

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
    if (!["QB", "RB", "FB", "WR", "TE"].includes(pos)) continue;
    const id = str(r, "player_id");
    const week = num(r, "week");
    if (!id || !week) continue;
    const w = {
      w: week, car: num(r, "carries") ?? 0, tgt: num(r, "targets") ?? 0, rec: num(r, "receptions") ?? 0,
      ay: num(r, "receiving_air_yards") ?? 0, ts: num(r, "target_share"), ays: num(r, "air_yards_share"), wopr: num(r, "wopr"),
      att: num(r, "attempts") ?? 0, pay: num(r, "passing_air_yards") ?? 0, pts: num(r, "fantasy_points_ppr"),
    };
    if (w.car + w.tgt + w.att === 0) continue;
    (out.players[id] ??= { pos, team: str(r, "team") || str(r, "recent_team"), weeks: [] }).weeks.push(w);
    through = Math.max(through, week);
  }
  for (const p of Object.values(out.players)) p.weeks.sort((a, b) => a.w - b.w);
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
