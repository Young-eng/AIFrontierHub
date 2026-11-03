import { NextResponse } from "next/server";
import { getSyncState, startSync } from "@/lib/syncJob";
import { translationProvider } from "@/lib/translate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ...getSyncState(), translator: translationProvider() });
}

export async function POST() {
  return NextResponse.json({ ...startSync("manual"), translator: translationProvider() });
}
