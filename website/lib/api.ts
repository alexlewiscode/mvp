export const GAME_IDS = ["overall", "daily_code"] as const;
export const PERIODS = ["daily", "weekly", "all-time"] as const;

export type GameFilter = (typeof GAME_IDS)[number];
export type Period = (typeof PERIODS)[number];

export interface LeaderboardUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  user: LeaderboardUser;
  points: number;
}

export interface Leaderboard {
  period: string;
  from: string | null;
  through: string;
  game_id: Exclude<GameFilter, "overall"> | null;
  entries: LeaderboardEntry[];
}

export interface CompanyLeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  email_domain: string;
  active_members: number;
  average_points: number;
}

export interface CompanyLeaderboard {
  period: "rolling_30_days";
  minimum_active_members: number;
  entries: CompanyLeaderboardEntry[];
}

export class LeaderboardUnavailableError extends Error {
  constructor() {
    super("Leaderboard unavailable");
    this.name = "LeaderboardUnavailableError";
  }
}

export function parsePeriod(value: string | string[] | undefined): Period {
  const candidate = Array.isArray(value) ? value[0] : value;
  return PERIODS.includes(candidate as Period)
    ? (candidate as Period)
    : "daily";
}

export function parseGame(value: string | string[] | undefined): GameFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return GAME_IDS.includes(candidate as GameFilter)
    ? (candidate as GameFilter)
    : "overall";
}

export async function fetchLeaderboard(
  period: Period,
  game: GameFilter,
): Promise<Leaderboard> {
  const baseUrl = (process.env.MVP_API_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const effectiveGame = period === "weekly" ? "overall" : game;
  const endpoint =
    effectiveGame === "overall"
      ? `/v1/leaderboards/${period}`
      : `/v1/leaderboards/games/${effectiveGame}?period=${period === "daily" ? "daily" : "all_time"}`;

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new LeaderboardUnavailableError();
    return (await response.json()) as Leaderboard;
  } catch {
    throw new LeaderboardUnavailableError();
  }
}

export async function fetchCompanyLeaderboard(): Promise<CompanyLeaderboard> {
  const baseUrl = (process.env.MVP_API_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  try {
    const response = await fetch(`${baseUrl}/v1/leaderboards/companies`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("Company leaderboard unavailable");
    return (await response.json()) as CompanyLeaderboard;
  } catch {
    throw new LeaderboardUnavailableError();
  }
}

export function leaderboardHref(period: Period, game: GameFilter): string {
  const params = new URLSearchParams({ period });
  if (game !== "overall") params.set("game", game);
  return `/leaderboard?${params.toString()}`;
}
