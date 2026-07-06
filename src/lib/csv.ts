import Papa from "papaparse";
import type { LeaderboardEntry, ParticipantEntry } from "./types";
import { selectedWinnerOverrides } from "./winner-overrides";

type CsvRecord = Record<string, string | undefined>;

const invalidCellValues = new Set(["", "#N/A", "#VALUE!", "#REF!", "#DIV/0!", "N/A"]);
const topPrizeSlotCount = 5;
const lastPlacePrize = 1000;

type PrizeSlot = {
  prize: number;
  prizePercent: number | null;
};

function canonicalKey(value: string) {
  return value.toLowerCase().replace(/%/g, "percent").replace(/[^a-z0-9]/g, "");
}

function get(record: CsvRecord, aliases: string[]) {
  const wanted = new Set(aliases.map(canonicalKey));
  const found = Object.entries(record).find(([key]) => wanted.has(canonicalKey(key)));
  const value = found?.[1]?.trim() ?? "";
  return invalidCellValues.has(value) ? "" : value;
}

export function parseCsv(csv: string): CsvRecord[] {
  const parsed = Papa.parse<CsvRecord>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) => error.message).join("; "));
  }

  return parsed.data.filter((record) =>
    Object.values(record).some((value) => value && !invalidCellValues.has(value.trim())),
  );
}

export function parseCsvRows(csv: string): string[][] {
  const parsed = Papa.parse<string[]>(csv, {
    header: false,
    skipEmptyLines: "greedy",
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) => error.message).join("; "));
  }

  return parsed.data;
}

export function parseNumber(value: string) {
  if (!value || invalidCellValues.has(value.trim())) return null;
  const cleaned = value.replace(/[$,%\s]/g, "").replace(/,/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePercent(value: string) {
  const parsed = parseNumber(value);
  if (parsed == null) return null;
  return parsed > 1 ? parsed / 100 : parsed;
}

export function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "yes", "y", "paid", "submitted", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "unpaid", "pending", "0"].includes(normalized)) return false;
  return null;
}

