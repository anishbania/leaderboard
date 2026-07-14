import type { ActualMatchResult, MatchdayData } from "@/lib/types";

export type ReachedBracketStageKey =
  | "round-of-16"
  | "quarter-finals"
  | "semi-finals"
  | "final"
  | "champion";

export type ReachedBracketStage = {
  key: ReachedBracketStageKey;
  badgeLabel: string;
  destinationLabel: string;
  feederLabel: string;
  nextDestinationLabel: string | null;
  feederMatchNos: number[];
  targetMatchNos: number[];
  expectedCountryCount: number;
  /** ISO date (UTC) when the feeder round finishes and destination countries are known. */
  unlockDate: string;
};

export const reachedBracketStages: ReachedBracketStage[] = [
  {
    key: "champion",
    badgeLabel: "Tournament winner",
    destinationLabel: "Champion",
    feederLabel: "Final",
    nextDestinationLabel: null,
    feederMatchNos: [104],
    targetMatchNos: [],
    expectedCountryCount: 1,
    unlockDate: "2026-07-20",
  },
  {
    key: "final",
    badgeLabel: "Final bracket",
    destinationLabel: "Final",
    feederLabel: "SF",
    nextDestinationLabel: "Champion",
    feederMatchNos: [101, 102],
    targetMatchNos: [104],
    expectedCountryCount: 2,
    unlockDate: "2026-07-16",
  },
  {
    key: "semi-finals",
    badgeLabel: "Semi-final bracket",
    destinationLabel: "Semi-final",
    feederLabel: "QF",
    nextDestinationLabel: "Final",
    feederMatchNos: [97, 98, 99, 100],
    targetMatchNos: [101, 102],
    expectedCountryCount: 4,
    unlockDate: "2026-07-12",
  },
  {
    key: "quarter-finals",
    badgeLabel: "Quarter-final bracket",
    destinationLabel: "Quarter-final",
    feederLabel: "R16",
    nextDestinationLabel: "Semi-final",
    feederMatchNos: [89, 90, 91, 92, 93, 94, 95, 96],
    targetMatchNos: [97, 98, 99, 100],
    expectedCountryCount: 8,
    unlockDate: "2026-07-08",
  },
  {
    key: "round-of-16",
    badgeLabel: "Round of 16 bracket",
    destinationLabel: "Round of 16",
    feederLabel: "R32",
    nextDestinationLabel: "Quarter-final",
    feederMatchNos: Array.from({ length: 16 }, (_, index) => 73 + index),
    targetMatchNos: Array.from({ length: 8 }, (_, index) => 89 + index),
    expectedCountryCount: 16,
    unlockDate: "2026-07-04",
  },
];

function stageFromResults(actualResults?: Record<string, ActualMatchResult>) {
  if (!actualResults) return null;

  return (
    reachedBracketStages.find((stage) =>
      stage.feederMatchNos.some((matchNo) => Boolean(actualResults[String(matchNo)])),
    ) ?? null
  );
}

function stageFromDate(asOfDate?: string) {
  if (!asOfDate) return null;

  return (
    reachedBracketStages.find((stage) => asOfDate >= stage.unlockDate) ?? null
  );
}

/**
 * Prefer official feeder results; otherwise infer from the tournament calendar
 * so the "countries reached" panel advances with the real World Cup schedule.
 */
export function getCurrentReachedBracketStage(
  actualResults?: Record<string, ActualMatchResult>,
  asOfDate?: string,
) {
  return stageFromResults(actualResults) ?? stageFromDate(asOfDate) ?? reachedBracketStages.at(-1)!;
}

export function getReachedBracketStageByKey(key: ReachedBracketStageKey) {
  return reachedBracketStages.find((stage) => stage.key === key) ?? reachedBracketStages.at(-1)!;
}

/** Stages the user can project from the live stage onward (e.g. SF → Final). */
export function getProjectableStages(liveStage: ReachedBracketStage) {
  const liveIndex = reachedBracketStages.findIndex((stage) => stage.key === liveStage.key);
  if (liveIndex < 0) return [liveStage];
  // Array is ordered champion → … → R16; keep from champion down through live stage.
  return reachedBracketStages.slice(0, liveIndex + 1).reverse();
}

export function resolveDashboardAsOfDate(matchdayData?: MatchdayData, fallbackIso?: string | null) {
  const fromPayload = (fallbackIso ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromPayload)) return fromPayload;

  const today = new Date().toISOString().slice(0, 10);
  if (!matchdayData?.matches.length) return today;

  const knockoutDates = matchdayData.matches
    .filter((match) => match.matchNo >= 73)
    .map((match) => match.date)
    .filter(Boolean)
    .sort();

  if (!knockoutDates.length) return today;

  // Clamp "today" into the tournament window so offline demos still land on a sensible stage.
  if (today < knockoutDates[0]) return knockoutDates[0];
  if (today > knockoutDates.at(-1)!) return knockoutDates.at(-1)!;
  return today;
}

export function formatStageAsOfLabel(asOfDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${asOfDate}T00:00:00Z`));
}
