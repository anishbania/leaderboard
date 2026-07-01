"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  CircleDollarSign,
  Crown,
  LayoutGrid,
  List,
  Medal,
  RotateCcw,
  Search,
  Target,
  Trophy,
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
import { matchdayData } from "@/lib/matchday-data";
import { cn, compactNumber, formatCurrency, formatPercent } from "@/lib/utils";

type Props = {
  initialData: LeaderboardPayload;
};

type FilterMode = "all" | "top10" | "prize" | "chasers" | "last";
type SortMode = "rank" | "score" | "prize" | "move" | "winner";
type ViewMode = "table" | "cards";
type AppTab = "leaderboard" | "predictions";
type PredictionFilter = "all" | "team1" | "draw" | "team2";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

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

const matchdays = matchdayData as MatchdayData;

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
      <span className="inline-flex h-7 min-w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-500">
        -
      </span>
    );
  }

  if (delta === 0) {
    return (
      <span className="inline-flex h-7 min-w-10 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-500">
        0
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-10 items-center justify-center rounded-md border px-2 text-xs font-semibold",
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
    "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition",
    active
      ? "border-slate-900 bg-slate-900 text-white"
      : "border-slate-200 bg-white text-slate-700",
    onClick && !active && "hover:border-slate-300 hover:bg-slate-50",
  );

  const content = (
    <>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: teamColor(team) }} />
      {team}
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

function formatMatchDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function pickInitialDate(dates: string[]) {
  const today = new Date().toISOString().slice(0, 10);
  return dates.find((date) => date >= today) ?? dates.at(-1) ?? dates[0] ?? today;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function MatchdayPredictions({
  leaderboard,
  onSelectPlayer,
}: {
  leaderboard: LeaderboardEntry[];
  onSelectPlayer: (participantId: string) => void;
}) {
  const dates = useMemo(() => Array.from(new Set(matchdays.matches.map((match) => match.date))).sort(), []);
  const [selectedDate, setSelectedDate] = useState(() => pickInitialDate(dates));
  const dayMatches = useMemo(
    () => matchdays.matches.filter((match) => match.date === selectedDate),
    [selectedDate],
  );
  const [selectedMatchNo, setSelectedMatchNo] = useState<number | null>(dayMatches[0]?.matchNo ?? null);
  const selectedMatch = dayMatches.find((match) => match.matchNo === selectedMatchNo) ?? dayMatches[0] ?? null;
  const playerByName = useMemo(() => new Map(leaderboard.map((entry) => [entry.name, entry])), [leaderboard]);

  const predictions = useMemo(() => {
    if (!selectedMatch) return [];
    return matchdays.predictionsByMatch[String(selectedMatch.matchNo)] ?? [];
  }, [selectedMatch]);

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
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-teal-500"
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
                Match {match.matchNo} · {match.time}
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
                        {item.label} · {item.count}
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
  onSelectPlayer,
}: {
  leaderboard: LeaderboardEntry[];
  onSelectPlayer: (participantId: string) => void;
}) {
  const dates = useMemo(() => Array.from(new Set(matchdays.matches.map((match) => match.date))).sort(), []);
  const [selectedDate, setSelectedDate] = useState(() => pickInitialDate(dates));
  const [predictionQuery, setPredictionQuery] = useState("");
  const [predictionFilter, setPredictionFilter] = useState<PredictionFilter>("all");
  const dayMatches = useMemo(() => matchdays.matches.filter((match) => match.date === selectedDate), [selectedDate]);
  const [selectedMatchNo, setSelectedMatchNo] = useState<number | null>(dayMatches[0]?.matchNo ?? null);
  const selectedMatch = dayMatches.find((match) => match.matchNo === selectedMatchNo) ?? dayMatches[0] ?? null;
  const playerByName = useMemo(() => new Map(leaderboard.map((entry) => [entry.name, entry])), [leaderboard]);

  const predictions = useMemo(() => {
    if (!selectedMatch) return [];
    return matchdays.predictionsByMatch[String(selectedMatch.matchNo)] ?? [];
  }, [selectedMatch]);

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
        (predictionFilter === "team1" && selectedMatch && result === selectedMatch.team1) ||
        (predictionFilter === "team2" && selectedMatch && result === selectedMatch.team2) ||
        (predictionFilter === "draw" && result === "Draw");

      return matchesQuery && matchesFilter;
    });
  }, [predictionFilter, predictionQuery, predictions, selectedMatch]);

  const resultFilters = selectedMatch
    ? [
        { value: "all" as const, label: "All picks" },
        { value: "team1" as const, label: selectedMatch.team1 },
        { value: "draw" as const, label: "Draw" },
        { value: "team2" as const, label: selectedMatch.team2 },
      ]
    : [];
  const selectedDateIndex = Math.max(0, dates.indexOf(selectedDate));
  const minWorldCupDate = dates[0] ?? "2026-06-12";
  const maxWorldCupDate = dates.at(-1) ?? "2026-07-20";

  function selectDate(date: string) {
    const nextDate = dates.includes(date)
      ? date
      : (dates.find((matchDate) => matchDate >= date) ?? dates.at(-1) ?? date);
    setSelectedDate(nextDate);
    const firstMatch = matchdays.matches.find((match) => match.date === nextDate);
    setSelectedMatchNo(firstMatch?.matchNo ?? null);
    setPredictionFilter("all");
    setPredictionQuery("");
  }

  return (
    <section className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-3 text-white shadow-[0_18px_50px_rgba(15,23,42,0.22)] sm:p-5">
        <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(20,184,166,.18),transparent_38%),radial-gradient(circle_at_85%_18%,rgba(245,158,11,.22),transparent_26%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-teal-300/70 to-transparent" />
        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-teal-200">Prediction Center</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-3xl">Matchday pick board</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Choose a fixture and scan how everyone sees the game going.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-center text-xs min-[420px]:grid-cols-3 lg:min-w-[300px]">
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
              <p className="mt-1 max-w-24 truncate text-lg font-semibold">{consensus[0]?.result ?? "-"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">World Cup 2026 calendar</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{formatMatchDate(selectedDate)}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] md:flex md:items-center">
            <button
              type="button"
              onClick={() => selectDate(dates[Math.max(0, selectedDateIndex - 1)] ?? selectedDate)}
              disabled={selectedDateIndex <= 0}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 md:w-auto"
            >
              Previous matchday
            </button>
            <input
              type="date"
              value={selectedDate}
              min={minWorldCupDate}
              max={maxWorldCupDate}
              onChange={(event) => selectDate(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 md:w-auto"
              aria-label="Select World Cup 2026 match date"
            />
            <button
              type="button"
              onClick={() => selectDate(dates[Math.min(dates.length - 1, selectedDateIndex + 1)] ?? selectedDate)}
              disabled={selectedDateIndex >= dates.length - 1}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 md:w-auto"
            >
              Next matchday
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-950">Fixtures</h3>
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
                    <p className="text-xs font-semibold uppercase text-slate-500">Selected fixture</p>
                    <h3 className="mt-1 break-words text-lg font-semibold text-slate-950 sm:text-xl">
                      {selectedMatch.team1} <span className="text-slate-400">vs</span> {selectedMatch.team2}
                    </h3>
                    <p className="mt-1 break-words text-sm text-slate-500">
                      Match {selectedMatch.matchNo} · {selectedMatch.time} · {selectedMatch.venue}
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
                        "rounded-md border px-3 py-2 text-left text-sm font-medium transition",
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
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
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
                        className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-teal-50/40 hover:shadow-md"
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

function PodiumCard({ entry }: { entry: LeaderboardEntry }) {
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
        <div className="flex items-center gap-3">
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-full", medalClass)}>
            {isChampion ? <Crown className="h-6 w-6" /> : <Medal className="h-6 w-6" />}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Rank {entry.rank}</p>
            <h2 className="mt-1 break-words text-base font-semibold text-slate-950 sm:text-lg">{entry.name}</h2>
          </div>
        </div>
        <MovementChip delta={entry.rankDelta} />
      </div>
      <div className="relative mt-4 grid grid-cols-3 gap-2 text-xs sm:mt-5 sm:text-sm">
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
          <p className="mt-1 truncate font-semibold text-slate-950">{entry.selectedWinner ?? "-"}</p>
        </div>
      </div>
    </motion.button>
  );
}

function Podium({ leaders }: { leaders: LeaderboardEntry[] }) {
  const [first, second, third] = leaders.slice(0, 3);
  const ordered = [second, first, third].filter(Boolean);

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      {ordered.map((entry) => (
        <PodiumCard key={entry.participantId} entry={entry} />
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

function PlayerCard({ entry, selected, onClick }: { entry: LeaderboardEntry; selected: boolean; onClick: () => void }) {
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
            <p className="break-words font-semibold text-slate-950">#{entry.rank} {entry.name}</p>
            <div className="mt-1">
              <TeamPill team={entry.selectedWinner} />
            </div>
          </div>
        </div>
        <MovementChip delta={entry.rankDelta} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:mt-4 sm:text-sm">
        <div>
          <p className="text-xs text-slate-500">Score</p>
          <p className="font-semibold text-slate-950">{entry.score}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Prize</p>
          <p className="font-semibold text-slate-950">{formatCurrency(entry.prize)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Share</p>
          <p className="font-semibold text-slate-950">{formatPercent(entry.prizePercent)}</p>
        </div>
      </div>
    </motion.article>
  );
}

function DetailPanel({ entry, onClose }: { entry: LeaderboardEntry | null; onClose: () => void }) {
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
              <h3 className="mt-1 break-words text-base font-semibold text-slate-950 sm:text-lg">#{entry.rank} {entry.name}</h3>
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
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Score</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">{compactNumber(entry.score)}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Movement</p>
              <div className="mt-1"><MovementChip delta={entry.rankDelta} /></div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Prize</p>
              <p className="mt-1 font-semibold text-slate-950">{formatCurrency(entry.prize)}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
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
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
                <Trophy className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase text-teal-700">World Cup 2026 predictor</p>
                <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">Live leaderboard</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
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
              <span className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600">
                Last synced: {initialData.lastSyncedAt ? new Date(initialData.lastSyncedAt).toLocaleString() : "Live sheet"}
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
                "flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition sm:text-sm",
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
                "flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition sm:text-sm",
                activeTab === "predictions" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <Target className="h-4 w-4 shrink-0" />
              <span className="truncate">Predictions</span>
              <span className={cn(
                "hidden rounded px-1.5 py-0.5 text-[11px] sm:inline",
                activeTab === "predictions" ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500",
              )}>
                {matchdays.matches.length}
              </span>
            </button>
            </div>
          </nav>
        </section>

        {activeTab === "predictions" ? (
          <PredictionCenter leaderboard={initialData.leaderboard} onSelectPlayer={(participantId) => {
            setSelectedId(participantId);
            setActiveTab("leaderboard");
          }} />
        ) : (
          <>
          <Podium leaders={initialData.leaderboard} />

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
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 sm:w-64"
                      placeholder="Search player or team"
                    />
                  </label>
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortMode)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 sm:w-auto"
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
                      className={cn("flex h-8 flex-1 items-center justify-center rounded text-slate-500 sm:w-9 sm:flex-none", view === "table" && "bg-white text-slate-950 shadow-sm")}
                      aria-label="Table view"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("cards")}
                      className={cn("flex h-8 flex-1 items-center justify-center rounded text-slate-500 sm:w-9 sm:flex-none", view === "cards" && "bg-white text-slate-950 shadow-sm")}
                      aria-label="Card view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
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
                      "h-9 shrink-0 rounded-lg border px-3 text-sm font-medium transition",
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
                        <th className="w-[64px] py-3 pl-4 pr-2 font-semibold">Rank</th>
                        <th className="w-[25%] px-2 py-3 font-semibold">Player</th>
                        <th className="w-[70px] px-2 py-3 text-right font-semibold">Move</th>
                        <th className="w-[72px] px-2 py-3 text-right font-semibold">Score</th>
                        <th className="w-[18%] px-2 py-3 font-semibold">Score pace</th>
                        <th className="w-[120px] px-2 py-3 text-right font-semibold">Prize</th>
                        <th className="w-[76px] px-2 py-3 text-right font-semibold">Share</th>
                        <th className="w-[150px] py-3 pl-2 pr-4 font-semibold">Winner</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence initial={false}>
                        {filteredLeaderboard.map((entry) => (
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
                            <td className="py-3 pl-4 pr-2 font-semibold text-slate-950">#{entry.rank}</td>
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
                            <td className="px-2 py-3 text-right">{formatPercent(entry.prizePercent)}</td>
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
                      selected={selectedId === entry.participantId}
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
                      selected={selectedId === entry.participantId}
                      onClick={() => setSelectedId(entry.participantId)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <DetailPanel entry={selectedEntry} onClose={() => setSelectedId(null)} />

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
