import { describe, expect, it } from "vitest";
import { getCurrentReachedBracketStage } from "@/lib/bracket-stage";
import type { ActualMatchResult } from "@/lib/types";

const result: ActualMatchResult = {
  team1: "A",
  team2: "B",
  goals1: 1,
  goals2: 0,
  winner: "A",
};

describe("current reached bracket stage", () => {
  it("defaults to the Round of 16 before knockout results arrive", () => {
    expect(getCurrentReachedBracketStage().key).toBe("round-of-16");
  });

  it.each([
    ["73", "round-of-16", 16],
    ["89", "quarter-finals", 8],
    ["97", "semi-finals", 4],
    ["101", "final", 2],
    ["104", "champion", 1],
  ] as const)("uses match %s to select the %s stage", (matchNo, key, count) => {
    const stage = getCurrentReachedBracketStage({ [matchNo]: result });
    expect(stage.key).toBe(key);
    expect(stage.expectedCountryCount).toBe(count);
  });
});
