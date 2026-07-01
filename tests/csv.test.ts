import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeParticipantDetails, parseParticipantsCsv, parseRankingCsv } from "@/lib/csv";

const fixturePath = (...parts: string[]) => join(process.cwd(), "tests", "fixtures", ...parts);

describe("sheet CSV parsing", () => {
  it("normalizes ranking currency, percentages, and invalid cells", () => {
    const rows = parseRankingCsv(readFileSync(fixturePath("ranking.csv"), "utf8"));

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      rank: 1,
      name: "Ada Lovelace",
      score: 42,
      exactPredictions: 6,
      correctTeams: 14,
      prize: 32550,
      prizePercent: 0.35,
    });
    expect(rows[2].prize).toBeNull();
    expect(rows[2].prizePercent).toBeNull();
  });

  it("parses the live sheet Ranking fixed-column layout", () => {
    const rows = parseRankingCsv(readFileSync(fixturePath("ranking-layout.csv"), "utf8"));

    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      rank: 1,
      name: "Sumana Adhikari",
      score: 115,
      exactPredictions: 11,
      correctTeams: 30,
      prize: 32550,
      prizePercent: 0.35,
    });
    expect(rows[3].prize).toBeNull();
    expect(rows[4].prize).toBeNull();
    expect(rows[5]).toMatchObject({
      rank: 93,
      name: "Krishna Prasad Khanal",
      prize: 1000,
      prizePercent: null,
    });
  });

  it("merges participant payment and winner details by name", () => {
    const ranking = parseRankingCsv(readFileSync(fixturePath("ranking.csv"), "utf8"));
    const participants = parseParticipantsCsv(readFileSync(fixturePath("participants.csv"), "utf8"));
    const merged = mergeParticipantDetails(ranking, participants);

    expect(merged[0]).toMatchObject({
      paid: true,
      received: 500,
      predictionSubmitted: true,
      supportingTeam: "Brazil",
      selectedWinner: "Argentina",
    });
    expect(merged[2].paid).toBe(false);
    expect(merged[2].predictionSubmitted).toBe(false);
  });
});
