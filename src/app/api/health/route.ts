import { NextResponse } from "next/server";
import { loadFeedBundle } from "@/lib/store";
import { getSyncState } from "@/lib/syncJob";
import { translationProvider } from "@/lib/translate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const bundle = await loadFeedBundle();
  return NextResponse.json({
    ok: true,
    items: bundle?.items.length ?? 0,
    lastSyncAt: bundle?.generatedAt ?? null,
    translator: translationProvider(),
    sync: getSyncState(),
  });
}
