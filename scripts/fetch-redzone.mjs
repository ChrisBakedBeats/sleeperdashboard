// Builds public/data/redzone.json from nflverse play-by-play (streamed, so memory stays small).
import { mkdir, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { StringDecoder } from "node:string_decoder";
import { createCollector, createParser } from "./redzone-lib.mjs";

const now = new Date();
const season = Number(process.env.SEASON) || (now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear());
const base = "https://github.com/nflverse/nflverse-data/releases/download/pbp";
const candidates = [`${base}/play_by_play_${season}.csv.gz`, `${base}/play_by_play_${season}.csv`];

async function open() {
  const errors = [];
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) { errors.push(`${url} returned HTTP ${res.status}`); continue; }
      let stream = Readable.fromWeb(res.body);
      if (url.endsWith(".gz")) {
        const gunzip = createGunzip();
        stream.on("error", (e) => gunzip.destroy(e));
        stream = stream.pipe(gunzip);
      }
      return { url, stream };
    } catch (e) {
      errors.push(`${url} failed: ${e.message}`);
    }
  }
  throw new Error(errors.join("; "));
}

const out = { generated: new Date().toISOString(), season, players: {}, teams: {} };
const defense = { generated: out.generated, season, players: {} };
const plays = { generated: out.generated, season, players: {} };

try {
  const { url, stream } = await open();
  console.log(`Source: ${url}`);
  const collector = createCollector();
  const parser = createParser(collector.handleRow);
  collector.attach(parser);
  const decoder = new StringDecoder("utf8");
  for await (const chunk of stream) parser.write(decoder.write(chunk));
  parser.write(decoder.end());
  parser.end();
  const { players, teams, through, defense: dstLines, dstThrough, plays: bigPlays, fumbles } = collector.result();
  const missingDef = collector.missingDefenseColumns();
  if (missingDef.length) console.warn(`Missing play-by-play columns (defense lines will be incomplete): ${missingDef.join(", ")}`);
  for (const [abbr, weeks] of Object.entries(dstLines)) defense.players[`DEF-${abbr}`] = { name: `${abbr} defense`, pos: "DEF", team: abbr, weeks };
  Object.assign(defense, { through: dstThrough, source: url, fumbles });
  Object.assign(plays, { players: bigPlays, through: dstThrough, source: url });
  console.log(`Wrote defense lines for ${Object.keys(defense.players).length} teams through week ${dstThrough}`);
  if (!through) throw new Error(`No red zone plays found for ${season}`);
  Object.assign(out, { players, teams, through, source: url });
  console.log(`Wrote red zone usage for ${Object.keys(players).length} players through week ${through}`);
} catch (e) {
  console.warn(`Red zone data not built: ${e.message}`);
  out.error = e.message;
  defense.error = e.message;
  plays.error = e.message;
}

await mkdir("public/data", { recursive: true });
await writeFile("public/data/redzone.json", JSON.stringify(out));
await writeFile("public/data/defense.json", JSON.stringify(defense));
await writeFile("public/data/plays.json", JSON.stringify(plays));
