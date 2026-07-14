import { describe, expect, it } from "vitest";
import {
  formatStageAsOfLabel,
  getCurrentReachedBracketStage,
  getProjectableStages,
  getReachedBracketStageByKey,
  resolveDashboardAsOfDate,
} from "@/lib/bracket-stage";
import type { ActualMatchResult, MatchdayData } from "@/lib/types";

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

  it("infers the semi-final stage from the calendar after QF dates pass", () => {
    expect(getCurrentReachedBracketStage(undefined, "2026-07-14").key).toBe("semi-finals");
    expect(getCurrentReachedBracketStage({}, "2026-07-14").key).toBe("semi-finals");
  });

  it("prefers official results over the calendar date", () => {
    expect(getCurrentReachedBracketStage({ "101": result }, "2026-07-14").key).toBe("final");
  });

  it("exposes projectable stages from live stage forward", () => {
    const live = getReachedBracketStageByKey("semi-finals");
    expect(getProjectableStages(live).map((stage) => stage.key)).toEqual([
      "semi-finals",
      "final",
      "champion",
    ]);
  });

  it("formats the as-of date for the UI badge", () => {
    expect(formatStageAsOfLabel("2026-07-14")).toContain("2026");
  });

  it("resolves the dashboard as-of date within the tournament window", () => {
    const matchdayData = {
      matches: [
        { matchNo: 97, date: "2026-07-10", time: "12:00", team1: "A", team2: "B", venue: "X" },
        { matchNo: 104, date: "2026-07-20", time: "12:00", team1: "C", team2: "D", venue: "Y" },
      ],
      predictionsByMatch: {},
    } satisfies MatchdayData;

    expect(resolveDashboardAsOfDate(matchdayData, "2026-07-14T12:00:00.000Z")).toBe("2026-07-14");
  });
});
