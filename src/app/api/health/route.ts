import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getDashboard();
  return NextResponse.json(
    {
      ok: payload.health.ok,
      googleSheetConfigured: Boolean(process.env.GOOGLE_SHEET_ID),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      movementAvailable: payload.movementAvailable,
      lastSyncedAt: payload.lastSyncedAt,
      health: payload.health,
    },
    { status: payload.health.ok ? 200 : 503 },
  );
}
