import type { LeaderboardEntry } from "./types";

export type SnapshotEntry = {
  participantId: string;
  rank: number;
  score: number;
};

export function applyRankMovement(
  current: LeaderboardEntry[],
  previous: SnapshotEntry[] | null,
) {
  if (!previous || previous.length === 0) {
    return current.map((entry) => ({
      ...entry,
      previousRank: null,
      rankDelta: null,
      scoreDelta: null,
    }));
  }

  const previousById = new Map(previous.map((entry) => [entry.participantId, entry]));

  return current.map((entry) => {
    const previousEntry = previousById.get(entry.participantId);

    return {
      ...entry,
      previousRank: previousEntry?.rank ?? null,
      rankDelta: previousEntry ? previousEntry.rank - entry.rank : null,
      scoreDelta: previousEntry ? entry.score - previousEntry.score : null,
    };
  });
}

export function hasLeaderboardChanged(
  current: LeaderboardEntry[],
  previous: SnapshotEntry[] | null,
) {
  if (!previous || previous.length !== current.length) return true;
  const previousById = new Map(previous.map((entry) => [entry.participantId, entry]));

  return current.some((entry) => {
    const previousEntry = previousById.get(entry.participantId);
    return !previousEntry || previousEntry.rank !== entry.rank || previousEntry.score !== entry.score;
  });
}
