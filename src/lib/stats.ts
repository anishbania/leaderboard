import type { DashboardStats, LeaderboardEntry } from "./types";

export function buildStats(leaderboard: LeaderboardEntry[]): DashboardStats {
  const selectedWinnerCounts = new Map<string, number>();
  const participationFee = 1000;

  for (const entry of leaderboard) {
    if (entry.selectedWinner) {
      selectedWinnerCounts.set(entry.selectedWinner, (selectedWinnerCounts.get(entry.selectedWinner) ?? 0) + 1);
    }
  }

  const topRisers = leaderboard
    .filter((entry) => (entry.rankDelta ?? 0) > 0)
    .sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0))
    .slice(0, 5);

  const topFallers = leaderboard
    .filter((entry) => (entry.rankDelta ?? 0) < 0)
    .sort((a, b) => (a.rankDelta ?? 0) - (b.rankDelta ?? 0))
    .slice(0, 5);

  return {
    participantCount: leaderboard.length,
    paidParticipants: leaderboard.filter((entry) => entry.paid).length,
    predictionsSubmitted: leaderboard.filter((entry) => entry.predictionSubmitted).length,
    prizePool: leaderboard.length * participationFee,
    activePrizeWinners: leaderboard.filter((entry) => (entry.prize ?? 0) > 0).length,
    exactPredictionTotal: leaderboard.reduce((sum, entry) => sum + entry.exactPredictions, 0),
    correctTeamsTotal: leaderboard.reduce((sum, entry) => sum + entry.correctTeams, 0),
    selectedWinnerDistribution: Array.from(selectedWinnerCounts, ([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    topRisers,
    topFallers,
  };
}
