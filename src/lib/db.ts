import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { desc } from "drizzle-orm";
import { pgTable, serial, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import type { LeaderboardEntry } from "./types";
import type { SnapshotEntry } from "./movement";

export const leaderboardSnapshots = pgTable("leaderboard_snapshots", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  participantCount: integer("participant_count").notNull(),
  entries: jsonb("entries").$type<SnapshotEntry[]>().notNull(),
});

function getDb() {
  if (!process.env.DATABASE_URL) return null;
  const sql = neon(process.env.DATABASE_URL);
  return drizzle(sql);
}

export async function ensureSnapshotTable() {
  if (!process.env.DATABASE_URL) return false;
  const sql = neon(process.env.DATABASE_URL);

  await sql`
    create table if not exists leaderboard_snapshots (
      id serial primary key,
      created_at timestamptz not null default now(),
      participant_count integer not null,
      entries jsonb not null
    )
  `;

  return true;
}

export async function getLatestSnapshot() {
  const db = getDb();
  if (!db) return null;

  try {
    await ensureSnapshotTable();
    const [snapshot] = await db
      .select()
      .from(leaderboardSnapshots)
      .orderBy(desc(leaderboardSnapshots.createdAt))
      .limit(1);

    return snapshot ?? null;
  } catch (error) {
    console.error("Failed to read leaderboard snapshot", error);
    return null;
  }
}

export async function insertSnapshot(entries: LeaderboardEntry[]) {
  const db = getDb();
  if (!db) return null;

  const snapshotEntries = entries.map((entry) => ({
    participantId: entry.participantId,
    rank: entry.rank,
    score: entry.score,
  }));

  try {
    await ensureSnapshotTable();
    const [snapshot] = await db
      .insert(leaderboardSnapshots)
      .values({
        participantCount: entries.length,
        entries: snapshotEntries,
      })
      .returning();

    return snapshot;
  } catch (error) {
    console.error("Failed to write leaderboard snapshot", error);
    return null;
  }
}
