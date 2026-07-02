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
      rank: 6,
      name: "Krishna Prasad Khanal",
      prize: 1000,
      prizePercent: null,
    });
  });

  it("uses score rank and splits the 4th prize when two players tie for 4th", () => {
    const rows = parseRankingCsv(`Predictions Ranking,,,,,,,,
,Name,,,,,,,
1,Ada,120,10,30,1,"35,000.00",35%,
2,Grace,118,9,29,2,"25,000.00",25%,
3,Katherine,116,8,28,3,"20,000.00",20%,
4,Dorothy,110,7,27,4,"10,000.00",10%,
5,Annie,110,6,27,5,"5,000.00",5%,
6,Mary,90,4,20,,,,`);

    const dorothy = rows.find((row) => row.name === "Dorothy");
    const annie = rows.find((row) => row.name === "Annie");
    const mary = rows.find((row) => row.name === "Mary");

    expect(dorothy).toMatchObject({ rank: 4, prize: 5000 });
    expect(dorothy?.prizePercent).toBeCloseTo(0.05);
    expect(annie).toMatchObject({ rank: 4, prize: 5000 });
    expect(annie?.prizePercent).toBeCloseTo(0.05);
    expect(mary).toMatchObject({ rank: 5, prize: 6000 });
    expect(mary?.prizePercent).toBeCloseTo(0.05);
  });

  it("splits the 5th prize when the 5th score position has multiple players", () => {
    const rows = parseRankingCsv(`Predictions Ranking,,,,,,,,
,Name,,,,,,,
1,Ada,120,10,30,1,"35,000.00",35%,
2,Grace,118,9,29,2,"25,000.00",25%,
3,Katherine,116,8,28,3,"20,000.00",20%,
4,Dorothy,114,7,27,4,"10,000.00",10%,
5,Annie,110,6,27,5,"5,000.00",5%,
6,Mary,110,5,26,,,,
7,Hedy,110,4,25,,,,
8,Joan,90,3,20,,,,`);

    for (const name of ["Annie", "Mary", "Hedy"]) {
      expect(rows.find((row) => row.name === name)).toMatchObject({
        rank: 5,
        prize: 5000 / 3,
        prizePercent: 0.05 / 3,
      });
    }
  });

  it("splits the live sheet last-place prize across the lowest-score group", () => {
    const rows = parseRankingCsv(`Predictions Ranking,,,,,,,,
,Name,,,,,,,
1,Ada,120,10,30,1,"35,000.00",35%,
2,Grace,118,9,29,2,"25,000.00",25%,
3,Katherine,116,8,28,3,"20,000.00",20%,
4,Dorothy,114,7,27,4,"10,000.00",10%,
5,Annie,112,6,27,5,"5,000.00",5%,
6,Mary,90,4,20,,,,
7,Hedy,90,3,20,,,,`);

    expect(rows.at(-2)).toMatchObject({
      name: "Mary",
      prize: 500,
      prizePercent: null,
    });
    expect(rows.at(-1)).toMatchObject({
      name: "Hedy",
      prize: 500,
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
