import type { Group } from "./metrics";

export type RZ = { w: number; tm: string; rzt: number; rzc: number; i10t: number; i10c: number; i5t: number; i5c: number; td: number; rzpa: number; ptd: number };
export type RedZoneData = {
  generated?: string; season?: number; through?: number; error?: string;
  players: Record<string, { weeks: RZ[] }>;
  teams: Record<string, [number, number]>; // "TEAM|week" -> [team red zone targets, team red zone carries]
};

let cache: Promise<RedZoneData> | undefined;
export function loadRedZone(): Promise<RedZoneData> {
  if (!cache) {
    cache = fetch("./data/redzone.json").then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    cache.catch(() => { cache = undefined; });
  }
  return cache;
}

// One row per game the player played; games with no red zone usage are filled with zeros.
export function weekRows(rows: RZ[], played: number[], team: string): RZ[] {
  const by = new Map(rows.map((r) => [r.w, r]));
  const zero = (w: number): RZ => ({ w, tm: team, rzt: 0, rzc: 0, i10t: 0, i10c: 0, i5t: 0, i5c: 0, td: 0, rzpa: 0, ptd: 0 });
  const weeks = played.length ? played : rows.map((r) => r.w);
  return weeks.map((w) => by.get(w) ?? zero(w));
}

const total = (rows: RZ[], f: (r: RZ) => number) => rows.reduce((a, r) => a + f(r), 0);
const n = (x: number) => String(x);

export function rzCards(g: Group, rows: RZ[], teams: RedZoneData["teams"]): [string, string][] {
  const games = rows.length;
  const per = (x: number) => (games ? (x / games).toFixed(1) : "-");
  const teamTotal = (i: 0 | 1) => total(rows, (r) => teams[`${r.tm}|${r.w}`]?.[i] ?? 0);
  const share = (x: number, d: number) => (d ? `${Math.round((x / d) * 100)}%` : "-");
  if (g === "RB") {
    const c = total(rows, (r) => r.rzc), t = total(rows, (r) => r.rzt);
    return [
      ["RZ carries", n(c)], ["Inside-10 carries", n(total(rows, (r) => r.i10c))], ["Inside-5 carries", n(total(rows, (r) => r.i5c))],
      ["RZ targets", n(t)], ["RZ touches per game", per(c + t)], ["Share of team RZ carries", share(c, teamTotal(1))],
      ["RZ touchdowns", n(total(rows, (r) => r.td))],
    ];
  }
  if (g === "REC") {
    const t = total(rows, (r) => r.rzt);
    return [
      ["RZ targets", n(t)], ["Inside-10 targets", n(total(rows, (r) => r.i10t))], ["Inside-5 targets", n(total(rows, (r) => r.i5t))],
      ["RZ targets per game", per(t)], ["Share of team RZ targets", share(t, teamTotal(0))], ["RZ touchdowns", n(total(rows, (r) => r.td))],
    ];
  }
  return [
    ["RZ pass attempts", n(total(rows, (r) => r.rzpa))], ["RZ passing TDs", n(total(rows, (r) => r.ptd))],
    ["RZ rush attempts", n(total(rows, (r) => r.rzc))], ["Inside-5 rush attempts", n(total(rows, (r) => r.i5c))],
    ["RZ rushing TDs", n(total(rows, (r) => r.td))],
  ];
}

export type RZCol = { key: string; label: string; get: (r: RZ) => number };
export function rzColumns(g: Group): RZCol[] {
  if (g === "RB") return [
    { key: "rzc", label: "RZ car", get: (r) => r.rzc }, { key: "i10c", label: "In-10 car", get: (r) => r.i10c }, { key: "i5c", label: "In-5 car", get: (r) => r.i5c },
    { key: "rzt", label: "RZ tgt", get: (r) => r.rzt }, { key: "td", label: "TD", get: (r) => r.td },
  ];
  if (g === "REC") return [
    { key: "rzt", label: "RZ tgt", get: (r) => r.rzt }, { key: "i10t", label: "In-10 tgt", get: (r) => r.i10t }, { key: "i5t", label: "In-5 tgt", get: (r) => r.i5t },
    { key: "rzc", label: "RZ car", get: (r) => r.rzc }, { key: "td", label: "TD", get: (r) => r.td },
  ];
  return [
    { key: "rzpa", label: "RZ att", get: (r) => r.rzpa }, { key: "ptd", label: "Pass TD", get: (r) => r.ptd },
    { key: "rzc", label: "RZ rush", get: (r) => r.rzc }, { key: "i5c", label: "In-5 rush", get: (r) => r.i5c }, { key: "td", label: "Rush TD", get: (r) => r.td },
  ];
}
