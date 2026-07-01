import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getDashboard();
  return NextResponse.json(payload);
}
