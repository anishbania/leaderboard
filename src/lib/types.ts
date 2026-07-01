export type SheetHealth = {
  ok: boolean;
  message: string;
  checkedAt: string;
  source: "google-sheet" | "unconfigured" | "error";
};

export type LeaderboardEntry = {
  participantId: string;
  rank: number;
  name: string;
  score: number;
  exactPredictions: number;
  correctTeams: number;
  prize: number | null;
  prizePercent: number | null;
  paid: boolean | null;
  received: number | null;
  predictionSubmitted: boolean | null;
  supportingTeam: string | null;
  selectedWinner: string | null;
  previousRank: number | null;
  rankDelta: number | null;
  scoreDelta: number | null;
};

export type ParticipantEntry = {
  participantId: string;
  name: string;
  paid: boolean | null;
  received: number | null;
  predictionSubmitted: boolean | null;
  supportingTeam: string | null;
  selectedWinner: string | null;
};

export type DashboardStats = {
  participantCount: number;
  paidParticipants: number;
  predictionsSubmitted: number;
  prizePool: number;
  activePrizeWinners: number;
  exactPredictionTotal: number;
  correctTeamsTotal: number;
  selectedWinnerDistribution: Array<{ team: string; count: number }>;
  topRisers: LeaderboardEntry[];
  topFallers: LeaderboardEntry[];
};

export type LeaderboardPayload = {
  leaderboard: LeaderboardEntry[];
  stats: DashboardStats;
  matchdayData?: MatchdayData;
  lastSyncedAt: string | null;
  movementAvailable: boolean;
  health: SheetHealth;
};

export type MatchdayMatch = {
  matchNo: number;
  date: string;
  time: string;
  team1: string;
  team2: string;
  venue: string;
};

export type MatchPrediction = {
  name: string;
  team1: string;
  team2: string;
  goals1: number | null;
  goals2: number | null;
};

export type ActualMatchResult = {
  team1: string;
  team2: string;
  goals1: number;
  goals2: number;
  winner: string;
};

export type MatchdayData = {
  matches: MatchdayMatch[];
  predictionsByMatch: Record<string, MatchPrediction[]>;
  actualResults?: Record<string, ActualMatchResult>;
};
