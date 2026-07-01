import { describe, expect, it } from "vitest";
import { applyRankMovement, hasLeaderboardChanged } from "@/lib/movement";
import type { LeaderboardEntry } from "@/lib/types";

const current: LeaderboardEntry[] = [
  {
    participantId: "ada-1",
    rank: 1,
    name: "Ada",
    score: 20,
    exactPredictions: 3,
    correctTeams: 8,
    prize: 100,
    prizePercent: 0.5,
    paid: true,
    received: 10,
    predictionSubmitted: true,
    supportingTeam: null,
    selectedWinner: null,
    previousRank: null,
    rankDelta: null,
    scoreDelta: null,
  },
  {
    participantId: "grace-2",
    rank: 2,
    name: "Grace",
    score: 18,
    exactPredictions: 2,
    correctTeams: 7,
    prize: null,
    prizePercent: null,
    paid: true,
    received: 10,
    predictionSubmitted: true,
    supportingTeam: null,
    selectedWinner: null,
    previousRank: null,
    rankDelta: null,
    scoreDelta: null,
  },
];

describe("rank movement", () => {
  it("computes rank and score deltas from a previous snapshot", () => {
    const rows = applyRankMovement(current, [
      { participantId: "ada-1", rank: 2, score: 15 },
      { participantId: "grace-2", rank: 1, score: 18 },
    ]);

    expect(rows[0].previousRank).toBe(2);
    expect(rows[0].rankDelta).toBe(1);
    expect(rows[0].scoreDelta).toBe(5);
    expect(rows[1].rankDelta).toBe(-1);
    expect(rows[1].scoreDelta).toBe(0);
  });

  it("matches previous sheet rankings by name when generated participant ids differ", () => {
    const rows = applyRankMovement(current, [
      { participantId: "sheet-ada-99", name: "Ada", rank: 2, score: 15 },
      { participantId: "sheet-grace-98", name: "Grace", rank: 1, score: 18 },
    ]);

    expect(rows[0].previousRank).toBe(2);
    expect(rows[0].rankDelta).toBe(1);
    expect(rows[1].previousRank).toBe(1);
    expect(rows[1].rankDelta).toBe(-1);
  });

  it("detects unchanged snapshots", () => {
    expect(
      hasLeaderboardChanged(current, [
        { participantId: "ada-1", rank: 1, score: 20 },
        { participantId: "grace-2", rank: 2, score: 18 },
      ]),
    ).toBe(false);
  });
});
