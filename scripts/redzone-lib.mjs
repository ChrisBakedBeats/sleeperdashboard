// Streaming CSV parser plus the play-by-play tallies (red zone usage, team defense lines, big plays).
// Kept separate from the download code so it can be tested.

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
const DEFENSE_COLUMNS = ["defteam", "interception", "fumble_lost", "fumble_forced", "safety", "touchdown", "td_team", "play_type", "punt_blocked", "field_goal_result", "extra_point_result", "two_point_conv_result", "yards_gained", "game_id", "fixed_drive", "fixed_drive_result", "fourth_down_failed", "complete_pass", "fumble_recovery_1_team", "fumbled_1_team", "fumbled_1_player_id", "pass_defense_1_player_id", "pass_defense_2_player_id", "defensive_two_point_conv", "desc"];
const OPTIONAL = ["season_type", "two_point_attempt", "sack", "pass_touchdown", "rush_touchdown", ...DEFENSE_COLUMNS];
const INT_COUNTS_AS_PD = true;
const SLEEPER_TEAM = { LA: "LAR", OAK: "LV", SD: "LAC", STL: "LAR" };
const BIG = ["rush_40p", "rec_40p", "pass_cmp_40p", "rush_td_40p", "rush_td_50p", "rec_td_40p", "rec_td_50p", "pass_td_40p", "pass_td_50p",
  "rec_0_4", "rec_5_9", "rec_10_19", "rec_20_29", "rec_30_39", "pass_int_td",
  // Fumbles on kick and punt returns: nflverse weekly stats leave these out, but Sleeper scores them. Merged into fum / fum_lost on the site.
  "st_fum", "st_fum_lost"];

