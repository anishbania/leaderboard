"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  CircleDollarSign,
  Crown,
  Lock,
  LayoutGrid,
  List,
  Medal,
  RotateCcw,
  Search,
  ShieldCheck,
  Target,
  Trophy,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ComponentType, KeyboardEvent, SVGProps } from "react";
import type { LeaderboardEntry, LeaderboardPayload, MatchdayData, MatchPrediction } from "@/lib/types";
import { matchdayData as fallbackMatchdayData } from "@/lib/matchday-data";
import { calculateFinishPositionShares, trackedFinishPositionCount } from "@/lib/finish-probabilities";
import { cn, compactNumber, formatCurrency } from "@/lib/utils";

type Props = {
  initialData: LeaderboardPayload;
};

type FilterMode = "all" | "top10" | "prize" | "chasers" | "last";
type SortMode = "rank" | "score" | "prize" | "move" | "winner";
type ViewMode = "table" | "cards";
type AppTab = "leaderboard" | "predictions";
type PredictionFilter = "all" | "team1" | "draw" | "team2";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type RankMeta = {
  scorePosition: number;
  isLastScoreGroup: boolean;
};

const knockoutStartMatchNo = 73;
const bracketSimulationCount = 3000;
const bracketSeed = 20260720;
const bracketSlots = Array.from({ length: 32 }, (_, index) => knockoutStartMatchNo + index);
const bracketChildren: Record<number, [number, number]> = {
  89: [74, 77],
  90: [73, 75],
  91: [76, 78],
  92: [79, 80],
  93: [83, 84],
  94: [81, 82],
  95: [86, 88],
  96: [85, 87],
  97: [89, 90],
  98: [93, 94],
  99: [91, 92],
  100: [95, 96],
  101: [97, 98],
  102: [99, 100],
  104: [101, 102],
};
const simulationOrder = [
  73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88,
  89, 90, 91, 92, 93, 94, 95, 96,
  97, 98, 99, 100, 101, 102, 103, 104,
];
const quarterFinalFeederMatches = [89, 90, 91, 92, 93, 94, 95, 96];
const quarterFinalMatches = [97, 98, 99, 100];

const teamPalette = [
  "#0f766e",
  "#b45309",
  "#2563eb",
  "#dc2626",
  "#7c3aed",
  "#059669",
  "#be123c",
  "#475569",
];

const fallbackMatchdays = fallbackMatchdayData as MatchdayData;

