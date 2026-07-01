import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getLatestSnapshot: vi.fn(async () => ({
    createdAt: new Date("2026-06-30T10:00:00.000Z"),
    entries: [
      { participantId: "ada-lovelace-1", rank: 2, score: 40 },
      { participantId: "grace-hopper-2", rank: 1, score: 39 },
      { participantId: "alan-turing-3", rank: 3, score: 37 },
    ],
  })),
  insertSnapshot: vi.fn(async () => ({
    createdAt: new Date("2026-06-30T11:00:00.000Z"),
  })),
}));

const rankingCsv = `Rank,Name,Score,Exact Predictions,Correct Teams,Prize,Prize %
1,Ada Lovelace,42,6,14,"32,550.00",35%
2,Grace Hopper,39,5,13,"18,600.00",20%
3,Alan Turing,37,4,12,,
`;

const participantsCsv = `Name,Paid,Received,Prediction Status,Supporting Team,Selected Winner
Ada Lovelace,TRUE,500,Submitted,Brazil,Argentina
Grace Hopper,TRUE,500,Submitted,England,France
Alan Turing,FALSE,0,Pending,Spain,Brazil
`;

describe("leaderboard API route", () => {
  beforeEach(() => {
    process.env.GOOGLE_SHEET_ID = "sheet-id";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        text: async () => (url.includes("Participants+List") ? participantsCsv : rankingCsv),
      })),
    );
  });

  it("returns merged leaderboard rows with movement and stats", async () => {
    const { GET } = await import("@/app/api/leaderboard/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.leaderboard).toHaveLength(3);
    expect(payload.leaderboard[0]).toMatchObject({
      name: "Ada Lovelace",
      prize: 32550,
      rankDelta: 1,
      selectedWinner: "Argentina",
    });
    expect(payload.stats).toMatchObject({
      participantCount: 3,
      paidParticipants: 2,
      prizePool: 3000,
      activePrizeWinners: 2,
    });
  });
});
