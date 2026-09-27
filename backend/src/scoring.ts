export const GAME_IDS = ["daily_code"] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface RunForNormalization {
  gameId: GameId;
  rawScore: number;
  durationMs: number;
  solved?: boolean;
  attempts?: number;
  hintUsed?: boolean;
}

export function normalizeRun(run: RunForNormalization): number {
  if (!Number.isInteger(run.rawScore) || run.rawScore < 0)
    throw new Error("raw_score must be a non-negative integer");
  if (!Number.isInteger(run.durationMs) || run.durationMs < 0)
    throw new Error("duration_ms must be a non-negative integer");
  if (run.solved !== true)
    throw new Error("daily_code result.solved must be true");
  if (
    !Number.isInteger(run.attempts) ||
    run.attempts === undefined ||
    run.attempts < 0 ||
    run.attempts > 20
  )
    throw new Error("daily_code result.attempts must be from 0 to 20");
  if (typeof run.hintUsed !== "boolean" || run.hintUsed !== run.attempts >= 2)
    throw new Error("daily_code hint usage does not match attempts");
  if (run.durationMs > 3_600_000)
    throw new Error("daily_code duration exceeds one hour");
  const charged =
    run.durationMs + run.attempts * 5_000 + (run.hintUsed ? 15_000 : 0);
  if (run.rawScore !== charged)
    throw new Error("daily_code raw_score must include attempt penalties");
  return Math.max(1, 3_600_000 - charged);
}

export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function validateChallenge(
  challenge: unknown,
  now: Date,
): { date: string; version: number; id: string } {
  if (!challenge || typeof challenge !== "object")
    throw new Error("challenge is required for daily_code");
  const value = challenge as Record<string, unknown>;
  const date = utcDate(now);
  const expectedId = `daily_code:v1:${date}`;
  if (value.date !== date)
    throw new Error("challenge.date must be the current UTC date");
  if (value.version !== 1) throw new Error("challenge.version must be 1");
  if (value.id !== expectedId)
    throw new Error(`challenge.id must be ${expectedId}`);
  return { date, version: 1, id: expectedId };
}
