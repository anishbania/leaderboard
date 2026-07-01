import { unstable_cache } from "next/cache";
import { parseParticipantsCsv, parseRankingCsv, mergeParticipantDetails } from "./csv";
import { getLatestSnapshot, insertSnapshot } from "./db";
import { parseLiveMatchdayCsv } from "./live-matchday";
import type { SnapshotEntry } from "./movement";
import { applyRankMovement, hasLeaderboardChanged } from "./movement";
import { buildStats } from "./stats";
import type { LeaderboardPayload, SheetHealth } from "./types";

const sheetRefs = {
  ranking: { sheet: "Ranking" },
  previousRanking: { sheet: "Previous Ranking" },
  participants: { sheet: "Participants List" },
  count: { sheet: "Count", gid: "81073229" },
  prediction: { sheet: "Prediction", gid: "1163047106" },
};

function sheetUrl(sheetRef: { sheet: string; gid?: string }) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return null;

  const params = new URLSearchParams({
    tqx: "out:csv",
  });
  if (sheetRef.gid) {
    params.set("gid", sheetRef.gid);
  } else {
    params.set("sheet", sheetRef.sheet);
  }

  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString()}`;
}

async function fetchSheetCsv(sheetRef: { sheet: string; gid?: string }) {
  const url = sheetUrl(sheetRef);
  if (!url) {
    throw new Error("GOOGLE_SHEET_ID is not configured");
  }

  const response = await fetch(url, {
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Google Sheets returned ${response.status} for ${sheetRef.sheet}`);
  }

  return response.text();
}

export async function readCurrentLeaderboard() {
  const [rankingCsv, participantsCsv] = await Promise.all([
    fetchSheetCsv(sheetRefs.ranking),
    fetchSheetCsv(sheetRefs.participants),
  ]);

  return mergeParticipantDetails(parseRankingCsv(rankingCsv), parseParticipantsCsv(participantsCsv));
}

export async function readPreviousRankingSnapshot(): Promise<SnapshotEntry[]> {
  const previousRankingCsv = await fetchSheetCsv(sheetRefs.previousRanking);

  return parseRankingCsv(previousRankingCsv).map((entry) => ({
    participantId: entry.participantId,
    name: entry.name,
    rank: entry.rank,
    score: entry.score,
  }));
}

export async function readCurrentMatchdayData() {
  const [countCsv, predictionCsv] = await Promise.all([
    fetchSheetCsv(sheetRefs.count),
    fetchSheetCsv(sheetRefs.prediction),
  ]);

  return parseLiveMatchdayCsv(countCsv, predictionCsv);
}

async function buildPayload({ persistSnapshot }: { persistSnapshot: boolean }): Promise<LeaderboardPayload> {
  const checkedAt = new Date().toISOString();

  if (!process.env.GOOGLE_SHEET_ID) {
    const health: SheetHealth = {
      ok: false,
      message: "Set GOOGLE_SHEET_ID to read the public Google Sheet CSV exports.",
      checkedAt,
      source: "unconfigured",
    };

    return {
      leaderboard: [],
      stats: buildStats([]),
      lastSyncedAt: null,
      movementAvailable: false,
      health,
    };
  }

  try {
    const leaderboard = await readCurrentLeaderboard();
    const matchdayData = await readCurrentMatchdayData().catch((error) => {
      console.error("Failed to read live matchday data", error);
      return undefined;
    });
    const previousRankingSnapshot = await readPreviousRankingSnapshot().catch((error) => {
      console.error("Failed to read Previous Ranking sheet", error);
      return null;
    });
    const previousSnapshot = await getLatestSnapshot();
    const movementSource = previousRankingSnapshot?.length ? previousRankingSnapshot : (previousSnapshot?.entries ?? null);
    const leaderboardWithMovement = applyRankMovement(leaderboard, movementSource);

    let lastSyncedAt = previousSnapshot?.createdAt?.toISOString() ?? null;
    if (persistSnapshot && hasLeaderboardChanged(leaderboard, previousSnapshot?.entries ?? null)) {
      const snapshot = await insertSnapshot(leaderboard);
      lastSyncedAt = snapshot?.createdAt?.toISOString() ?? lastSyncedAt ?? checkedAt;
    }

    return {
      leaderboard: leaderboardWithMovement,
      stats: buildStats(leaderboardWithMovement),
      matchdayData,
      lastSyncedAt,
      movementAvailable: Boolean(movementSource),
      health: {
        ok: true,
        message: `Loaded ${leaderboard.length} leaderboard rows from Google Sheets.`,
        checkedAt,
        source: "google-sheet",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sheet error";

    return {
      leaderboard: [],
      stats: buildStats([]),
      lastSyncedAt: null,
      movementAvailable: false,
      health: {
        ok: false,
        message,
        checkedAt,
        source: "error",
      },
    };
  }
}

export const getCachedDashboard = unstable_cache(
  async () => buildPayload({ persistSnapshot: false }),
  ["worldcup-leaderboard-dashboard"],
  { revalidate: 60, tags: ["leaderboard"] },
);

export async function getDashboard() {
  return getCachedDashboard();
}

export async function syncDashboard() {
  return buildPayload({ persistSnapshot: true });
}
