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
const OPTIONAL = ["season_type", "two_point_attempt", "sack", "pass_touchdown", "rush_touchdown"];

export function createCollector() {
  let idx = null, c = null, parser = null, through = 0;
  const rows = new Map(), teams = new Map();

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

  function handleRow(row) {
    if (!idx) {
      idx = Object.fromEntries(row.map((h, i) => [h, i]));
      const missing = REQUIRED.filter((k) => !(k in idx));
      if (missing.length) throw new Error(`Required columns missing: ${missing.join(", ")}`);
      const ix = (k) => (k in idx ? idx[k] : -1);
      c = { week: ix("week"), tm: ix("posteam"), yl: ix("yardline_100"), pass: ix("pass_attempt"), rush: ix("rush_attempt"),
            recv: ix("receiver_player_id"), rusher: ix("rusher_player_id"), passer: ix("passer_player_id"),
            st: ix("season_type"), two: ix("two_point_attempt"), sack: ix("sack"), ptd: ix("pass_touchdown"), rtd: ix("rush_touchdown") };
      parser?.setMask(new Set([...REQUIRED, ...OPTIONAL].filter((k) => k in idx).map((k) => idx[k])));
      return;
    }
    const yl = Number(row[c.yl]);
    if (!(yl > 0 && yl <= 20)) return;
    if (c.st >= 0 && row[c.st] && row[c.st] !== "REG") return;
    if (c.two >= 0 && row[c.two] === "1") return;
    const w = Number(row[c.week]);
    const tm = row[c.tm];
    if (!w || !tm) return;
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
    handleRow,
    result() {
      const players = {};
      for (const { id, ...r } of rows.values()) (players[id] ??= { weeks: [] }).weeks.push(r);
      for (const p of Object.values(players)) p.weeks.sort((a, b) => a.w - b.w);
      return { players, teams: Object.fromEntries(teams), through };
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