export function createCollector() {
  let idx = null, c = null, parser = null, through = 0, dstThrough = 0;
  const rows = new Map(), teams = new Map(), dst = new Map(), drives = new Map(), big = new Map();
  const fumbles = []; // kept for diagnosing defense fumble recovery scoring

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
    if (!t) {
      t = { tm, w, sack: 0, int: 0, fum_rec: 0, def_st_fum_rec: 0, fum_rec_td: 0, ff: 0, def_td: 0, st_td: 0, def_pr_td: 0, def_kr_td: 0, def_2pt: 0, def_forced_punts: 0, def_pass_def: 0, safe: 0, blk_kick: 0, def_3_and_out: 0, def_4_and_stop: 0, pts_allow: 0, yds_allow: 0 };
      dst.set(k, t);
    }
    return t;
  };
  const bigSlot = (id, w) => {
    const k = `${id}|${w}`;
    let b = big.get(k);
    if (!b) { b = { id, w, ...Object.fromEntries(BIG.map((x) => [x, 0])) }; big.set(k, b); }
    return b;
  };

  const flag = (row, i) => i >= 0 && row[i] === "1";
  const val = (row, i) => (i >= 0 ? row[i] ?? "" : "");

  // Team defense: counts credited to the defending team, plus points and yards it allowed.
  function defensePlay(row, w, off, def) {
    const t = dstSlot(def, w);
    const play = val(row, c.play);
    const scrimmage = play === "pass" || play === "run";
    if (flag(row, c.sack)) t.sack++;
    if (flag(row, c.int)) t.int++;
    // Passes defended: each defender credited on the play. An interception with no separate pass defender still counts once
    // (INT_COUNTS_AS_PD; flip it if the next report shows interception games off by one point per interception).
    if (play === "pass") {
      let pd = (val(row, c.pd1) ? 1 : 0) + (val(row, c.pd2) ? 1 : 0);
      if (INT_COUNTS_AS_PD && flag(row, c.int) && pd === 0) pd = 1;
      t.def_pass_def += pd;
    }
    // Fumble recoveries go to the team that recovered the ball: the defense on scrimmage plays, either team on kicks.
    const recTeam = val(row, c.fr1), fumbler = val(row, c.fb1);
    if (c.fr1 >= 0 && c.fb1 >= 0) {
      if (recTeam && fumbler && recTeam !== fumbler && play !== "no_play") {
        if (scrimmage) { if (recTeam === def) t.fum_rec++; }
        else if (play === "punt" || play === "kickoff" || play === "field_goal" || play === "extra_point") dstSlot(recTeam, w).def_st_fum_rec++;
      }
    } else if (flag(row, c.fl)) t.fum_rec++;
    if (flag(row, c.ff)) t.ff++;
    if ((recTeam || flag(row, c.fl)) && fumbles.length < 3000) {
      fumbles.push({ w, off, def, play, fumbler, rec: recTeam, lost: flag(row, c.fl) ? 1 : 0, desc: val(row, c.desc).replace(/\s+/g, " ").slice(0, 170) });
    }
    if (play === "punt") t.def_forced_punts++;
    if (flag(row, c.def2)) t.def_2pt++;
    if (flag(row, c.safety)) t.safe++;
    if (flag(row, c.punt_blocked) || val(row, c.fgres) === "blocked" || val(row, c.xpres) === "blocked") t.blk_kick++;
    if (scrimmage && flag(row, c.f4)) t.def_4_and_stop++;
    const tdTeam = val(row, c.tdteam);
    if (flag(row, c.td) && tdTeam) {
      if (tdTeam === def) {
        // A fumble-recovery touchdown is paid once, as fum_rec_td, not also as def_td.
        if (scrimmage) { if (flag(row, c.fl) || (recTeam && recTeam === def)) t.fum_rec_td++; else t.def_td++; }
        else { t.st_td++; if (play === "punt") t.def_pr_td++; else if (play === "kickoff") t.def_kr_td++; }
      }
      else if (tdTeam === off && scrimmage) t.pts_allow += 6;
    }
    if (val(row, c.xpres) === "good") t.pts_allow += 1;
    if (val(row, c.twores) === "success") t.pts_allow += 2;
    if (val(row, c.fgres) === "made") t.pts_allow += 3;
    if (scrimmage && !flag(row, c.two)) {
      const y = val(row, c.yds);
      if (y !== "" && Number.isFinite(Number(y))) t.yds_allow += Number(y);
    }
    // Track drives so three-and-outs can be counted once the whole game has been read.
    const drive = val(row, c.fdrive);
    if (drive && c.game >= 0) {
      const k = `${row[c.game]}|${drive}`;
      let d = drives.get(k);
      if (!d) { d = { def, w, n: 0, result: "" }; drives.set(k, d); }
      if (scrimmage && !flag(row, c.two)) d.n++;
      const res = val(row, c.fdres);
      if (res) d.result = res;
    }
    dstThrough = Math.max(dstThrough, w);
  }

  // Plays of 40+ yards (and touchdowns of 40+ or 50+), credited to the players involved.
  function bigPlay(row, w) {
    const play = val(row, c.play);
    if ((play !== "pass" && play !== "run") || flag(row, c.two)) return;
    const raw = val(row, c.yds);
    const y = Number(raw);
    if (raw === "" || !Number.isFinite(y)) return;
    const td = flag(row, c.td) && val(row, c.tdteam) === row[c.tm];
    const add = (b, prefix) => { if (td) { b[`${prefix}_td_40p`]++; if (y >= 50) b[`${prefix}_td_50p`]++; } };
    if (play === "pass" && flag(row, c.complete)) {
      const rid = row[c.recv], qid = row[c.passer];
      const bucket = y < 0 ? null : y <= 4 ? "rec_0_4" : y <= 9 ? "rec_5_9" : y <= 19 ? "rec_10_19" : y <= 29 ? "rec_20_29" : y <= 39 ? "rec_30_39" : null;
      if (rid && (bucket || y >= 40)) {
        const b = bigSlot(rid, w);
        if (bucket) b[bucket]++;
        if (y >= 40) { b.rec_40p++; add(b, "rec"); }
      }
      if (qid && y >= 40) { const b = bigSlot(qid, w); b.pass_cmp_40p++; add(b, "pass"); }
    } else if (play === "run" && y >= 40) {
      const rid = row[c.rusher];
      if (rid) { const b = bigSlot(rid, w); b.rush_40p++; add(b, "rush"); }
    } else if (play === "pass" && flag(row, c.int) && flag(row, c.td) && val(row, c.tdteam) === row[c.def]) {
      const qid = row[c.passer];
      if (qid) bigSlot(qid, w).pass_int_td++;
    }
  }

  // Fumbles on kickoffs and punts, credited to the player who fumbled.
  function returnFumble(row, w) {
    const play = val(row, c.play);
    if (play !== "punt" && play !== "kickoff") return;
    const id = val(row, c.fb1p);
    if (!id) return;
    const b = bigSlot(id, w);
    b.st_fum++;
    if (flag(row, c.fl)) b.st_fum_lost++;
  }

  function redZonePlay(row, w, tm) {
    const yl = Number(row[c.yl]);
    if (!(yl > 0 && yl <= 20)) return;
    if (flag(row, c.two)) return;
    if (row[c.pass] === "1" && !flag(row, c.sack)) {
      const rid = row[c.recv], qid = row[c.passer], td = flag(row, c.ptd);
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
      r.rzc++; if (yl <= 10) r.i10c++; if (yl <= 5) r.i5c++; if (flag(row, c.rtd)) r.td++;
      team(tm, w)[1]++;
      through = Math.max(through, w);
    }
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
            xpres: ix("extra_point_result"), twores: ix("two_point_conv_result"), yds: ix("yards_gained"),
            fr1: ix("fumble_recovery_1_team"), fb1: ix("fumbled_1_team"), fb1p: ix("fumbled_1_player_id"), pd1: ix("pass_defense_1_player_id"), pd2: ix("pass_defense_2_player_id"), def2: ix("defensive_two_point_conv"), desc: ix("desc"),
            game: ix("game_id"), fdrive: ix("fixed_drive"), fdres: ix("fixed_drive_result"), f4: ix("fourth_down_failed"), complete: ix("complete_pass") };
      parser?.setMask(new Set([...REQUIRED, ...OPTIONAL].filter((k) => k in idx).map((k) => idx[k])));
      return;
    }
    if (c.st >= 0 && row[c.st] && row[c.st] !== "REG") return;
    const w = Number(row[c.week]);
    const tm = row[c.tm];
    if (!w || !tm) return;
    if (c.def >= 0 && row[c.def]) defensePlay(row, w, tm, row[c.def]);
    bigPlay(row, w);
    returnFumble(row, w);
    redZonePlay(row, w, tm);
  }

  return {
    attach(p) { parser = p; },
    missingDefenseColumns() { return idx ? DEFENSE_COLUMNS.filter((k) => !(k in idx)) : DEFENSE_COLUMNS; },
    handleRow,
    result() {
      const players = {};
      for (const { id, ...r } of rows.values()) (players[id] ??= { weeks: [] }).weeks.push(r);
      for (const p of Object.values(players)) p.weeks.sort((a, b) => a.w - b.w);

      // A three-and-out is a drive of three or fewer plays that ended in a punt.
      for (const d of drives.values()) if (d.result === "Punt" && d.n >= 1 && d.n <= 3) dstSlot(d.def, d.w).def_3_and_out++;

      const defense = {};
      for (const t of dst.values()) {
        const line = { ...t };
        delete line.tm; delete line.w;
        line.def_st_td = line.st_td; // return touchdowns by the unit; defensive touchdowns stay in def_td
        delete line.st_td;
        const s = Object.fromEntries(Object.entries(line).filter(([k, v]) => v || k === "pts_allow" || k === "yds_allow"));
        (defense[SLEEPER_TEAM[t.tm] ?? t.tm] ??= []).push({ w: t.w, s });
      }
      for (const weeks of Object.values(defense)) weeks.sort((a, b) => a.w - b.w);

      const plays = {};
      for (const { id, w, ...b } of big.values()) {
        const s = Object.fromEntries(Object.entries(b).filter(([, v]) => v));
        (plays[id] ??= { weeks: [] }).weeks.push({ w, s });
      }
      for (const p of Object.values(plays)) p.weeks.sort((a, b) => a.w - b.w);

      const mapTeam = (t) => SLEEPER_TEAM[t] ?? t;
      const fumbleEvents = fumbles.map((f) => ({ ...f, off: mapTeam(f.off), def: mapTeam(f.def), fumbler: mapTeam(f.fumbler), rec: mapTeam(f.rec) }));
      return { players, teams: Object.fromEntries(teams), through, defense, dstThrough, plays, fumbles: fumbleEvents };
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
