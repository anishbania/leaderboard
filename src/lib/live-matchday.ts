import { parseCsvRows, parseNumber } from "./csv";
import { matchdayData as fallbackMatchdayData } from "./matchday-data";
import type { ActualMatchResult, MatchPrediction, MatchdayData, MatchdayMatch } from "./types";

const fallbackData = fallbackMatchdayData as MatchdayData;
const round32SlotsByLiveRow = [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87];
const predictionBracketRows = [
  ...round32SlotsByLiveRow.map((matchNo, index) => ({ rowIndex: 74 + index, matchNo })),
  ...Array.from({ length: 16 }, (_, index) => ({ rowIndex: 90 + index, matchNo: 89 + index })),
];
const countBracketRows = [
  ...round32SlotsByLiveRow.map((matchNo, index) => ({ rowIndex: 86 + index, matchNo })),
  ...Array.from({ length: 16 }, (_, index) => ({ rowIndex: 102 + index, matchNo: 89 + index })),
];

function clean(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return ["", "#N/A", "#VALUE!", "#REF!", "#DIV/0!", "N/A"].includes(trimmed) ? "" : trimmed;
}

function makeResult(team1: string, team2: string, goals1: number | null, goals2: number | null): ActualMatchResult | null {
  if (!team1 || !team2 || goals1 == null || goals2 == null || goals1 === goals2) return null;
  return {
    team1,
    team2,
    goals1,
    goals2,
    winner: goals1 > goals2 ? team1 : team2,
  };
}

function fallbackParticipantNames() {
  const firstSlot = Object.keys(fallbackData.predictionsByMatch).sort((a, b) => Number(a) - Number(b))[0];
  return (fallbackData.predictionsByMatch[firstSlot] ?? []).map((prediction) => prediction.name);
}

function parseLiveActualResults(countCsv: string) {
  const rows = parseCsvRows(countCsv);
  const actualResults: Record<string, ActualMatchResult> = {};
  const matchesByNo = new Map<number, MatchdayMatch>(
    fallbackData.matches.map((match) => [match.matchNo, { ...match }]),
  );

  for (const { rowIndex, matchNo } of countBracketRows) {
    const row = rows[rowIndex] ?? [];
    const team1 = clean(row[1]);
    const team2 = clean(row[3]);
    const goals1 = parseNumber(clean(row[4]));
    const goals2 = parseNumber(clean(row[5]));

    if (team1 && team2) {
      const existing = matchesByNo.get(matchNo);
      if (existing) {
        matchesByNo.set(matchNo, { ...existing, team1, team2 });
      }
    }

    const result = makeResult(team1, team2, goals1, goals2);
    if (result) {
      actualResults[String(matchNo)] = result;
    }
  }

  return {
    matches: Array.from(matchesByNo.values()).sort((a, b) => a.matchNo - b.matchNo),
    actualResults,
  };
}

function parseLivePredictions(predictionCsv: string): Record<string, MatchPrediction[]> {
  const rows = parseCsvRows(predictionCsv);
  const names = fallbackParticipantNames();
  const predictionsByMatch: Record<string, MatchPrediction[]> = {};

  for (const { rowIndex, matchNo } of predictionBracketRows) {
    const row = rows[rowIndex] ?? [];
    const predictions: MatchPrediction[] = [];

    names.forEach((name, index) => {
      const start = 9 + index * 11;
      const team1 = clean(row[start + 1]);
      const team2 = clean(row[start + 3]);
      if (!team1 || !team2) return;

      predictions.push({
        name,
        team1,
        team2,
        goals1: parseNumber(clean(row[start + 4])),
        goals2: parseNumber(clean(row[start + 5])),
      });
    });

    predictionsByMatch[String(matchNo)] = predictions;
  }

  return predictionsByMatch;
}

export function parseLiveMatchdayCsv(countCsv: string, predictionCsv: string): MatchdayData {
  const { matches, actualResults } = parseLiveActualResults(countCsv);

  return {
    matches,
    predictionsByMatch: parseLivePredictions(predictionCsv),
    actualResults,
  };
}
