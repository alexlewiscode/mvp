export const WIN_POINTS = 100;
export const INITIAL_ELO = 1000;
export const ELO_K = 32;
export const ELO_MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
export const MIN_COMPANY_ACTIVE_MEMBERS = 3;

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function eloDeltas(
  rating: number,
  opponentRating: number,
  score: 0 | 0.5 | 1,
): [number, number] {
  const delta = Math.round(
    ELO_K * (score - expectedScore(rating, opponentRating)),
  );
  return [delta, -delta];
}

export function isDailyCodeAnswerCorrect(expected: string, submitted: string) {
  return normalizeCode(expected) === normalizeCode(submitted);
}

export function normalizeCode(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
}

export function companyAveragePoints(
  totalPoints: number,
  activeMemberCount: number,
  minimum = MIN_COMPANY_ACTIVE_MEMBERS,
): number | null {
  if (activeMemberCount < minimum) return null;
  return Math.round((totalPoints / activeMemberCount) * 100) / 100;
}

export function dailyPuzzleOffset(date: string, puzzleCount: number): number {
  if (puzzleCount < 1) throw new Error("puzzleCount must be positive");
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== date
  )
    throw new Error("date must be a real UTC calendar date");
  const epochDay = Math.floor(timestamp / 86_400_000);
  return ((epochDay % puzzleCount) + puzzleCount) % puzzleCount;
}