function teamColor(team: string | null | undefined) {
  if (!team) return "#64748b";
  let hash = 0;
  for (const char of team) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return teamPalette[Math.abs(hash) % teamPalette.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function MovementChip({ delta }: { delta: number | null }) {
  if (delta == null) {
    return (
      <span className="inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-500">
        -
      </span>
    );
  }

  if (delta === 0) {
    return (
      <span className="inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-500">
        0
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-md border px-2 text-xs font-semibold",
        delta > 0
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700",
      )}
    >
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

function TeamPill({
  team,
  active,
  onClick,
}: {
  team: string | null;
  active?: boolean;
  onClick?: () => void;
}) {
  if (!team) {
    return <span className="text-slate-400">-</span>;
  }

  const className = cn(
    "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition",
    active
      ? "border-slate-900 bg-slate-900 text-white"
      : "border-slate-200 bg-white text-slate-700",
    onClick && !active && "hover:border-slate-300 hover:bg-slate-50",
  );

  const content = (
    <>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: teamColor(team) }} />
      <span className="min-w-0 truncate">{team}</span>
    </>
  );

  if (!onClick) {
    return (
      <span className={className}>
        {content}
      </span>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function getPredictionResult(prediction: MatchPrediction) {
  if (prediction.goals1 == null || prediction.goals2 == null) return "No score";
  if (prediction.goals1 > prediction.goals2) return prediction.team1;
  if (prediction.goals2 > prediction.goals1) return prediction.team2;
  return "Draw";
}

function scoreline(prediction: MatchPrediction) {
  if (prediction.goals1 == null || prediction.goals2 == null) return "-";
  return `${prediction.goals1}-${prediction.goals2}`;
}

function formatProbability(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  if (value > 0 && value < 0.001) return "<0.1%";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: value > 0 && value < 0.1 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function FinishProbabilityTrail({
  probabilities,
  className,
  compact = false,
}: {
  probabilities: number[] | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  const labels = ["2nd", "3rd", "4th", "5th"];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-slate-400",
        compact && "mt-0.5 justify-end gap-x-1.5 text-[9px]",
        className,
      )}
      aria-label="Probability of finishing second through fifth"
    >
      {labels.map((label, index) => (
        <span key={label} className="whitespace-nowrap">
          {label} <span className="text-slate-500">{formatProbability(probabilities?.[index + 1])}</span>
        </span>
      ))}
    </div>
  );
}

function formatRankEstimate(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  return `#${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}`;
}

function buildRankMeta(leaderboard: LeaderboardEntry[]) {
  const sorted = [...leaderboard].sort((a, b) => b.score - a.score || a.rank - b.rank || a.name.localeCompare(b.name));
  const metaByParticipant = new Map<string, RankMeta>();
  let groupStart = 0;
  let scorePosition = 1;

  while (groupStart < sorted.length) {
    let groupEnd = groupStart + 1;
    while (groupEnd < sorted.length && sorted[groupEnd].score === sorted[groupStart].score) {
      groupEnd += 1;
    }

    const isLastScoreGroup = groupEnd === sorted.length;
    for (let index = groupStart; index < groupEnd; index += 1) {
      metaByParticipant.set(sorted[index].participantId, { scorePosition, isLastScoreGroup });
    }

    groupStart = groupEnd;
    scorePosition += 1;
  }

  return metaByParticipant;
}

function RankMarker({ meta }: { meta?: RankMeta }) {
  if (!meta) return null;

  const positionLabel = `Score position ${meta.scorePosition}`;
  const topIcon =
    meta.scorePosition === 1
      ? { Icon: Crown, className: "text-amber-600", label: positionLabel }
      : meta.scorePosition >= 2 && meta.scorePosition <= 5
        ? { Icon: Medal, className: "text-amber-600", label: positionLabel }
        : null;

  const TopIcon = topIcon?.Icon;

  return (
    <>
      {TopIcon && topIcon ? (
        <TopIcon className={cn("h-3.5 w-3.5 opacity-70", topIcon.className)} aria-label={topIcon.label} />
      ) : null}
      {meta.isLastScoreGroup ? (
        <CircleDollarSign className="h-3.5 w-3.5 text-rose-600 opacity-60" aria-label="Last score group" />
      ) : null}
    </>
  );
}

function RankText({ entry, meta }: { entry: LeaderboardEntry; meta?: RankMeta }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span>#{entry.rank}</span>
      <RankMarker meta={meta} />
    </span>
  );
}

function predictedWinner(prediction: MatchPrediction | undefined) {
  if (!prediction || prediction.goals1 == null || prediction.goals2 == null) return null;
  if (prediction.goals1 > prediction.goals2) return prediction.team1;
  if (prediction.goals2 > prediction.goals1) return prediction.team2;
  return null;
}

function roundWeight(matchNo: number) {
  if (matchNo >= 73 && matchNo <= 88) return 1;
  if (matchNo >= 89 && matchNo <= 96) return 2;
  if (matchNo >= 97 && matchNo <= 100) return 4;
  if (matchNo >= 101 && matchNo <= 103) return 8;
  return 16;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buildTeamStrength(matchdayData: MatchdayData) {
  const teamStrength = new Map<string, number>();

  for (const matchNo of bracketSlots) {
    const weight = roundWeight(matchNo);
    for (const prediction of matchdayData.predictionsByMatch[String(matchNo)] ?? []) {
      teamStrength.set(prediction.team1, (teamStrength.get(prediction.team1) ?? 1) + 0.1);
      teamStrength.set(prediction.team2, (teamStrength.get(prediction.team2) ?? 1) + 0.1);
      const winner = predictedWinner(prediction);
      if (winner) {
        teamStrength.set(winner, (teamStrength.get(winner) ?? 1) + weight);
      }
    }
  }

  return teamStrength;
}

function buildPredictionIndex(matchdayData: MatchdayData) {
  const byName = new Map<string, Map<number, MatchPrediction>>();
  for (const matchNo of bracketSlots) {
    for (const prediction of matchdayData.predictionsByMatch[String(matchNo)] ?? []) {
      const person = byName.get(prediction.name) ?? new Map<number, MatchPrediction>();
      person.set(matchNo, prediction);
      byName.set(prediction.name, person);
    }
  }
  return byName;
}

function validatePersonBracket(predictions: Map<number, MatchPrediction>) {
  const issues: string[] = [];

  for (const matchNo of bracketSlots) {
    const prediction = predictions.get(matchNo);
    if (!prediction) {
      issues.push(`Missing match ${matchNo}`);
      continue;
    }
    if (prediction.goals1 == null || prediction.goals2 == null) {
      issues.push(`Missing score for match ${matchNo}`);
    }
  }

  for (const [matchNoText, children] of Object.entries(bracketChildren)) {
    const matchNo = Number(matchNoText);
    const prediction = predictions.get(matchNo);
    const leftChild = predictions.get(children[0]);
    const rightChild = predictions.get(children[1]);

    if (!prediction || !leftChild || !rightChild) continue;
    if (![leftChild.team1, leftChild.team2].includes(prediction.team1)) {
      issues.push(`Match ${matchNo} first team does not come from match ${children[0]}`);
    }
    if (![rightChild.team1, rightChild.team2].includes(prediction.team2)) {
      issues.push(`Match ${matchNo} second team does not come from match ${children[1]}`);
    }
  }

  const thirdPlace = predictions.get(103);
  const final = predictions.get(104);
  const semiOne = predictions.get(101);
  const semiTwo = predictions.get(102);
  if (thirdPlace && final && semiOne && semiTwo) {
    const semiOneLoser = [semiOne.team1, semiOne.team2].find((team) => team !== final.team1);
    const semiTwoLoser = [semiTwo.team1, semiTwo.team2].find((team) => team !== final.team2);
    if (semiOneLoser && thirdPlace.team1 !== semiOneLoser) {
      issues.push("Third-place first team does not match the semifinal 1 loser");
    }
    if (semiTwoLoser && thirdPlace.team2 !== semiTwoLoser) {
      issues.push("Third-place second team does not match the semifinal 2 loser");
    }
  }

  return issues;
}

function predictionWinnerCounts(matchdayData: MatchdayData, matchNo: number) {
  const counts = new Map<string, number>();
  for (const prediction of matchdayData.predictionsByMatch[String(matchNo)] ?? []) {
    const winner = predictedWinner(prediction);
    if (winner) counts.set(winner, (counts.get(winner) ?? 0) + 1);
  }
  return counts;
}

function sortTeamsByConsensus(teams: Iterable<string>, counts: Map<string, number>) {
  return Array.from(new Set(Array.from(teams).filter(Boolean))).sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
  );
}

function baseMatchTeams(matchdayData: MatchdayData, matchNo: number) {
  const result = matchdayData.actualResults?.[String(matchNo)];
  if (result) return [result.winner];

  const match = matchdayData.matches.find((item) => item.matchNo === matchNo);
  return [match?.team1, match?.team2].filter((team): team is string => Boolean(team));
}

function possibleProgressionTeams(matchdayData: MatchdayData, matchNo: number): string[] {
  const result = matchdayData.actualResults?.[String(matchNo)];
  if (result) return [result.winner];

  if (matchNo >= 73 && matchNo <= 88) {
    return baseMatchTeams(matchdayData, matchNo);
  }

  const children = bracketChildren[matchNo];
  if (!children) {
    return baseMatchTeams(matchdayData, matchNo);
  }

  return Array.from(
    new Set(children.flatMap((childMatchNo) => possibleProgressionTeams(matchdayData, childMatchNo))),
  );
}

function directCompetitorTeams(matchdayData: MatchdayData, matchNo: number) {
  const result = matchdayData.actualResults?.[String(matchNo)];
  if (result) return [result.team1, result.team2];

  const match = matchdayData.matches.find((item) => item.matchNo === matchNo);
  const sheetTeams = [match?.team1, match?.team2].filter((team): team is string => Boolean(team));
  if (sheetTeams.length === 2 && !sheetTeams.some((team) => /^winner\b/i.test(team))) {
    return sheetTeams;
  }

  const children = bracketChildren[matchNo];
  if (!children) return sheetTeams;

  return Array.from(
    new Set(children.flatMap((childMatchNo) => possibleProgressionTeams(matchdayData, childMatchNo))),
  );
}

function findUpstreamMatchForTeam(matchdayData: MatchdayData, matchNo: number, team: string): number | null {
  if (baseMatchTeams(matchdayData, matchNo).includes(team)) return matchNo;

  const children = bracketChildren[matchNo];
  if (!children) return null;

  for (const childMatchNo of children) {
    const found = findUpstreamMatchForTeam(matchdayData, childMatchNo, team);
    if (found != null) return found;
  }

  return null;
}

function buildQuarterFinalOptions(matchdayData: MatchdayData) {
  return quarterFinalFeederMatches.map((matchNo) => {
    const lockedResult = matchdayData.actualResults?.[String(matchNo)];
    const counts = predictionWinnerCounts(matchdayData, matchNo);
    const competitors = directCompetitorTeams(matchdayData, matchNo);
    const candidates = sortTeamsByConsensus(
      lockedResult ? [lockedResult.winner] : competitors,
      counts,
    );

    return {
      matchNo,
      quarterFinalMatchNo: quarterFinalMatches.find((quarterMatchNo) =>
        bracketChildren[quarterMatchNo]?.includes(matchNo),
      ) ?? null,
      locked: Boolean(lockedResult),
      selectedTeam: lockedResult?.winner ?? candidates[0] ?? "",
      candidates,
      topCount: counts.get(lockedResult?.winner ?? candidates[0] ?? "") ?? 0,
      pickCount: (matchdayData.predictionsByMatch[String(matchNo)] ?? []).length,
    };
  });
}

type QuarterFinalScenario = ReturnType<typeof buildQuarterFinalOptions>;

function scoreScenarioBracket(
  name: string,
  currentScore: number,
  predictions: Map<number, MatchPrediction> | undefined,
  actualTeams: Map<number, [string, string]>,
  actualWinners: Map<number, string>,
) {
  let score = currentScore;

  for (const matchNo of bracketSlots) {
    const prediction = predictions?.get(matchNo);
    const actualMatchTeams = actualTeams.get(matchNo);
    const actualWinner = actualWinners.get(matchNo);
    if (!prediction || !actualMatchTeams || !actualWinner) continue;

    const weight = roundWeight(matchNo);
    if ([prediction.team1, prediction.team2].includes(actualMatchTeams[0])) score += weight * 0.25;
    if ([prediction.team1, prediction.team2].includes(actualMatchTeams[1])) score += weight * 0.25;
    if (predictedWinner(prediction) === actualWinner) score += weight;
  }

  return { name, score };
}

function applyProjectedRanks(scores: Array<{ name: string; score: number }>) {
  const sorted = [...scores].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const rankByName = new Map<string, number>();
  let rank = 1;

  sorted.forEach((item, index) => {
    if (index > 0 && item.score < sorted[index - 1].score) rank = index + 1;
    rankByName.set(item.name, rank);
  });

  return rankByName;
}

function buildQuarterFinalProjection(
  leaderboard: LeaderboardEntry[],
  matchdayData: MatchdayData,
  scenario: QuarterFinalScenario,
) {
  const predictionIndex = buildPredictionIndex(matchdayData);
  const entryByName = new Map(leaderboard.map((entry) => [entry.name, entry]));
  const names = Array.from(new Set([...leaderboard.map((entry) => entry.name), ...predictionIndex.keys()]));
  const matchByNo = new Map(matchdayData.matches.map((match) => [match.matchNo, match]));
  const teamStrength = buildTeamStrength(matchdayData);
  const forcedWinners = new Map<number, string>();
  for (const slot of scenario) {
    if (!slot.selectedTeam) continue;
    forcedWinners.set(slot.matchNo, slot.selectedTeam);

    const upstreamMatchNo = findUpstreamMatchForTeam(matchdayData, slot.matchNo, slot.selectedTeam);
    if (upstreamMatchNo != null && upstreamMatchNo !== slot.matchNo) {
      forcedWinners.set(upstreamMatchNo, slot.selectedTeam);
    }
  }
  const validations = new Map(
    names.map((name) => {
      const issues = validatePersonBracket(predictionIndex.get(name) ?? new Map<number, MatchPrediction>());
      return [name, issues];
    }),
  );
  const resultByName = new Map(
    names.map((name) => {
      const entry = entryByName.get(name);
      return [
        name,
        {
          name,
          currentRank: entry?.rank ?? null,
          currentScore: entry?.score ?? 0,
          projectedRankTotal: 0,
          projectedScoreTotal: 0,
          bestRank: Number.POSITIVE_INFINITY,
          worstRank: 0,
          topCount: 0,
          champion: predictedWinner(predictionIndex.get(name)?.get(104)) ?? "No winner",
          validBracket: (validations.get(name) ?? []).length === 0,
        },
      ];
    }),
  );

  const random = seededRandom(bracketSeed + 97);
  for (let simulation = 0; simulation < bracketSimulationCount; simulation++) {
    const actualTeams = new Map<number, [string, string]>();
    const actualWinners = new Map<number, string>();
    const actualLosers = new Map<number, string>();

    for (const matchNo of simulationOrder) {
      const children = bracketChildren[matchNo];
      const lockedResult = matchdayData.actualResults?.[String(matchNo)];
      const forcedWinner = forcedWinners.get(matchNo);
      let teams: [string, string] | null = null;

      if (lockedResult) {
        teams = [lockedResult.team1, lockedResult.team2];
      } else if (matchNo >= 73 && matchNo <= 88) {
        const match = matchByNo.get(matchNo);
        if (match) teams = [match.team1, match.team2];
      } else if (matchNo === 103) {
        const firstLoser = actualLosers.get(101);
        const secondLoser = actualLosers.get(102);
        if (firstLoser && secondLoser) teams = [firstLoser, secondLoser];
      } else if (children) {
        const firstWinner = actualWinners.get(children[0]);
        const secondWinner = actualWinners.get(children[1]);
        if (firstWinner && secondWinner) teams = [firstWinner, secondWinner];
      }

      const match = matchByNo.get(matchNo);
      if (!teams && match) teams = [match.team1, match.team2];
      if (!teams) continue;

      let winner: string;
      if (lockedResult) {
        winner = lockedResult.winner;
      } else if (forcedWinner && teams.includes(forcedWinner)) {
        winner = forcedWinner;
      } else if (forcedWinner) {
        winner = forcedWinner;
        teams = [forcedWinner, teams.find((team) => team !== forcedWinner) ?? teams[0]];
      } else {
        const firstStrength = teamStrength.get(teams[0]) ?? 1;
        const secondStrength = teamStrength.get(teams[1]) ?? 1;
        const firstWinChance = firstStrength / (firstStrength + secondStrength);
        winner = random() <= firstWinChance ? teams[0] : teams[1];
      }

      const loser = winner === teams[0] ? teams[1] : teams[0];
      actualTeams.set(matchNo, teams);
      actualWinners.set(matchNo, winner);
      actualLosers.set(matchNo, loser);
    }

    const scores = names.map((name) =>
      scoreScenarioBracket(
        name,
        entryByName.get(name)?.score ?? 0,
        predictionIndex.get(name),
        actualTeams,
        actualWinners,
      ),
    );
    const rankByName = applyProjectedRanks(scores);
    const topRank = Math.min(...rankByName.values());

    for (const score of scores) {
      const result = resultByName.get(score.name);
      const rank = rankByName.get(score.name) ?? names.length;
      if (!result) continue;
      result.projectedScoreTotal += score.score;
      result.projectedRankTotal += rank;
      result.bestRank = Math.min(result.bestRank, rank);
      result.worstRank = Math.max(result.worstRank, rank);
      if (rank === topRank) result.topCount += 1;
    }
  }

  return Array.from(resultByName.values())
    .map((item) => ({
      ...item,
      projectedScore: item.projectedScoreTotal / bracketSimulationCount,
      projectedRank: item.projectedRankTotal / bracketSimulationCount,
      titleChance: item.topCount / bracketSimulationCount,
      bestRank: Number.isFinite(item.bestRank) ? item.bestRank : null,
      worstRank: item.worstRank || null,
    }))
    .sort((a, b) => a.projectedRank - b.projectedRank || b.projectedScore - a.projectedScore || a.name.localeCompare(b.name));
}

function buildBracketOutlook(leaderboard: LeaderboardEntry[], matchdayData: MatchdayData) {
  const predictionIndex = buildPredictionIndex(matchdayData);
  const entryByName = new Map(leaderboard.map((entry) => [entry.name, entry]));
  const names = Array.from(new Set([...leaderboard.map((entry) => entry.name), ...predictionIndex.keys()]));
  const matchByNo = new Map(matchdayData.matches.map((match) => [match.matchNo, match]));
  const teamStrength = buildTeamStrength(matchdayData);

  const validations = new Map(
    names.map((name) => {
      const issues = validatePersonBracket(predictionIndex.get(name) ?? new Map<number, MatchPrediction>());
      return [name, issues];
    }),
  );
  const resultByName = new Map(
    names.map((name) => {
      const entry = entryByName.get(name);
      return [
        name,
        {
          name,
          currentRank: entry?.rank ?? null,
          currentScore: entry?.score ?? 0,
          finishCounts: Array<number>(trackedFinishPositionCount).fill(0),
          scoreTotal: 0,
          bestScore: 0,
          champion: predictedWinner(predictionIndex.get(name)?.get(104)) ?? "No winner",
          issues: validations.get(name) ?? [],
        },
      ];
    }),
  );

  const random = seededRandom(bracketSeed);
  for (let simulation = 0; simulation < bracketSimulationCount; simulation++) {
    const actualTeams = new Map<number, [string, string]>();
    const actualWinners = new Map<number, string>();
    const actualLosers = new Map<number, string>();

    for (const matchNo of simulationOrder) {
      const children = bracketChildren[matchNo];
      let teams: [string, string] | null = null;

      const lockedResult = matchdayData.actualResults?.[String(matchNo)];

      if (lockedResult) {
        teams = [lockedResult.team1, lockedResult.team2];
      } else if (matchNo >= 73 && matchNo <= 88) {
        const match = matchByNo.get(matchNo);
        if (match) teams = [match.team1, match.team2];
      } else if (matchNo === 103) {
        const firstLoser = actualLosers.get(101);
        const secondLoser = actualLosers.get(102);
        if (firstLoser && secondLoser) teams = [firstLoser, secondLoser];
      } else if (children) {
        const firstWinner = actualWinners.get(children[0]);
        const secondWinner = actualWinners.get(children[1]);
        if (firstWinner && secondWinner) teams = [firstWinner, secondWinner];
      }

      if (!teams) continue;

      const firstStrength = teamStrength.get(teams[0]) ?? 1;
      const secondStrength = teamStrength.get(teams[1]) ?? 1;
      const firstWinChance = firstStrength / (firstStrength + secondStrength);
      const winner = lockedResult ? lockedResult.winner : random() <= firstWinChance ? teams[0] : teams[1];
      const loser = winner === teams[0] ? teams[1] : teams[0];

      actualTeams.set(matchNo, teams);
      actualWinners.set(matchNo, winner);
      actualLosers.set(matchNo, loser);
    }

    const scores = new Map<string, number>();
    for (const name of names) {
      const personPredictions = predictionIndex.get(name);
      const currentScore = entryByName.get(name)?.score ?? 0;
      let score = currentScore;

      for (const matchNo of bracketSlots) {
        const prediction = personPredictions?.get(matchNo);
        const actualMatchTeams = actualTeams.get(matchNo);
        const actualWinner = actualWinners.get(matchNo);
        if (!prediction || !actualMatchTeams || !actualWinner) continue;

        const weight = roundWeight(matchNo);
        if ([prediction.team1, prediction.team2].includes(actualMatchTeams[0])) score += weight * 0.25;
        if ([prediction.team1, prediction.team2].includes(actualMatchTeams[1])) score += weight * 0.25;
        if (predictedWinner(prediction) === actualWinner) score += weight;
      }

      scores.set(name, score);
      const result = resultByName.get(name);
      if (result) {
        result.scoreTotal += score;
        result.bestScore = Math.max(result.bestScore, score);
      }
    }

    const finishShares = calculateFinishPositionShares(scores);
    for (const [name, shares] of finishShares) {
      const result = resultByName.get(name);
      if (!result) continue;
      shares.forEach((share, positionIndex) => {
        result.finishCounts[positionIndex] += share;
      });
    }
  }

  const standings = Array.from(resultByName.values())
    .map((item) => ({
      ...item,
      finishChances: item.finishCounts.map((count) => count / bracketSimulationCount),
      winChance: item.finishCounts[0] / bracketSimulationCount,
      averageScore: item.scoreTotal / bracketSimulationCount,
      validBracket: item.issues.length === 0,
    }))
    .sort((a, b) => b.winChance - a.winChance || b.averageScore - a.averageScore || a.name.localeCompare(b.name));

  return {
    standings,
    validBracketCount: standings.filter((item) => item.validBracket).length,
    simulationCount: bracketSimulationCount,
    topChampion: Array.from(
      standings.reduce((counts, item) => counts.set(item.champion, (counts.get(item.champion) ?? 0) + 1), new Map<string, number>()),
      ([team, count]) => ({ team, count }),
    ).sort((a, b) => b.count - a.count)[0],
  };
}

type BracketOutlook = ReturnType<typeof buildBracketOutlook>;

function formatMatchDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatSyncedAt(value: string | null) {
  if (!value) return "Live sheet";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function pickInitialDate(dates: string[], asOfDate: string) {
  return dates.find((date) => date >= asOfDate) ?? dates.at(-1) ?? dates[0] ?? asOfDate;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function MatchdayPredictions({
  leaderboard,
  onSelectPlayer,
}: {
  leaderboard: LeaderboardEntry[];
  onSelectPlayer: (participantId: string) => void;
}) {
  const matchdays = fallbackMatchdays;
  const dates = useMemo(() => Array.from(new Set(matchdays.matches.map((match) => match.date))).sort(), [matchdays.matches]);
  const [selectedDate, setSelectedDate] = useState(() => pickInitialDate(dates, "2026-07-06"));
  const dayMatches = useMemo(
    () => matchdays.matches.filter((match) => match.date === selectedDate),
    [matchdays.matches, selectedDate],
  );
  const [selectedMatchNo, setSelectedMatchNo] = useState<number | null>(dayMatches[0]?.matchNo ?? null);
  const selectedMatch = dayMatches.find((match) => match.matchNo === selectedMatchNo) ?? dayMatches[0] ?? null;
  const playerByName = useMemo(() => new Map(leaderboard.map((entry) => [entry.name, entry])), [leaderboard]);

  const predictions = useMemo(() => {
    if (!selectedMatch) return [];
    return matchdays.predictionsByMatch[String(selectedMatch.matchNo)] ?? [];
  }, [matchdays.predictionsByMatch, selectedMatch]);

  const consensus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const prediction of predictions) {
      const result = getPredictionResult(prediction);
      counts.set(result, (counts.get(result) ?? 0) + 1);
    }
    return Array.from(counts, ([result, count]) => ({ result, count })).sort((a, b) => b.count - a.count);
  }, [predictions]);

  const topConsensus = consensus.slice(0, 3);
  const exactGroups = useMemo(() => {
    const groups = new Map<string, number>();
    for (const prediction of predictions) {
      const key = `${prediction.team1} ${scoreline(prediction)} ${prediction.team2}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    return Array.from(groups, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 4);
  }, [predictions]);

  function changeDate(date: string) {
    setSelectedDate(date);
    const firstMatch = matchdays.matches.find((match) => match.date === date);
    setSelectedMatchNo(firstMatch?.matchNo ?? null);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-white sm:p-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase text-teal-700">Matchday predictions</p>
          <h2 className="mt-1 text-base font-semibold text-slate-950 sm:text-lg">Today&apos;s picks at a glance</h2>
        </div>
        <select
          value={selectedDate}
          onChange={(event) => changeDate(event.target.value)}
          className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-teal-500 sm:h-9"
          aria-label="Select matchday"
        >
          {dates.map((date) => (
            <option key={date} value={date}>
              {formatMatchDate(date)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {dayMatches.map((match) => (
          <button
            type="button"
            key={match.matchNo}
            onClick={() => setSelectedMatchNo(match.matchNo)}
            className={cn(
              "rounded-lg border p-3 text-left transition",
              selectedMatch?.matchNo === match.matchNo
                ? "border-slate-900 bg-slate-950 text-white"
                : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white",
            )}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={selectedMatch?.matchNo === match.matchNo ? "text-teal-200" : "text-slate-500"}>
                Match {match.matchNo} &middot; {match.time}
              </span>
              <span className={selectedMatch?.matchNo === match.matchNo ? "text-slate-300" : "text-slate-500"}>
                {match.venue}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-sm font-semibold">
              <span className="truncate">{match.team1}</span>
              <span className={selectedMatch?.matchNo === match.matchNo ? "text-slate-400" : "text-slate-400"}>vs</span>
              <span className="truncate text-right">{match.team2}</span>
            </div>
          </button>
        ))}
      </div>

      {selectedMatch ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Consensus</p>
            {predictions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Predictions are not available for this fixture slot yet.</p>
            ) : (
              <>
                <div className="mt-3 space-y-2">
                  {topConsensus.map((item) => (
                    <div key={item.result} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-800">{item.result}</span>
                        <span className="text-xs text-slate-500">{item.count} picks</span>
                      </div>
                      <div className="h-2 rounded-full bg-white">
                        <div
                          className="h-2 rounded-full bg-teal-600"
                          style={{ width: `${Math.max(6, (item.count / Math.max(predictions.length, 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Most common scorelines</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {exactGroups.map((item) => (
                      <span key={item.label} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                        {item.label} &middot; {item.count}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">Everyone&apos;s prediction</p>
              <p className="text-xs text-slate-500">{predictions.length} entries</p>
            </div>
            {predictions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                Select another match on this day to view participant predictions.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {predictions.map((prediction) => {
                const player = playerByName.get(prediction.name);
                return (
                  <button
                    type="button"
                    key={`${selectedMatch.matchNo}-${prediction.name}`}
                    onClick={() => player && onSelectPlayer(player.participantId)}
                    className="rounded-md border border-slate-200 bg-white p-2 text-left shadow-sm transition hover:border-teal-300 hover:bg-teal-50/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-semibold text-slate-900">{prediction.name}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">{scoreline(prediction)}</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {prediction.team1} vs {prediction.team2}
                    </p>
                  </button>
                );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StatCard({
  label,
  value,
  icon: IconComponent,
  sub,
  accent = "teal",
}: {
  label: string;
  value: string;
  icon: Icon;
  sub?: string;
  accent?: "teal" | "amber" | "rose";
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="group relative overflow-hidden rounded-xl border border-white/70 bg-white/90 p-3 shadow-[0_8px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70 backdrop-blur transition hover:shadow-[0_12px_38px_rgba(15,23,42,0.09)] sm:p-4"
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          accent === "teal" && "bg-teal-600",
          accent === "amber" && "bg-amber-500",
          accent === "rose" && "bg-rose-600",
        )}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-slate-950 group-hover:text-white sm:h-9 sm:w-9">
          <IconComponent className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:mt-3 sm:text-2xl">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </motion.div>
  );
}

function PredictionCenter({
  leaderboard,
  matchdayData,
  bracketOutlook,
  asOfDate,
  onSelectPlayer,
}: {
  leaderboard: LeaderboardEntry[];
  matchdayData: MatchdayData;
  bracketOutlook: BracketOutlook;
  asOfDate: string;
  onSelectPlayer: (participantId: string) => void;
}) {
  const bracketMatches = useMemo(
    () => matchdayData.matches.filter((match) => match.matchNo >= knockoutStartMatchNo),
    [matchdayData],
  );
  const dates = useMemo(() => Array.from(new Set(bracketMatches.map((match) => match.date))).sort(), [bracketMatches]);
  const [selectedDate, setSelectedDate] = useState(() => pickInitialDate(dates, asOfDate));
  const [predictionQuery, setPredictionQuery] = useState("");
  const [predictionFilter, setPredictionFilter] = useState<PredictionFilter>("all");
  const dayMatches = useMemo(() => bracketMatches.filter((match) => match.date === selectedDate), [bracketMatches, selectedDate]);
  const [selectedMatchNo, setSelectedMatchNo] = useState<number | null>(dayMatches[0]?.matchNo ?? null);
  const selectedMatch = dayMatches.find((match) => match.matchNo === selectedMatchNo) ?? dayMatches[0] ?? null;
  const playerByName = useMemo(() => new Map(leaderboard.map((entry) => [entry.name, entry])), [leaderboard]);
  const topOutlook = bracketOutlook.standings[0];
  const shownOutlook = useMemo(() => bracketOutlook.standings.slice(0, 8), [bracketOutlook]);
  const quarterFinalOptions = useMemo(() => buildQuarterFinalOptions(matchdayData), [matchdayData]);
  const [quarterFinalSelections, setQuarterFinalSelections] = useState<Record<number, string>>({});
  const quarterFinalScenario = useMemo(
    () =>
      quarterFinalOptions.map((slot) => ({
        ...slot,
        selectedTeam: quarterFinalSelections[slot.matchNo] ?? slot.selectedTeam,
      })),
    [quarterFinalOptions, quarterFinalSelections],
  );
  const quarterFinalProjection = useMemo(
    () => buildQuarterFinalProjection(leaderboard, matchdayData, quarterFinalScenario),
    [leaderboard, matchdayData, quarterFinalScenario],
  );
  const quarterFinalProjectionLeader = quarterFinalProjection[0];
  const selectedQuarterFinalTeams = useMemo(
    () => quarterFinalScenario.map((slot) => slot.selectedTeam).filter(Boolean),
    [quarterFinalScenario],
  );
  const quarterFinalPairs = useMemo(
    () =>
      quarterFinalMatches.map((matchNo) => ({
        matchNo,
        feeders: bracketChildren[matchNo]?.map((feederNo) => quarterFinalScenario.find((slot) => slot.matchNo === feederNo)) ?? [],
      })),
    [quarterFinalScenario],
  );

  const predictions = useMemo(() => {
    if (!selectedMatch) return [];
    return matchdayData.predictionsByMatch[String(selectedMatch.matchNo)] ?? [];
  }, [matchdayData, selectedMatch]);

  const consensus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const prediction of predictions) {
      const result = getPredictionResult(prediction);
      counts.set(result, (counts.get(result) ?? 0) + 1);
    }
    return Array.from(counts, ([result, count]) => ({ result, count })).sort((a, b) => b.count - a.count);
  }, [predictions]);

  const scorelineGroups = useMemo(() => {
    const groups = new Map<string, number>();
    for (const prediction of predictions) {
      const label = `${prediction.team1} ${scoreline(prediction)} ${prediction.team2}`;
      groups.set(label, (groups.get(label) ?? 0) + 1);
    }
    return Array.from(groups, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [predictions]);

  const filteredPredictions = useMemo(() => {
    const normalizedQuery = predictionQuery.trim().toLowerCase();

    return predictions.filter((prediction) => {
      const result = getPredictionResult(prediction);
      const matchesQuery =
        !normalizedQuery ||
        prediction.name.toLowerCase().includes(normalizedQuery) ||
        prediction.team1.toLowerCase().includes(normalizedQuery) ||
        prediction.team2.toLowerCase().includes(normalizedQuery) ||
        scoreline(prediction).includes(normalizedQuery);

      const matchesFilter =
        predictionFilter === "all" ||
        (predictionFilter === "team1" &&
          prediction.goals1 != null &&
          prediction.goals2 != null &&
          prediction.goals1 > prediction.goals2) ||
        (predictionFilter === "team2" &&
          prediction.goals1 != null &&
          prediction.goals2 != null &&
          prediction.goals2 > prediction.goals1) ||
        (predictionFilter === "draw" && result === "Draw");

      return matchesQuery && matchesFilter;
    });
  }, [predictionFilter, predictionQuery, predictions]);

  const resultFilters = selectedMatch
    ? [
        { value: "all" as const, label: "All picks" },
        { value: "team1" as const, label: "First team wins" },
        { value: "draw" as const, label: "Draw" },
        { value: "team2" as const, label: "Second team wins" },
      ]
    : [];
  const selectedDateIndex = Math.max(0, dates.indexOf(selectedDate));
  const minWorldCupDate = dates[0] ?? "2026-06-29";
  const maxWorldCupDate = dates.at(-1) ?? "2026-07-20";

  function selectDate(date: string) {
    const nextDate = dates.includes(date)
      ? date
      : (dates.find((matchDate) => matchDate >= date) ?? dates.at(-1) ?? date);
    setSelectedDate(nextDate);
    const firstMatch = bracketMatches.find((match) => match.date === nextDate);
    setSelectedMatchNo(firstMatch?.matchNo ?? null);
    setPredictionFilter("all");
    setPredictionQuery("");
  }

  function resetQuarterFinalScenario() {
    setQuarterFinalSelections({});
  }

  return (
    <section className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-3 text-white shadow-[0_18px_50px_rgba(15,23,42,0.22)] sm:p-5">
        <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(20,184,166,.18),transparent_38%),radial-gradient(circle_at_85%_18%,rgba(245,158,11,.22),transparent_26%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-teal-300/70 to-transparent" />
        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-teal-200">Bracket Center</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-3xl">Knockout pick board</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Choose a bracket slot and scan each person&apos;s Round of 32 through Final prediction.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 text-center text-xs min-[420px]:grid-cols-3 lg:w-auto lg:min-w-[300px]">
            <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 shadow-inner">
              <p className="text-slate-300">Matches</p>
              <p className="mt-1 text-lg font-semibold">{dayMatches.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 shadow-inner">
              <p className="text-slate-300">Entries</p>
              <p className="mt-1 text-lg font-semibold">{predictions.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 shadow-inner">
              <p className="text-slate-300">Top call</p>
              <p className="mt-1 truncate text-lg font-semibold">{consensus[0]?.result ?? "-"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Winning chance model</p>
              <h3 className="mt-1 text-base font-semibold text-slate-950 sm:text-lg">
                {topOutlook ? `${topOutlook.name} leads at ${formatProbability(topOutlook.winChance)}` : "No bracket data"}
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Fixed-seed simulations use everyone&apos;s bracket picks to infer team strength, then score each bracket against the official knockout slot path.
              </p>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 text-center text-xs sm:min-w-[300px]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                <p className="text-slate-500">Runs</p>
                <p className="mt-1 font-semibold text-slate-950">{compactNumber(bracketOutlook.simulationCount)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                <p className="text-slate-500">Valid</p>
                <p className="mt-1 font-semibold text-slate-950">
                  {bracketOutlook.validBracketCount}/{bracketOutlook.standings.length}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                <p className="text-slate-500">Champion</p>
                <p className="mt-1 truncate font-semibold text-slate-950">{bracketOutlook.topChampion?.team ?? "-"}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[640px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Person</th>
                  <th className="px-3 py-2 text-right font-semibold">Chance</th>
                  <th className="px-3 py-2 text-right font-semibold">Avg</th>
                  <th className="px-3 py-2 font-semibold">Champion</th>
                  <th className="px-3 py-2 text-right font-semibold">Bracket</th>
                </tr>
              </thead>
              <tbody>
                {shownOutlook.map((item) => (
                  <tr key={item.name} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-950">{item.name}</td>
                    <td className="px-3 py-2 text-right font-semibold text-teal-700">{formatProbability(item.winChance)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{compactNumber(item.averageScore)}</td>
                    <td className="px-3 py-2 text-slate-700">{item.champion}</td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-1 text-xs font-semibold",
                          item.validBracket ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                        )}
                      >
                        {item.validBracket ? "Valid" : `${item.issues.length} flags`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Bracket validation</p>
          <h3 className="mt-1 text-base font-semibold text-slate-950">FIFA path check</h3>
          <p className="mt-2 text-sm text-slate-500">
            Each later-round pick is checked against the official slot dependency, including semifinal losers feeding the third-place match.
          </p>
          <div className="mt-3 space-y-2">
            {bracketOutlook.standings.filter((item) => !item.validBracket).slice(0, 4).map((item) => (
              <div key={item.name} className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="text-sm font-semibold text-slate-950">{item.name}</p>
                <p className="mt-1 text-xs text-amber-800">{item.issues[0]}</p>
              </div>
            ))}
            {bracketOutlook.validBracketCount === bracketOutlook.standings.length ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm font-medium text-emerald-700">
                Every imported bracket follows the official slot path.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
        <div className="grid gap-px bg-slate-800 xl:grid-cols-[430px_minmax(0,1fr)]">
          <div className="bg-[linear-gradient(135deg,#0f172a_0%,#134e4a_58%,#1e293b_100%)] p-4 text-white sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-semibold uppercase text-teal-100">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Quarter-final scenario
                </p>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">Countries reached as of today</h3>
                <p className="mt-2 max-w-xl text-sm text-slate-300">
                  Select the eight Round of 16 winners. Locked rows come from the live FIFA result path, while open rows stay limited to legal teams from that feeder slot.
                </p>
              </div>
              <button
                type="button"
                onClick={resetQuarterFinalScenario}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2.5 text-xs font-semibold text-white transition hover:bg-white/15"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs min-[420px]:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-white/10 p-2">
                <p className="text-slate-300">Selected</p>
                <p className="mt-1 text-lg font-semibold">{selectedQuarterFinalTeams.length}/8</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-2">
                <p className="text-slate-300">Official</p>
                <p className="mt-1 text-lg font-semibold">{quarterFinalScenario.filter((slot) => slot.locked).length}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-2">
                <p className="text-slate-300">Projected #1</p>
                <p className="mt-1 truncate text-lg font-semibold">{quarterFinalProjectionLeader?.name ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-2">
                <p className="text-slate-300">Runs</p>
                <p className="mt-1 text-lg font-semibold">{compactNumber(bracketSimulationCount)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {quarterFinalPairs.map((pair) => (
                <div key={pair.matchNo} className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold uppercase text-teal-100">Quarter-final {pair.matchNo}</span>
                    <span className="text-slate-400">Official bracket path</span>
                  </div>
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    {pair.feeders.map((slot, feederIndex) => (
                      <div key={slot?.matchNo ?? feederIndex} className="min-w-0">
                        <p className="truncate text-[11px] text-slate-400">R16 {slot?.matchNo ?? "-"}</p>
                        <p className="truncate text-sm font-semibold text-white">{slot?.selectedTeam || "Pending"}</p>
                      </div>
                    ))}
                    <span className="row-start-1 col-start-2 rounded bg-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300">
                      vs
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-3 sm:p-4">
            <div className="grid gap-3 2xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                {quarterFinalScenario.map((slot) => (
                  <div
                    key={slot.matchNo}
                    className={cn(
                      "rounded-xl border p-3 shadow-sm transition",
                      slot.locked ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-slate-50",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold uppercase text-slate-500">
                          R16 match {slot.matchNo} to QF {slot.quarterFinalMatchNo ?? "-"}
                        </p>
                        <div className="mt-1">
                          <TeamPill team={slot.selectedTeam || null} />
                        </div>
                      </div>
                      <span
                        className={cn(
                          "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-semibold",
                          slot.locked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                        )}
                      >
                        {slot.locked ? <Lock className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                        {slot.locked ? "Official" : "Estimate"}
                      </span>
                    </div>
                    <select
                      value={slot.selectedTeam}
                      onChange={(event) =>
                        setQuarterFinalSelections((current) => ({
                          ...current,
                          [slot.matchNo]: event.target.value,
                        }))
                      }
                      disabled={slot.locked || slot.candidates.length === 0}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      aria-label={`Select country reaching the quarter-final from match ${slot.matchNo}`}
                    >
                      {slot.candidates.length === 0 ? <option value="">No teams available</option> : null}
                      {slot.candidates.map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 h-1.5 rounded-full bg-white">
                      <div
                        className={cn("h-1.5 rounded-full", slot.locked ? "bg-emerald-500" : "bg-amber-500")}
                        style={{
                          width: `${slot.locked ? 100 : Math.max(8, (slot.topCount / Math.max(slot.pickCount, 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {slot.locked ? "Authenticated by actual result" : `${slot.topCount}/${slot.pickCount} brackets backed this default`}
                    </p>
                  </div>
                ))}
              </div>

              <div className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 p-3 sm:p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">Estimated final ranking</p>
                      <h3 className="mt-1 text-base font-semibold text-slate-950 sm:text-lg">
                        {quarterFinalProjectionLeader
                          ? `${quarterFinalProjectionLeader.name} projects ${formatRankEstimate(quarterFinalProjectionLeader.projectedRank)}`
                          : "No projection available"}
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm text-slate-500">
                        Final points are scored against locked results, selected quarter-final teams, and simulated remaining fixtures.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs lg:min-w-[300px]">
                      <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
                        <p className="text-slate-500">Users</p>
                        <p className="mt-1 font-semibold text-slate-950">{quarterFinalProjection.length}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
                        <p className="text-slate-500">Valid</p>
                        <p className="mt-1 font-semibold text-slate-950">
                          {quarterFinalProjection.filter((item) => item.validBracket).length}/{quarterFinalProjection.length}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">
                        <p className="text-slate-500">Leader pts</p>
                        <p className="mt-1 font-semibold text-slate-950">{compactNumber(quarterFinalProjectionLeader?.projectedScore)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="max-h-[620px] overflow-auto">
                  <table className="min-w-[780px] w-full text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-white text-xs uppercase text-slate-500 shadow-[0_1px_0_rgba(226,232,240,1)]">
                      <tr>
                        <th className="w-[96px] px-3 py-2 font-semibold">Projection</th>
                        <th className="px-3 py-2 font-semibold">Person</th>
                        <th className="px-3 py-2 text-right font-semibold">Final pts</th>
                        <th className="px-3 py-2 text-right font-semibold">Current</th>
                        <th className="px-3 py-2 text-right font-semibold">Range</th>
                        <th className="px-3 py-2 text-right font-semibold">Title</th>
                        <th className="px-3 py-2 text-right font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quarterFinalProjection.map((item, index) => {
                        const player = playerByName.get(item.name);
                        const movement = item.currentRank == null ? null : item.currentRank - Math.round(item.projectedRank);

                        return (
                          <tr
                            key={item.name}
                            onClick={() => player && onSelectPlayer(player.participantId)}
                            className={cn(
                              "cursor-pointer border-t border-slate-100 transition hover:bg-teal-50/50",
                              index < 3 && "bg-amber-50/40",
                            )}
                          >
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                                  index === 0 ? "bg-amber-500 text-white" : index < 3 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600",
                                )}>
                                  {index + 1}
                                </span>
                                <MovementChip delta={movement} />
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                                  {initials(item.name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-slate-950">{item.name}</p>
                                  <p className="truncate text-[11px] text-slate-500">Current {item.currentRank ? `#${item.currentRank}` : "-"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-teal-700">{compactNumber(item.projectedScore)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{compactNumber(item.currentScore)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">
                              {item.bestRank && item.worstRank ? `#${item.bestRank}-#${item.worstRank}` : "-"}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatProbability(item.titleChance)}</td>
                            <td className="px-3 py-2 text-right">
                              <span
                                className={cn(
                                  "inline-flex rounded-md px-2 py-1 text-xs font-semibold",
                                  item.validBracket ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                                )}
                              >
                                {item.validBracket ? "Valid" : "Flagged"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Knockout calendar</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{formatMatchDate(selectedDate)}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] md:flex md:items-center">
            <button
              type="button"
              onClick={() => selectDate(dates[Math.max(0, selectedDateIndex - 1)] ?? selectedDate)}
              disabled={selectedDateIndex <= 0}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 md:h-10 md:w-auto"
            >
              Previous
            </button>
            <input
              type="date"
              value={selectedDate}
              min={minWorldCupDate}
              max={maxWorldCupDate}
              onChange={(event) => selectDate(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 md:h-10 md:w-auto"
              aria-label="Select World Cup 2026 knockout date"
            />
            <button
              type="button"
              onClick={() => selectDate(dates[Math.min(dates.length - 1, selectedDateIndex + 1)] ?? selectedDate)}
              disabled={selectedDateIndex >= dates.length - 1}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 md:h-10 md:w-auto"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-950">Bracket slots</h3>
            <span className="text-xs text-slate-500">{formatMatchDate(selectedDate)}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-1">
            {dayMatches.map((match) => (
              <button
                type="button"
                key={match.matchNo}
                onClick={() => {
                  setSelectedMatchNo(match.matchNo);
                  setPredictionFilter("all");
                  setPredictionQuery("");
                }}
                className={cn(
                  "rounded-lg border p-3 text-left transition",
                  selectedMatch?.matchNo === match.matchNo
                    ? "border-teal-500 bg-teal-50 shadow-sm ring-2 ring-teal-100"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm",
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>Match {match.matchNo}</span>
                  <span>{match.time}</span>
                </div>
                <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm font-semibold text-slate-950">
                  <span className="truncate">{match.team1}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">vs</span>
                  <span className="truncate text-right">{match.team2}</span>
                </div>
                <p className="mt-2 truncate text-xs text-slate-500">{match.venue}</p>
              </button>
            ))}
          </div>
        </div>

        {selectedMatch ? (
          <div className="space-y-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-slate-500">Selected bracket slot</p>
                    <h3 className="mt-1 break-words text-lg font-semibold text-slate-950 sm:text-xl">
                      {selectedMatch.team1} <span className="text-slate-400">vs</span> {selectedMatch.team2}
                    </h3>
                    <p className="mt-1 break-words text-sm text-slate-500">
                      Match {selectedMatch.matchNo} &middot; {selectedMatch.time} &middot; {selectedMatch.venue}
                    </p>
                  </div>
                  <div className="w-fit rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-950">{filteredPredictions.length}</span>
                    <span className="text-slate-500"> shown</span>
                  </div>
                </div>

                {predictions.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                    Predictions are not available for this fixture slot yet.
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3 sm:gap-3">
                      {consensus.slice(0, 3).map((item, index) => (
                        <div key={item.result} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-slate-950">{item.result}</span>
                            <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">#{index + 1}</span>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-white">
                            <div
                              className="h-2 rounded-full bg-teal-600"
                              style={{ width: `${Math.max(8, (item.count / Math.max(predictions.length, 1)) * 100)}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{item.count} of {predictions.length} picks</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase text-slate-500">Scoreline clusters</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                        {scorelineGroups.map((item) => (
                          <div key={item.label} className="rounded-md border border-slate-200 bg-white p-2 shadow-sm">
                            <p className="truncate text-xs font-semibold text-slate-800">{item.label}</p>
                            <p className="mt-1 text-[11px] text-slate-500">{item.count} people</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Quick filters</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {resultFilters.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => setPredictionFilter(option.value)}
                      className={cn(
                        "min-h-11 rounded-md border px-3 py-2 text-left text-sm font-medium transition",
                        predictionFilter === option.value
                          ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <label className="relative mt-3 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={predictionQuery}
                    onChange={(event) => setPredictionQuery(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 sm:h-10"
                    placeholder="Search name, team, score"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950">People&apos;s predictions</h3>
                <p className="text-xs text-slate-500">{filteredPredictions.length} entries</p>
              </div>
              {filteredPredictions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                  No predictions match the current filters.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {filteredPredictions.map((prediction) => {
                    const player = playerByName.get(prediction.name);
                    const result = getPredictionResult(prediction);

                    return (
                      <button
                        type="button"
                        key={`${selectedMatch.matchNo}-${prediction.name}`}
                        onClick={() => player && onSelectPlayer(player.participantId)}
                        className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-teal-50/40 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{prediction.name}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{result}</p>
                          </div>
                          <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white">{scoreline(prediction)}</span>
                        </div>
                        <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-xs text-slate-600">
                          <span className="truncate">{prediction.team1}</span>
                          <span className="text-slate-400">vs</span>
                          <span className="truncate text-right">{prediction.team2}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PodiumCard({ entry, rankMeta }: { entry: LeaderboardEntry; rankMeta?: RankMeta }) {
  const isChampion = entry.rank === 1;
  const medalClass =
    entry.rank === 1
      ? "bg-amber-100 text-amber-700"
      : entry.rank === 2
        ? "bg-slate-100 text-slate-600"
        : "bg-orange-100 text-orange-700";

  return (
    <motion.button
      type="button"
      layout
      whileHover={{ y: -4 }}
      className={cn(
        "relative min-h-40 overflow-hidden rounded-xl border bg-white p-3 text-left shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_42px_rgba(15,23,42,0.1)] sm:min-h-44 sm:p-4",
        isChampion ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200 hover:border-slate-300",
      )}
    >
      <div className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(90deg,rgba(15,118,110,.08)_1px,transparent_1px),linear-gradient(0deg,rgba(15,118,110,.08)_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", medalClass)}>
            {isChampion ? <Crown className="h-6 w-6" /> : <Medal className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
              Rank {entry.rank}
              <RankMarker meta={rankMeta} />
            </p>
            <h2 className="mt-1 break-words text-base font-semibold text-slate-950 sm:text-lg">{entry.name}</h2>
          </div>
        </div>
        <MovementChip delta={entry.rankDelta} />
      </div>
      <div className="relative mt-4 grid grid-cols-1 gap-2 text-xs min-[420px]:grid-cols-3 sm:mt-5 sm:text-sm">
        <div className="rounded-md bg-slate-50 p-2">
          <p className="text-xs text-slate-500">Score</p>
          <p className="mt-1 font-semibold text-slate-950">{compactNumber(entry.score)}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-2">
          <p className="text-xs text-slate-500">Prize</p>
          <p className="mt-1 font-semibold text-slate-950">{formatCurrency(entry.prize)}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-2">
          <p className="text-xs text-slate-500">Winner</p>
          <p className="mt-1 break-words font-semibold text-slate-950">{entry.selectedWinner ?? "-"}</p>
        </div>
      </div>
    </motion.button>
  );
}

function Podium({ leaders, rankMetaByParticipant }: { leaders: LeaderboardEntry[]; rankMetaByParticipant: Map<string, RankMeta> }) {
  const [first, second, third] = leaders.slice(0, 3);
  const ordered = [second, first, third].filter(Boolean);

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      {ordered.map((entry) => (
        <PodiumCard key={entry.participantId} entry={entry} rankMeta={rankMetaByParticipant.get(entry.participantId)} />
      ))}
    </section>
  );
}

function Movers({ title, entries, positive }: { title: string; entries: LeaderboardEntry[]; positive?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
        <span className={cn("h-2 w-2 rounded-full", positive ? "bg-emerald-500" : "bg-rose-500")} />
        {title}
      </h3>
      <div className="mt-3 space-y-2">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">No movement yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.participantId} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-slate-700">{entry.name}</span>
              <MovementChip delta={entry.rankDelta} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PlayerCard({
  entry,
  rankMeta,
  selected,
  finishProbabilities,
  onClick,
}: {
  entry: LeaderboardEntry;
  rankMeta?: RankMeta;
  selected: boolean;
  finishProbabilities: number[] | null;
  onClick: () => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <motion.article
      layout
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "cursor-pointer rounded-xl border bg-white p-3 text-left shadow-[0_8px_30px_rgba(15,23,42,0.05)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_14px_42px_rgba(15,23,42,0.09)] focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 sm:p-4",
        selected ? "border-teal-500 ring-2 ring-teal-100" : "border-slate-200 hover:border-slate-300",
        (entry.prize ?? 0) > 0 && "bg-amber-50/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {initials(entry.name)}
          </div>
          <div className="min-w-0">
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 break-words font-semibold text-slate-950">
              <RankText entry={entry} meta={rankMeta} />
              <span>{entry.name}</span>
            </p>
            <div className="mt-1">
              <TeamPill team={entry.selectedWinner} />
            </div>
          </div>
        </div>
        <MovementChip delta={entry.rankDelta} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs min-[420px]:grid-cols-3 sm:mt-4 sm:text-sm">
        <div>
          <p className="text-xs text-slate-500">Score</p>
          <p className="font-semibold text-slate-950">{entry.score}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Prize</p>
          <p className="font-semibold text-slate-950">{formatCurrency(entry.prize)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Win chance</p>
          <p className="font-semibold text-slate-950">{formatProbability(finishProbabilities?.[0])}</p>
        </div>
      </div>
      <FinishProbabilityTrail probabilities={finishProbabilities} className="mt-3 border-t border-slate-200/70 pt-2" />
    </motion.article>
  );
}

function DetailPanel({ entry, rankMeta, onClose }: { entry: LeaderboardEntry | null; rankMeta?: RankMeta; onClose: () => void }) {
  return (
    <AnimatePresence>
      {entry ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)] sm:p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Selected player</p>
              <h3 className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 break-words text-base font-semibold text-slate-950 sm:text-lg">
                <RankText entry={entry} meta={rankMeta} />
                <span>{entry.name}</span>
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Close selected player"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-2 sm:gap-3">
            <div className="min-w-0 rounded-md bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Score</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">{compactNumber(entry.score)}</p>
            </div>
            <div className="min-w-0 rounded-md bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Movement</p>
              <div className="mt-1"><MovementChip delta={entry.rankDelta} /></div>
            </div>
            <div className="min-w-0 rounded-md bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Prize</p>
              <p className="mt-1 font-semibold text-slate-950">{formatCurrency(entry.prize)}</p>
            </div>
            <div className="min-w-0 rounded-md bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Winner pick</p>
              <div className="mt-1"><TeamPill team={entry.selectedWinner} /></div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function LeaderboardDashboard({ initialData }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("rank");
  const [view, setView] = useState<ViewMode>("table");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialData.leaderboard[0]?.participantId ?? null);
  const [activeTab, setActiveTab] = useState<AppTab>("leaderboard");

  const stats = initialData.stats;
  const maxScore = initialData.leaderboard[0]?.score ?? 1;
  const currentMatchdayData = initialData.matchdayData ?? fallbackMatchdays;
  const dashboardAsOfDate = (initialData.health.checkedAt || initialData.lastSyncedAt || "2026-07-06T00:00:00.000Z").slice(0, 10);
  const syncedLabel = formatSyncedAt(initialData.lastSyncedAt);
  const bracketOutlook = useMemo(
    () => buildBracketOutlook(initialData.leaderboard, currentMatchdayData),
    [currentMatchdayData, initialData.leaderboard],
  );
  const finishProbabilitiesByName = useMemo(
    () => new Map(bracketOutlook.standings.map((entry) => [entry.name, entry.finishChances])),
    [bracketOutlook],
  );
  const rankMetaByParticipant = useMemo(() => buildRankMeta(initialData.leaderboard), [initialData.leaderboard]);

  const selectedEntry = useMemo(
    () => initialData.leaderboard.find((entry) => entry.participantId === selectedId) ?? null,
    [initialData.leaderboard, selectedId],
  );

  const filteredLeaderboard = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const rows = initialData.leaderboard.filter((entry) => {
      const matchesQuery =
        !normalizedQuery ||
        entry.name.toLowerCase().includes(normalizedQuery) ||
        entry.selectedWinner?.toLowerCase().includes(normalizedQuery) ||
        entry.supportingTeam?.toLowerCase().includes(normalizedQuery);

      const matchesTeam = !teamFilter || entry.selectedWinner === teamFilter;
      const matchesFilter =
        filter === "all" ||
        (filter === "top10" && entry.rank <= 10) ||
        (filter === "prize" && (entry.prize ?? 0) > 0) ||
        (filter === "chasers" && entry.rank > 5 && entry.rank <= 20) ||
        (filter === "last" && entry.rank > Math.max(initialData.leaderboard.length - 10, 0));

      return matchesQuery && matchesTeam && matchesFilter;
    });

    return rows.sort((a, b) => {
      if (sort === "score") return b.score - a.score || a.rank - b.rank;
      if (sort === "prize") return (b.prize ?? 0) - (a.prize ?? 0) || a.rank - b.rank;
      if (sort === "move") return (b.rankDelta ?? -999) - (a.rankDelta ?? -999) || a.rank - b.rank;
      if (sort === "winner") return (a.selectedWinner ?? "").localeCompare(b.selectedWinner ?? "") || a.rank - b.rank;
      return a.rank - b.rank;
    });
  }, [filter, initialData.leaderboard, query, sort, teamFilter]);

  const scoreBars = useMemo(
    () =>
      initialData.leaderboard.slice(0, 10).map((entry) => ({
        name: entry.name.split(" ")[0],
        score: entry.score,
        fill: entry.rank <= 5 ? "#b45309" : "#0f766e",
      })),
    [initialData.leaderboard],
  );

  function resetFilters() {
    setQuery("");
    setFilter("all");
    setSort("rank");
    setTeamFilter(null);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.10),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_46%,#f8fafc_100%)] text-slate-950">
      <header className="border-b border-white/70 bg-white/85 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-2 px-3 py-2.5 sm:px-5 lg:px-7 xl:px-8">
          <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
                <Trophy className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase text-teal-700">World Cup 2026 predictor</p>
                <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">Live leaderboard</h1>
              </div>
            </div>
            <p className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs md:text-center">
              Developed by Anish Baniya - IT Department
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs md:justify-end">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium",
                  initialData.health.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700",
                )}
              >
                {initialData.health.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                {initialData.health.ok ? "Sheet connected" : "Sheet unavailable"}
              </span>
              <span className="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600">
                Last synced: {syncedLabel}
              </span>
            </div>
          </div>
          {!initialData.health.ok ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {initialData.health.message}
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4 lg:px-7 xl:px-8">
        <section className="grid gap-2 sm:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_auto]">
          <StatCard label="Participants" value={compactNumber(stats.participantCount)} icon={Users} sub="Confirmed entries" accent="teal" />
          <StatCard label="Prize pool" value={formatCurrency(stats.prizePool)} icon={CircleDollarSign} sub="Rs. 1,000 per participant" accent="amber" />
          <StatCard label="Prize winners" value={compactNumber(stats.activePrizeWinners)} icon={WalletCards} sub="Top 5 plus last place" accent="rose" />

          <nav className="sticky top-2 z-20 rounded-xl border border-white/70 bg-white/90 p-1 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70 backdrop-blur-xl sm:col-span-3 xl:col-span-1 xl:self-stretch" aria-label="Dashboard sections">
            <div className="grid h-full grid-cols-2 gap-1 xl:w-72">
            <button
              type="button"
              onClick={() => setActiveTab("leaderboard")}
              className={cn(
                "flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition sm:text-sm",
                activeTab === "leaderboard" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <Trophy className="h-4 w-4 shrink-0" />
              <span className="truncate">Leaderboard</span>
              <span className={cn(
                "hidden rounded px-1.5 py-0.5 text-[11px] sm:inline",
                activeTab === "leaderboard" ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500",
              )}>
                {initialData.leaderboard.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("predictions")}
              className={cn(
                "flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition sm:text-sm",
                activeTab === "predictions" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <Target className="h-4 w-4 shrink-0" />
              <span className="truncate">Predictions</span>
              <span className={cn(
                "hidden rounded px-1.5 py-0.5 text-[11px] sm:inline",
                activeTab === "predictions" ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500",
              )}>
                {currentMatchdayData.matches.length}
              </span>
            </button>
            </div>
          </nav>
        </section>

        {activeTab === "predictions" ? (
          <PredictionCenter
            leaderboard={initialData.leaderboard}
            matchdayData={currentMatchdayData}
            bracketOutlook={bracketOutlook}
            asOfDate={dashboardAsOfDate}
            onSelectPlayer={(participantId) => {
              setSelectedId(participantId);
              setActiveTab("leaderboard");
            }}
          />
        ) : (
          <>
          <Podium leaders={initialData.leaderboard} rankMetaByParticipant={rankMetaByParticipant} />

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-white/70 bg-white/90 p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)] ring-1 ring-slate-200/70 backdrop-blur sm:p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Standings control room</h2>
                  <p className="text-sm text-slate-500">
                    Showing {filteredLeaderboard.length} of {initialData.leaderboard.length}
                    {teamFilter ? ` for ${teamFilter}` : ""}
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <label className="relative min-w-0">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 sm:h-10 sm:w-64"
                      placeholder="Search player or team"
                    />
                  </label>
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortMode)}
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 sm:h-10 sm:w-auto"
                    aria-label="Sort leaderboard"
                  >
                    <option value="rank">Sort by rank</option>
                    <option value="score">Sort by score</option>
                    <option value="prize">Sort by prize</option>
                    <option value="move">Sort by movement</option>
                    <option value="winner">Sort by winner</option>
                  </select>
                  <div className="flex w-full rounded-md border border-slate-200 bg-slate-50 p-1 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setView("table")}
                      className={cn("flex h-10 flex-1 items-center justify-center rounded text-slate-500 sm:h-8 sm:w-9 sm:flex-none", view === "table" && "bg-white text-slate-950 shadow-sm")}
                      aria-label="Table view"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("cards")}
                      className={cn("flex h-10 flex-1 items-center justify-center rounded text-slate-500 sm:h-8 sm:w-9 sm:flex-none", view === "cards" && "bg-white text-slate-950 shadow-sm")}
                      aria-label="Card view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:h-10 sm:w-auto"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 min-[520px]:flex min-[520px]:flex-wrap">
                {[
                  ["all", "All"],
                  ["top10", "Top 10"],
                  ["prize", "Prize"],
                  ["chasers", "Chasers"],
                  ["last", "Bottom 10"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value as FilterMode)}
                    className={cn(
                      "h-10 min-w-0 rounded-lg border px-3 text-sm font-medium transition",
                      filter === value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {view === "table" ? (
              <>
              <div className="hidden overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)] ring-1 ring-white lg:block">
                <div className="border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-teal-200">Leaderboard grid</p>
                      <h3 className="text-base font-semibold">All columns visible</h3>
                    </div>
                    <p className="text-right text-xs text-slate-300">{filteredLeaderboard.length} players</p>
                  </div>
                </div>
                <div>
                  <table className="w-full table-fixed border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                        <th className="w-[52px] py-3 pl-4 pr-2 font-semibold">S.N</th>
                        <th className="w-[64px] px-2 py-3 font-semibold">Rank</th>
                        <th className="w-[25%] px-2 py-3 font-semibold">Player</th>
                        <th className="w-[70px] px-2 py-3 text-right font-semibold">Move</th>
                        <th className="w-[72px] px-2 py-3 text-right font-semibold">Score</th>
                        <th className="w-[18%] px-2 py-3 font-semibold">Score pace</th>
                        <th className="w-[120px] px-2 py-3 text-right font-semibold">Prize</th>
                        <th className="w-[190px] px-2 py-3 text-right font-semibold">
                          Winning probability
                          <span className="block text-[9px] font-medium normal-case tracking-normal text-slate-400">1st–5th finish</span>
                        </th>
                        <th className="w-[150px] py-3 pl-2 pr-4 font-semibold">Winner</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence initial={false}>
                        {filteredLeaderboard.map((entry, index) => (
                          <motion.tr
                            layout
                            key={entry.participantId}
                            onClick={() => setSelectedId(entry.participantId)}
                            className={cn(
                              "cursor-pointer border-b border-slate-100 transition hover:bg-slate-50",
                              selectedId === entry.participantId && "bg-teal-50/70",
                              (entry.prize ?? 0) > 0 && selectedId !== entry.participantId && "bg-amber-50/50",
                            )}
                          >
                            <td className="py-3 pl-4 pr-2 font-medium text-slate-500">{index + 1}</td>
                            <td className="px-2 py-3 font-semibold text-slate-950">
                              <RankText entry={entry} meta={rankMetaByParticipant.get(entry.participantId)} />
                            </td>
                            <td className="px-2 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                                  {initials(entry.name)}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-slate-950">{entry.name}</div>
                                  <div className="truncate text-[11px] text-slate-500">{entry.exactPredictions} exact / {entry.correctTeams} teams</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-3 text-right"><MovementChip delta={entry.rankDelta} /></td>
                            <td className="px-2 py-3 text-right font-semibold">{compactNumber(entry.score)}</td>
                            <td className="px-2 py-3">
                              <div className="h-2 w-full rounded-full bg-slate-100">
                                <div
                                  className="h-2 rounded-full bg-teal-600"
                                  style={{ width: `${Math.max(8, Math.min(100, (entry.score / maxScore) * 100))}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-2 py-3 text-right font-semibold">{formatCurrency(entry.prize)}</td>
                            <td className="px-2 py-3 text-right">
                              <p className="font-semibold text-teal-700">
                                {formatProbability(finishProbabilitiesByName.get(entry.name)?.[0])}
                              </p>
                              <FinishProbabilityTrail probabilities={finishProbabilitiesByName.get(entry.name)} compact />
                            </td>
                            <td className="py-3 pl-2 pr-4"><TeamPill team={entry.selectedWinner} active={teamFilter === entry.selectedWinner} onClick={() => setTeamFilter(entry.selectedWinner)} /></td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="grid gap-2 lg:hidden">
                <AnimatePresence initial={false}>
                  {filteredLeaderboard.map((entry) => (
                    <PlayerCard
                      key={entry.participantId}
                      entry={entry}
                      rankMeta={rankMetaByParticipant.get(entry.participantId)}
                      selected={selectedId === entry.participantId}
                      finishProbabilities={finishProbabilitiesByName.get(entry.name) ?? null}
                      onClick={() => setSelectedId(entry.participantId)}
                    />
                  ))}
                </AnimatePresence>
              </div>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <AnimatePresence initial={false}>
                  {filteredLeaderboard.map((entry) => (
                    <PlayerCard
                      key={entry.participantId}
                      entry={entry}
                      rankMeta={rankMetaByParticipant.get(entry.participantId)}
                      selected={selectedId === entry.participantId}
                      finishProbabilities={finishProbabilitiesByName.get(entry.name) ?? null}
                      onClick={() => setSelectedId(entry.participantId)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <DetailPanel
              entry={selectedEntry}
              rankMeta={selectedEntry ? rankMetaByParticipant.get(selectedEntry.participantId) : undefined}
              onClose={() => setSelectedId(null)}
            />

            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <Target className="h-4 w-4 text-teal-700" />
                  Winner pick map
                </h3>
                {teamFilter ? (
                  <button type="button" onClick={() => setTeamFilter(null)} className="text-xs font-medium text-slate-500 hover:text-slate-950">
                    Clear
                  </button>
                ) : null}
              </div>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip formatter={(value, name) => [`${value} picks`, name]} />
                    <Pie
                      data={stats.selectedWinnerDistribution}
                      dataKey="count"
                      nameKey="team"
                      innerRadius={48}
                      outerRadius={82}
                      paddingAngle={2}
                      onClick={(data) => {
                        const clicked = data as unknown as { payload?: { team?: string }; team?: string };
                        setTeamFilter(clicked.payload?.team ?? clicked.team ?? null);
                      }}
                    >
                      {stats.selectedWinnerDistribution.map((entry) => (
                        <Cell
                          key={entry.team}
                          fill={teamColor(entry.team)}
                          stroke={teamFilter === entry.team ? "#020617" : "#ffffff"}
                          strokeWidth={teamFilter === entry.team ? 3 : 1}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {stats.selectedWinnerDistribution.map((entry) => (
                  <TeamPill
                    key={entry.team}
                    team={`${entry.team} ${entry.count}`}
                    active={teamFilter === entry.team}
                    onClick={() => setTeamFilter(teamFilter === entry.team ? null : entry.team)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <ArrowDownUp className="h-4 w-4 text-amber-700" />
                Top score spread
              </h3>
              <div className="mt-4 h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scoreBars} margin={{ left: -18, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-28} textAnchor="end" height={58} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {scoreBars.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <Movers title="Top risers" entries={stats.topRisers} positive />
            <Movers title="Top fallers" entries={stats.topFallers} />
          </aside>
          </section>
          </>
        )}
      </main>
    </div>
  );
}
