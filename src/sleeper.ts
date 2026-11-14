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
export type Matchup = { roster_id: number; matchup_id: number | null; points: number; players_points?: Record<string, number> };
export type Player = { name: string; pos: string; team: string; injury: string | null };
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

const CACHE_KEY = "sleeper-players-v1";
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
    };
  }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: slim })); } catch { /* too big or blocked */ }
  return slim;
}

// Weekly points per player in this league's scoring, for every rostered player.
// Index 0 is week 1. Undefined means the player was on no roster that week.
export type SeasonPoints = Record<string, (number | undefined)[]>;
export async function getSeasonPoints(id: string, week: number): Promise<SeasonPoints> {
  const last = Math.min(Math.max(week, 1), 18);
  const weeks = await Promise.all(
    Array.from({ length: last }, (_, i) => getMatchups(id, i + 1).catch(() => [] as Matchup[])),
  );
  const out: SeasonPoints = {};
  weeks.forEach((ms, i) =>
    ms.forEach((m) =>
      Object.entries(m.players_points ?? {}).forEach(([pid, pts]) => {
        (out[pid] ??= Array(last).fill(undefined))[i] = pts;
      }),
    ),
  );
  return out;
}
