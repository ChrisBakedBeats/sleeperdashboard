// Streaming CSV parser plus the red zone tally, kept separate from the download code so it can be tested.

export function createParser(onRow) {
  let row = [], field = "", quoted = false, pending = false, col = 0;
  let mask = null; // once the header is read, only these column numbers are kept
  const want = () => mask === null || mask.has(col);
  const endRow = () => { row.push(field); onRow(row); row = []; field = ""; col = 0; };
  return {
    setMask(m) { mask = m; },
    write(text) {
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (pending) {
          pending = false;
          if (c === '"') { if (want()) field += '"'; continue; }
          quoted = false;
        }
        if (quoted) { if (c === '"') pending = true; else if (want()) field += c; }
        else if (c === '"') quoted = true;
        else if (c === ",") { row.push(field); field = ""; col++; }
        else if (c === "\n") endRow();
        else if (c !== "\r" && want()) field += c;
      }
    },
    end() { if (field || row.length) endRow(); },
  };
}

const REQUIRED = ["week", "posteam", "yardline_100", "pass_attempt", "rush_attempt", "receiver_player_id", "rusher_player_id", "passer_player_id"];
const OPTIONAL = ["season_type", "two_point_attempt", "sack", "pass_touchdown", "rush_touchdown",
  // used for team defense lines
  "defteam", "interception", "fumble_lost", "fumble_forced", "safety", "touchdown", "td_team", "play_type",
  "punt_blocked", "field_goal_result", "extra_point_result", "two_point_conv_result", "yards_gained"];
const DEFENSE_COLUMNS = ["defteam", "interception", "fumble_lost", "fumble_forced", "safety", "touchdown", "td_team", "play_type", "punt_blocked", "field_goal_result", "extra_point_result", "two_point_conv_result", "yards_gained"];
const SLEEPER_TEAM = { LA: "LAR", OAK: "LV", SD: "LAC", STL: "LAR" };

