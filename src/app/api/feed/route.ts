import { NextResponse } from "next/server";
import { loadFeedBundle, withoutContent } from "@/lib/store";
import { getSyncState } from "@/lib/syncJob";
import { translationProvider } from "@/lib/translate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Answers from the cache only; fetching sources happens via POST /api/sync. */
export async function GET() {
  const sync = getSyncState();
  const cached = await loadFeedBundle();
  if (!cached) {
    return NextResponse.json({
      generatedAt: null,
      items: [],
      results: [],
      fromCache: false,
      sync,
      translator: translationProvider(),
    });
  }
  return NextResponse.json({
    ...withoutContent(cached),
    fromCache: true,
    sync,
    translator: translationProvider(),
  });
}
