import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { syncDashboard } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.SYNC_SECRET;
  const configuredCronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const bearerSecret = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const providedSecret =
    request.headers.get("x-sync-secret") ??
    request.nextUrl.searchParams.get("secret") ??
    bearerSecret ??
    "";

  if (!configuredSecret || ![configuredSecret, configuredCronSecret].filter(Boolean).includes(providedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await syncDashboard();
  revalidateTag("leaderboard", "max");

  return NextResponse.json(payload, {
    status: payload.health.ok ? 200 : 502,
  });
}
