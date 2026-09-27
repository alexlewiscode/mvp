import { describe, expect, it } from "vitest";
import { normalizeRun, validateChallenge } from "../src/scoring.js";

describe("daily code puzzle scoring", () => {
  it("awards higher scores for faster correct solves", () => {
    expect(
      normalizeRun({
        gameId: "daily_code",
        rawScore: 20_000,
        durationMs: 20_000,
        solved: true,
        attempts: 0,
        hintUsed: false,
      }),
    ).toBe(3_580_000);
    expect(
      normalizeRun({
        gameId: "daily_code",
        rawScore: 60_000,
        durationMs: 35_000,
        solved: true,
        attempts: 2,
        hintUsed: true,
      }),
    ).toBe(3_540_000);
  });

  it("checks charged duration, hint use, and completion consistency", () => {
    expect(() =>
      normalizeRun({
        gameId: "daily_code",
        rawScore: 5_000,
        durationMs: 1_000,
        solved: true,
        attempts: 1,
        hintUsed: false,
      }),
    ).toThrow("raw_score must include attempt penalties");
    expect(() =>
      normalizeRun({
        gameId: "daily_code",
        rawScore: 30_000,
        durationMs: 10_000,
        solved: true,
        attempts: 2,
        hintUsed: false,
      }),
    ).toThrow("hint usage");
  });
});

describe("daily code puzzle identity", () => {
  const now = new Date("2026-08-20T23:59:00.000Z");

  it("accepts only the current UTC identity", () => {
    expect(
      validateChallenge(
        { date: "2026-08-20", version: 1, id: "daily_code:v1:2026-08-20" },
        now,
      ),
    ).toEqual({
      date: "2026-08-20",
      version: 1,
      id: "daily_code:v1:2026-08-20",
    });
    expect(() =>
      validateChallenge(
        { date: "2026-08-19", version: 1, id: "daily_code:v1:2026-08-19" },
        now,
      ),
    ).toThrow("current UTC date");
  });
});
