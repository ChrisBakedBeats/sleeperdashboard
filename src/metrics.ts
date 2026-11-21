export type W = {
  w: number; car: number; tgt: number; rec: number; ay: number;
  ts: number | null; ays: number | null; wopr: number | null; att: number; pay: number; pts: number | null;
};
export type Metrics = {
  generated?: string; season?: number; through?: number; error?: string;
  players: Record<string, { name?: string; pos: string; team: string; weeks: W[] }>;
};
export type Group = "QB" | "RB" | "REC";
export type Col = { key: string; label: string; fmt: (w: W) => string };

let cache: Promise<Metrics> | undefined;
export function loadMetrics(): Promise<Metrics> {
  if (!cache) {
    cache = fetch("./data/metrics.json").then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    cache.catch(() => { cache = undefined; });
  }
  return cache;
}

export const groupOf = (pos: string): Group | null =>
  pos === "QB" ? "QB" : pos === "RB" || pos === "FB" ? "RB" : pos === "WR" || pos === "TE" ? "REC" : null;

// Rough PPR value of volume. These weights are approximations and easy to tune.
export const WEIGHTS = { carry: 0.65, qbCarry: 0.9, target: 1.7, attempt: 0.45 };
export const oppPts = (w: W, g: Group) =>
  g === "QB" ? w.att * WEIGHTS.attempt + w.car * WEIGHTS.qbCarry : w.car * WEIGHTS.carry + w.tgt * WEIGHTS.target;

const d = "-";
const f0 = (n?: number | null) => (n == null ? d : String(Math.round(n)));
const f1 = (n?: number | null) => (n == null ? d : n.toFixed(1));
const f2 = (n?: number | null) => (n == null ? d : n.toFixed(2));
const pc = (n?: number | null) => (n == null ? d : `${Math.round(n * 100)}%`);
const signed = (n?: number | null) => (n == null ? d : `${n > 0 ? "+" : ""}${n.toFixed(1)}`);
const avg = (ws: W[], f: (w: W) => number | null | undefined) => {
  const v = ws.map(f).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};
const sum = (ws: W[], f: (w: W) => number) => ws.reduce((a, w) => a + f(w), 0);

export function cards(g: Group, ws: W[]): [string, string][] {
  const per = (f: (w: W) => number | null | undefined) => avg(ws, f);
  const opp = per((w) => oppPts(w, g));
  const act = per((w) => w.pts);
  const diff = opp != null && act != null ? act - opp : undefined;
  const tail: [string, string][] = [["Opportunity pts per game", f1(opp)], ["PPR pts per game", f1(act)], ["Points over expected", signed(diff)]];
  const games: [string, string] = ["Games", String(ws.length)];
  if (g === "RB") return [games, ["Carries per game", f1(per((w) => w.car))], ["Targets per game", f1(per((w) => w.tgt))], ["Touches per game", f1(per((w) => w.car + w.rec))], ["Target share", pc(per((w) => w.ts))], ...tail];
  if (g === "REC") {
    const tg = sum(ws, (w) => w.tgt);
    return [games, ["Targets per game", f1(per((w) => w.tgt))], ["Target share", pc(per((w) => w.ts))], ["Air yards per game", f0(per((w) => w.ay))], ["Air yards share", pc(per((w) => w.ays))], ["WOPR", f2(per((w) => w.wopr))], ["Avg depth of target", tg ? f1(sum(ws, (w) => w.ay) / tg) : d], ...tail];
  }
  const att = sum(ws, (w) => w.att);
  const pay = sum(ws, (w) => w.pay);
  return [games, ["Pass attempts per game", f1(per((w) => w.att))], ["Rush attempts per game", f1(per((w) => w.car))], ["Air yards per attempt", att && pay ? f1(pay / att) : d], ...tail];
}

