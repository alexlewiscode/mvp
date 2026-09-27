export const WIN_POINTS = 100;
export const INITIAL_ELO = 1000;
export const ELO_K = 32;
export const ELO_MATCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
export const MIN_COMPANY_ACTIVE_MEMBERS = 3;

export function isValidEmailAddress(email: string): boolean {
  if (email.length > 254) return false;
  const separator = email.indexOf("@");
  if (separator < 1 || separator > 64 || separator !== email.lastIndexOf("@"))
    return false;
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  if (
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !domain.includes(".")
  )
    return false;
  const localChars = "abcdefghijklmnopqrstuvwxyz0123456789.!#$%&'*+/=?^_`{|}~-";
  const normalizedLocal = local.toLowerCase();
  for (let index = 0; index < normalizedLocal.length; index += 1) {
    if (!localChars.includes(normalizedLocal[index] ?? "")) return false;
  }
  const labels = domain.toLowerCase().split(".");
  if ((labels.at(-1)?.length ?? 0) < 2) return false;
  return labels.every((label) => {
    if (label.length < 1 || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    for (let index = 0; index < label.length; index += 1) {
      const code = label.charCodeAt(index);
      const isDigit = code >= 48 && code <= 57;
      const isLowercase = code >= 97 && code <= 122;
      if (!isDigit && !isLowercase && code !== 45) return false;
    }
    return true;
  });
}

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
