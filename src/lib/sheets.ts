import { unstable_cache } from "next/cache";
import { parseParticipantsCsv, parseRankingCsv, mergeParticipantDetails } from "./csv";
import { getLatestSnapshot, insertSnapshot } from "./db";
import { applyRankMovement, hasLeaderboardChanged } from "./movement";
import { buildStats } from "./stats";
import type { LeaderboardPayload, SheetHealth } from "./types";

const sheetNames = {
  ranking: "Ranking",
  participants: "Participants List",
};

function sheetUrl(sheetName: string) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return null;

  const params = new URLSearchParams({
    tqx: "out:csv",
    sheet: sheetName,
  });

  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString()}`;
}

async function fetchSheetCsv(sheetName: string) {
  const url = sheetUrl(sheetName);
  if (!url) {
    throw new Error("GOOGLE_SHEET_ID is not configured");
  }

  const response = await fetch(url, {
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Google Sheets returned ${response.status} for ${sheetName}`);
  }

  return response.text();
}

export async function readCurrentLeaderboard() {
  const [rankingCsv, participantsCsv] = await Promise.all([
    fetchSheetCsv(sheetNames.ranking),
    fetchSheetCsv(sheetNames.participants),
  ]);

  return mergeParticipantDetails(parseRankingCsv(rankingCsv), parseParticipantsCsv(participantsCsv));
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
    const previousSnapshot = await getLatestSnapshot();
    const leaderboardWithMovement = applyRankMovement(leaderboard, previousSnapshot?.entries ?? null);

    let lastSyncedAt = previousSnapshot?.createdAt?.toISOString() ?? null;
    if (persistSnapshot && hasLeaderboardChanged(leaderboard, previousSnapshot?.entries ?? null)) {
      const snapshot = await insertSnapshot(leaderboard);
      lastSyncedAt = snapshot?.createdAt?.toISOString() ?? lastSyncedAt ?? checkedAt;
    }

    return {
      leaderboard: leaderboardWithMovement,
      stats: buildStats(leaderboardWithMovement),
      lastSyncedAt,
      movementAvailable: Boolean(previousSnapshot),
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