export function columns(g: Group): Col[] {
  const tail: Col[] = [
    { key: "opp", label: "Opp pts", fmt: (w) => f1(oppPts(w, g)) },
    { key: "pts", label: "PPR", fmt: (w) => f1(w.pts) },
    { key: "diff", label: "+/-", fmt: (w) => (w.pts == null ? d : signed(w.pts - oppPts(w, g))) },
  ];
  if (g === "RB") return [{ key: "car", label: "Car", fmt: (w) => f0(w.car) }, { key: "tgt", label: "Tgt", fmt: (w) => f0(w.tgt) }, { key: "rec", label: "Rec", fmt: (w) => f0(w.rec) }, { key: "ts", label: "Tgt %", fmt: (w) => pc(w.ts) }, ...tail];
  if (g === "REC") return [{ key: "tgt", label: "Tgt", fmt: (w) => f0(w.tgt) }, { key: "rec", label: "Rec", fmt: (w) => f0(w.rec) }, { key: "ay", label: "Air yds", fmt: (w) => f0(w.ay) }, { key: "ts", label: "Tgt %", fmt: (w) => pc(w.ts) }, { key: "ays", label: "AY %", fmt: (w) => pc(w.ays) }, { key: "wopr", label: "WOPR", fmt: (w) => f2(w.wopr) }, ...tail];
  return [{ key: "att", label: "Att", fmt: (w) => f0(w.att) }, { key: "car", label: "Rush", fmt: (w) => f0(w.car) }, { key: "pay", label: "Air yds", fmt: (w) => (w.pay ? f0(w.pay) : d) }, ...tail];
}

// Match a Sleeper player to NFL stats: by NFL ID first, then by full name within the same position group.
// First initial plus last name is only used when one side is abbreviated, like "P.Mahomes".
// If several players share a name and none is on the same team, return nothing rather than guess.
const norm = (s: string) => s.toLowerCase().replace(/\./g, " ").replace(/['’]/g, "").replace(/-/g, " ").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
export function sameName(a: string, b: string) {
  const ta = norm(a).split(" "), tb = norm(b).split(" ");
  if (ta.join(" ") === tb.join(" ")) return true;
  if (ta[0].length > 1 && tb[0].length > 1) return false;
  return ta.length > 1 && tb.length > 1 && ta[0][0] === tb[0][0] && ta[ta.length - 1] === tb[tb.length - 1];
}
const firstName = (s: string) => norm(s).split(" ")[0];
const lastName = (s: string) => norm(s).split(" ").slice(-1)[0];
const similarFirst = (a: string, b: string) => {
  const x = firstName(a), y = firstName(b);
  return x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x));
};

// fpos lets a player listed as a defensive back in Sleeper still match his offensive stats (a two-way player).
export function findIn<T extends { name?: string; pos: string; team: string }>(
  players: Record<string, T>, gsis: string | null | undefined, name: string, pos: string, team: string, fpos?: string[] | null,
): [string, T] | undefined {
  if (gsis && players[gsis]) return [gsis, players[gsis]];
  const groups = new Set([pos, ...(fpos ?? [])].map(groupOf));
  const sameGroup = (p: T) => groups.has(groupOf(p.pos)) && (groupOf(p.pos) !== null || p.pos === pos);
  const hits = Object.entries(players).filter(([, p]) => p.name && sameGroup(p) && sameName(p.name, name));
  const exact = hits.find(([, p]) => p.team === team) ?? (hits.length === 1 ? hits[0] : undefined);
  if (exact || !team) return exact;
  // Nicknames like Matt and Matthew: same last name, same team, first names that start alike, and only one candidate.
  const near = Object.entries(players).filter(([, p]) => p.name && sameGroup(p) && p.team === team && lastName(p.name) === lastName(name) && similarFirst(p.name, name));
  return near.length === 1 ? near[0] : undefined;
}
export function findEntry(m: Metrics, gsis: string | null | undefined, name: string, pos: string, team: string) {
  return findIn(m.players, gsis, name, pos, team);
}
export const findPlayer = (...a: Parameters<typeof findEntry>) => findEntry(...a)?.[1];
