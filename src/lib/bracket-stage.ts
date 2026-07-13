import type { ActualMatchResult } from "@/lib/types";

export type ReachedBracketStage = {
  key: "round-of-16" | "quarter-finals" | "semi-finals" | "final" | "champion";
  badgeLabel: string;
  destinationLabel: string;
  feederLabel: string;
  feederMatchNos: number[];
  targetMatchNos: number[];
  expectedCountryCount: number;
};

const reachedBracketStages: ReachedBracketStage[] = [
  {
    key: "champion",
    badgeLabel: "Tournament winner",
    destinationLabel: "Champion",
    feederLabel: "Final",
    feederMatchNos: [104],
    targetMatchNos: [],
    expectedCountryCount: 1,
  },
  {
    key: "final",
    badgeLabel: "Final bracket",
    destinationLabel: "Final",
    feederLabel: "SF",
    feederMatchNos: [101, 102],
    targetMatchNos: [104],
    expectedCountryCount: 2,
  },
  {
    key: "semi-finals",
    badgeLabel: "Semi-final bracket",
    destinationLabel: "Semi-final",
    feederLabel: "QF",
    feederMatchNos: [97, 98, 99, 100],
    targetMatchNos: [101, 102],
    expectedCountryCount: 4,
  },
  {
    key: "quarter-finals",
    badgeLabel: "Quarter-final bracket",
    destinationLabel: "Quarter-final",
    feederLabel: "R16",
    feederMatchNos: [89, 90, 91, 92, 93, 94, 95, 96],
    targetMatchNos: [97, 98, 99, 100],
    expectedCountryCount: 8,
  },
  {
    key: "round-of-16",
    badgeLabel: "Round of 16 bracket",
    destinationLabel: "Round of 16",
    feederLabel: "R32",
    feederMatchNos: Array.from({ length: 16 }, (_, index) => 73 + index),
    targetMatchNos: Array.from({ length: 8 }, (_, index) => 89 + index),
    expectedCountryCount: 16,
  },
];

export function getCurrentReachedBracketStage(actualResults?: Record<string, ActualMatchResult>) {
  if (!actualResults) return reachedBracketStages.at(-1)!;

  return (
    reachedBracketStages.find((stage) =>
      stage.feederMatchNos.some((matchNo) => Boolean(actualResults[String(matchNo)])),
    ) ?? reachedBracketStages.at(-1)!
  );
}
