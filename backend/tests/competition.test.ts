import { describe, expect, it } from "vitest";
import {
  companyAveragePoints,
  dailyPuzzleOffset,
  eloDeltas,
  expectedScore,
  isDailyCodeAnswerCorrect,
} from "../src/competition.js";

describe("ranked competition rules", () => {
  it("keeps equal players even and rewards an upset more", () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(eloDeltas(1000, 1000, 1)).toEqual([16, -16]);
    expect(eloDeltas(800, 1200, 1)[0]).toBeGreaterThan(16);
  });

  it("normalizes whitespace in submitted code lines", () => {
    expect(isDailyCodeAnswerCorrect("  return a + b;\n", "return a + b;")).toBe(
      true,
    );
    expect(isDailyCodeAnswerCorrect("return a + b;", "return a - b;")).toBe(
      false,
    );
  });

  it("averages points per active company member and hides undersized teams", () => {
    expect(companyAveragePoints(900, 3)).toBe(300);
    expect(companyAveragePoints(900, 2)).toBeNull();
  });

  it("selects a stable daily puzzle from the UTC date", () => {
    expect(dailyPuzzleOffset("2026-09-27", 5)).toBe(
      dailyPuzzleOffset("2026-09-27", 5),
    );
    expect(() => dailyPuzzleOffset("2026-02-30", 5)).toThrow("real UTC");
  });
});
