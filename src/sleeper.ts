const BASE = "https://api.sleeper.app/v1";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`Sleeper API error ${res.status} for ${path}`);
  return res.json();
}

export type NflState = { season: string; week: number };
export type SleeperUser = { user_id: string; display_name: string };
export type League = {
  league_id: string; name: string; total_rosters: number; roster_positions: string[];
  settings?: { waiver_type?: number; waiver_budget?: number };
  scoring_settings?: Record<string, number>;
};
export type Roster = {
  roster_id: number;
  owner_id: string;
  players: string[] | null;
  reserve?: string[] | null;
  taxi?: string[] | null;
  starters: string[] | null;
  settings: { wins: number; losses: number; ties: number; fpts: number; fpts_decimal?: number; waiver_budget_used?: number; waiver_position?: number };
};
export type LeagueUser = { user_id: string; display_name: string; metadata?: { team_name?: string } };
export type Matchup = { roster_id: number; matchup_id: number | null; points: number; players_points?: Record<string, number>; starters?: string[]; players?: string[] };
export type Player = {
  name: string; pos: string; team: string; injury: string | null;
  gsis?: string | null;
  num?: number | null; age?: number | null; height?: string | null; weight?: string | null;
  college?: string | null; exp?: number | null; status?: string | null;
  injPart?: string | null; injNotes?: string | null;
  depth?: number | null; depthPos?: string | null; fpos?: string[] | null;
};
export type PlayerMap = Record<string, Player>;
export type Trend = { player_id: string; count: number };

export const getState = () => get<NflState>("/state/nfl");
export const getUser = (name: string) => get<SleeperUser | null>(`/user/${encodeURIComponent(name)}`);
export const getLeagues = (userId: string, season: string) => get<League[]>(`/user/${userId}/leagues/nfl/${season}`);
export const getRosters = (id: string) => get<Roster[]>(`/league/${id}/rosters`);
export const getLeagueUsers = (id: string) => get<LeagueUser[]>(`/league/${id}/users`);
export const getMatchups = (id: string, week: number) => get<Matchup[]>(`/league/${id}/matchups/${week}`);
export const getTrending = () => get<Trend[]>("/players/nfl/trending/add?lookback_hours=24&limit=100");

export type Txn = {
  transaction_id: string; type: string; status: string; created: number;
  adds: Record<string, number> | null; drops: Record<string, number> | null;
  settings: { waiver_bid?: number } | null;
};
export const getTxns = (id: string, week: number) => get<Txn[]>(`/league/${id}/transactions/${week}`);

const CACHE_KEY = "sleeper-players-v3";
const CACHE_MS = 6 * 60 * 60 * 1000;

// The full player file is several MB, so keep a slimmed copy in localStorage.
export async function getPlayers(): Promise<PlayerMap> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { t, d } = JSON.parse(cached);
      if (Date.now() - t < CACHE_MS) return d;
    }
  } catch { /* ignore cache problems */ }

  const raw = await get<Record<string, any>>("/players/nfl");
  const slim: PlayerMap = {};
  for (const [id, p] of Object.entries(raw)) {
    if (!p.team && p.position !== "DEF") continue;
    slim[id] = {
      name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      pos: p.position ?? "",
      team: p.team ?? "",
      injury: p.injury_status ?? null,
      gsis: p.gsis_id ?? null,
      num: p.number ?? null, age: p.age ?? null, height: p.height ?? null, weight: p.weight ?? null,
      college: p.college ?? null, exp: p.years_exp ?? null, status: p.status ?? null,
      injPart: p.injury_body_part ?? null, injNotes: p.injury_notes ?? null,
      depth: p.depth_chart_order ?? null, depthPos: p.depth_chart_position ?? null, fpos: p.fantasy_positions ?? null,
    };
  }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: slim })); } catch { /* too big or blocked */ }
  return slim;
}

// All matchups for weeks 1..week. Index 0 is week 1.
export async function getAllMatchups(id: string, week: number): Promise<Matchup[][]> {
  const last = Math.min(Math.max(week, 1), 18);
  return Promise.all(Array.from({ length: last }, (_, i) => getMatchups(id, i + 1).catch(() => [] as Matchup[])));
}

// Weekly points per player in this league's scoring, for every rostered player.
// Index 0 is week 1. Undefined means the player was on no roster that week.
export type SeasonPoints = Record<string, (number | undefined)[]>;
export function toSeasonPoints(byWeek: Matchup[][]): SeasonPoints {
  const out: SeasonPoints = {};
  byWeek.forEach((ms, i) =>
    ms.forEach((m) =>
      Object.entries(m.players_points ?? {}).forEach(([pid, pts]) => {
        (out[pid] ??= Array(byWeek.length).fill(undefined))[i] = pts;
      }),
    ),
  );
  return out;
}

// One league's rosters, owners and weekly matchups, cached for the session.
export type LeagueBundle = { rosters: Roster[]; users: LeagueUser[]; byWeek: Matchup[][] };
const bundles = new Map<string, Promise<LeagueBundle>>();
export function getLeagueBundle(id: string, week: number): Promise<LeagueBundle> {
  const key = `${id}:${week}`;
  let p = bundles.get(key);
  if (!p) {
    p = Promise.all([getRosters(id), getLeagueUsers(id), getAllMatchups(id, week)]).then(([rosters, users, byWeek]) => ({ rosters, users, byWeek }));
    p.catch(() => bundles.delete(key));
    bundles.set(key, p);
  }
  return p;
}