export function createCollector() {
  let idx = null, c = null, parser = null, through = 0, dstThrough = 0;
  const rows = new Map(), teams = new Map(), dst = new Map();

  const slot = (id, w, tm) => {
    const k = `${id}|${w}`;
    let r = rows.get(k);
    if (!r) { r = { id, w, tm, rzt: 0, rzc: 0, i10t: 0, i10c: 0, i5t: 0, i5c: 0, td: 0, rzpa: 0, ptd: 0 }; rows.set(k, r); }
    return r;
  };
  const team = (tm, w) => {
    const k = `${tm}|${w}`;
    let t = teams.get(k);
    if (!t) { t = [0, 0]; teams.set(k, t); }
    return t;
  };

  const dstSlot = (tm, w) => {
    const k = `${tm}|${w}`;
    let t = dst.get(k);
    if (!t) { t = { tm, w, sack: 0, int: 0, fum_rec: 0, ff: 0, def_td: 0, st_td: 0, safe: 0, blk_kick: 0, pts_allow: 0, yds_allow: 0 }; dst.set(k, t); }
    return t;
  };

  // Team defense: counts credited to the defending team, plus points and yards it allowed.
  function defensePlay(row, w, off, def) {
    const flag = (i) => i >= 0 && row[i] === "1";
    const val = (i) => (i >= 0 ? row[i] : "");
    const t = dstSlot(def, w);
    const play = val(c.play);
    const offense = play === "pass" || play === "run";
    if (flag(c.sack)) t.sack++;
    if (flag(c.int)) t.int++;
    if (flag(c.fl)) t.fum_rec++;
    if (flag(c.ff)) t.ff++;
    if (flag(c.safety)) t.safe++;
    if (flag(c.punt_blocked) || val(c.fgres) === "blocked" || val(c.xpres) === "blocked") t.blk_kick++;
    const tdTeam = val(c.tdteam);
    if (flag(c.td) && tdTeam) {
      if (tdTeam === def) { if (offense) t.def_td++; else t.st_td++; }
      else if (tdTeam === off && offense) t.pts_allow += 6;
    }
    if (val(c.xpres) === "good") t.pts_allow += 1;
    if (val(c.twores) === "success") t.pts_allow += 2;
    if (val(c.fgres) === "made") t.pts_allow += 3;
    if (offense && !flag(c.two)) {
      const y = Number(val(c.yds));
      if (Number.isFinite(y) && val(c.yds) !== "") t.yds_allow += y;
    }
    dstThrough = Math.max(dstThrough, w);
  }

  function handleRow(row) {
    if (!idx) {
      idx = Object.fromEntries(row.map((h, i) => [h, i]));
      const missing = REQUIRED.filter((k) => !(k in idx));
      if (missing.length) throw new Error(`Required columns missing: ${missing.join(", ")}`);
      const ix = (k) => (k in idx ? idx[k] : -1);
      c = { week: ix("week"), tm: ix("posteam"), yl: ix("yardline_100"), pass: ix("pass_attempt"), rush: ix("rush_attempt"),
            recv: ix("receiver_player_id"), rusher: ix("rusher_player_id"), passer: ix("passer_player_id"),
            st: ix("season_type"), two: ix("two_point_attempt"), sack: ix("sack"), ptd: ix("pass_touchdown"), rtd: ix("rush_touchdown"),
            def: ix("defteam"), int: ix("interception"), fl: ix("fumble_lost"), ff: ix("fumble_forced"), safety: ix("safety"), td: ix("touchdown"),
            tdteam: ix("td_team"), play: ix("play_type"), punt_blocked: ix("punt_blocked"), fgres: ix("field_goal_result"),
            xpres: ix("extra_point_result"), twores: ix("two_point_conv_result"), yds: ix("yards_gained") };
      parser?.setMask(new Set([...REQUIRED, ...OPTIONAL].filter((k) => k in idx).map((k) => idx[k])));
      return;
    }
    if (c.st >= 0 && row[c.st] && row[c.st] !== "REG") return;
    const w = Number(row[c.week]);
    const tm = row[c.tm];
    if (!w || !tm) return;
    if (c.def >= 0 && row[c.def]) defensePlay(row, w, tm, row[c.def]);
    const yl = Number(row[c.yl]);
    if (!(yl > 0 && yl <= 20)) return;
    if (c.two >= 0 && row[c.two] === "1") return;
    const flag = (i) => i >= 0 && row[i] === "1";
    if (row[c.pass] === "1" && !flag(c.sack)) {
      const rid = row[c.recv], qid = row[c.passer], td = flag(c.ptd);
      if (rid) {
        const r = slot(rid, w, tm);
        r.rzt++; if (yl <= 10) r.i10t++; if (yl <= 5) r.i5t++; if (td) r.td++;
        team(tm, w)[0]++;
      }
      if (qid) { const q = slot(qid, w, tm); q.rzpa++; if (td) q.ptd++; }
      through = Math.max(through, w);
    } else if (row[c.rush] === "1") {
      const rid = row[c.rusher];
      if (!rid) return;
      const r = slot(rid, w, tm);
      r.rzc++; if (yl <= 10) r.i10c++; if (yl <= 5) r.i5c++; if (flag(c.rtd)) r.td++;
      team(tm, w)[1]++;
      through = Math.max(through, w);
    }
  }

  return {
    attach(p) { parser = p; },
    missingDefenseColumns() { return idx ? DEFENSE_COLUMNS.filter((k) => !(k in idx)) : DEFENSE_COLUMNS; },
    handleRow,
    result() {
      const players = {};
      for (const { id, ...r } of rows.values()) (players[id] ??= { weeks: [] }).weeks.push(r);
      for (const p of Object.values(players)) p.weeks.sort((a, b) => a.w - b.w);
      const defense = {};
      for (const t of dst.values()) {
        const line = { ...t };
        delete line.tm; delete line.w;
        line.def_st_td = line.def_td + line.st_td;
        const s = Object.fromEntries(Object.entries(line).filter(([k, v]) => v || k === "pts_allow" || k === "yds_allow"));
        const abbr = SLEEPER_TEAM[t.tm] ?? t.tm;
        (defense[abbr] ??= []).push({ w: t.w, s });
      }
      for (const weeks of Object.values(defense)) weeks.sort((a, b) => a.w - b.w);
      return { players, teams: Object.fromEntries(teams), through, defense, dstThrough };
    },
  };
}

export function tallyText(text) {
  const col = createCollector();
  const p = createParser(col.handleRow);
  col.attach(p);
  p.write(text);
  p.end();
  return col.result();
}