function makeParticipantId(name: string, index: number) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "participant"}-${index + 1}`;
}

function getLivePrizeSlots(rows: string[][]) {
  const prizeSlots = new Map<number, PrizeSlot>();

  for (const row of rows.slice(1)) {
    const prizeRank = parseNumber(row[5] ?? "");
    const prize = parseNumber(row[6] ?? "");
    const prizePercent = row[7]?.includes("%") ? parsePercent(row[7]) : null;

    if (prizeRank == null || prize == null || prizeRank < 1 || prizeRank > topPrizeSlotCount) continue;

    prizeSlots.set(prizeRank, {
      prize,
      prizePercent,
    });
  }

  return prizeSlots;
}

function applyLivePrizeDistribution(entries: LeaderboardEntry[], prizeSlots: Map<number, PrizeSlot>) {
  const sorted = entries.sort((a, b) => b.score - a.score || a.rank - b.rank || a.name.localeCompare(b.name));

  for (const entry of sorted) {
    entry.prize = null;
    entry.prizePercent = null;
  }

  let groupStart = 0;
  let scorePosition = 1;

  while (groupStart < sorted.length) {
    let groupEnd = groupStart + 1;

    while (groupEnd < sorted.length && sorted[groupEnd].score === sorted[groupStart].score) {
      groupEnd += 1;
    }

    const groupSize = groupEnd - groupStart;
    let groupPrize = prizeSlots.get(scorePosition)?.prize ?? 0;
    const groupPrizePercent = prizeSlots.get(scorePosition)?.prizePercent ?? null;

    for (let index = groupStart; index < groupEnd; index += 1) {
      sorted[index].rank = scorePosition;
    }

    const isLowestScoreGroup = groupEnd === sorted.length;
    if (isLowestScoreGroup) {
      groupPrize += lastPlacePrize;
    }

    if (groupPrize > 0) {
      const individualPrize = groupPrize / groupSize;
      const individualPrizePercent = groupPrizePercent == null ? null : groupPrizePercent / groupSize;

      for (let index = groupStart; index < groupEnd; index += 1) {
        sorted[index].prize = individualPrize;
        sorted[index].prizePercent = individualPrizePercent;
      }
    }

    groupStart = groupEnd;
    scorePosition += 1;
  }

  return sorted;
}

export function parseRankingCsv(csv: string): LeaderboardEntry[] {
  const rawRows = parseCsvRows(csv);
  const firstCell = rawRows[0]?.[0]?.trim().toLowerCase();

  if (firstCell === "predictions ranking") {
    return parsePredictionsRankingLayout(rawRows);
  }

  const entries = parseCsv(csv)
    .map((record, index): LeaderboardEntry | null => {
      const name = get(record, ["Name", "Participant", "Player", "User"]);
      const rank = parseNumber(get(record, ["Rank", "Position", "#"]));
      const score = parseNumber(get(record, ["Score", "Points", "Total Score"]));

      if (!name || rank == null || score == null) return null;

      return {
        participantId: makeParticipantId(name, index),
        rank,
        name,
        score,
        exactPredictions: parseNumber(get(record, ["Exact Predictions", "Exact", "Exact Game Predictions"])) ?? 0,
        correctTeams: parseNumber(get(record, ["Correct Teams", "Teams", "Correct Team"])) ?? 0,
        prize: parseNumber(get(record, ["Prize", "Prize Money", "Current Prize Money"])),
        prizePercent: parsePercent(get(record, ["Prize Percentage", "Prize Percent", "Prize %", "%"])),
        paid: null,
        received: null,
        predictionSubmitted: null,
        supportingTeam: null,
        selectedWinner: null,
        previousRank: null,
        rankDelta: null,
        scoreDelta: null,
      } satisfies LeaderboardEntry;
    })
    .filter((entry): entry is LeaderboardEntry => Boolean(entry));

  return entries.sort((a, b) => a.rank - b.rank);
}

function parsePredictionsRankingLayout(rows: string[][]): LeaderboardEntry[] {
  const prizeSlots = getLivePrizeSlots(rows);
  const entries = rows
    .slice(1)
    .map((row, index): LeaderboardEntry | null => {
      const rank = parseNumber(row[0] ?? "");
      const name = row[1]?.trim() ?? "";
      const score = parseNumber(row[2] ?? "");

      if (!name || rank == null || score == null) return null;

      return {
        participantId: makeParticipantId(name, index),
        rank,
        name,
        score,
        exactPredictions: parseNumber(row[3] ?? "") ?? 0,
        correctTeams: parseNumber(row[4] ?? "") ?? 0,
        prize: null,
        prizePercent: null,
        paid: null,
        received: null,
        predictionSubmitted: null,
        supportingTeam: null,
        selectedWinner: null,
        previousRank: null,
        rankDelta: null,
        scoreDelta: null,
      };
    })
    .filter((entry): entry is LeaderboardEntry => Boolean(entry));

  return applyLivePrizeDistribution(entries, prizeSlots);
}

export function parseParticipantsCsv(csv: string): ParticipantEntry[] {
  const entries = parseCsv(csv)
    .map((record, index): ParticipantEntry | null => {
      const name = get(record, ["Name", "Participant", "Player", "User"]);
      if (!name) return null;
      const received = get(record, ["Received", "Amount Received", "Payment Received"]);
      const receivedAmount = parseNumber(received);

      return {
        participantId: makeParticipantId(name, index),
        name,
        paid: parseBoolean(get(record, ["Paid", "Payment", "Payment Status"])),
        received: receivedAmount ?? (parseBoolean(received) ? 1000 : null),
        predictionSubmitted: parseBoolean(get(record, ["Prediction Status", "Prediction Submitted", "Submitted"])),
        supportingTeam: get(record, ["Supporting Team", "Support Team", "Team"]) || null,
        selectedWinner: get(record, ["Selected Winner", "Winner", "Predicted Winner"]) || null,
      } satisfies ParticipantEntry;
    })
    .filter((entry): entry is ParticipantEntry => Boolean(entry));

  return entries;
}

export function mergeParticipantDetails(
  leaderboard: LeaderboardEntry[],
  participants: ParticipantEntry[],
) {
  const byName = new Map(participants.map((entry) => [entry.name.trim().toLowerCase(), entry]));

  return leaderboard.map((entry) => {
    const participant = byName.get(entry.name.trim().toLowerCase());
    const selectedWinner = selectedWinnerOverrides[entry.name] ?? participant?.selectedWinner ?? null;
    if (!participant) return { ...entry, selectedWinner };

    return {
      ...entry,
      participantId: participant.participantId,
      paid: participant.paid,
      received: participant.received,
      predictionSubmitted: participant.predictionSubmitted,
      supportingTeam: participant.supportingTeam,
      selectedWinner,
    };
  });
}
