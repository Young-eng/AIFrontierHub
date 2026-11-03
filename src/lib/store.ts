import { mkdir, readFile, rename, stat, writeFile } from "fs/promises";
import path from "path";
import type { FeedBundle } from "./ingest";

const dataDir = path.join(process.cwd(), "data", "cache");
const feedPath = path.join(dataDir, "feed.json");

const g = globalThis as unknown as { __aiTrendingFeed?: { mtimeMs: number; bundle: FeedBundle } };

export async function saveFeedBundle(bundle: FeedBundle): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  // Write then rename, so a reader never sees a half-written file.
  const tmp = `${feedPath}.tmp`;
  await writeFile(tmp, JSON.stringify(bundle), "utf8");
  await rename(tmp, feedPath);
  g.__aiTrendingFeed = undefined;
}

export async function loadFeedBundle(): Promise<FeedBundle | null> {
  try {
    const { mtimeMs } = await stat(feedPath);
    if (g.__aiTrendingFeed?.mtimeMs === mtimeMs) return g.__aiTrendingFeed.bundle;
    const bundle = JSON.parse(await readFile(feedPath, "utf8")) as FeedBundle;
    g.__aiTrendingFeed = { mtimeMs, bundle };
    return bundle;
  } catch {
    return null;
  }
}

/** The list view only needs metadata; bodies are fetched one at a time. */
export function withoutContent(bundle: FeedBundle): FeedBundle {
  return {
    ...bundle,
    items: bundle.items.map((item) => {
      const { content: _content, ...rest } = item;
      return { ...rest, fullText: Boolean(item.fullText) };
    }),
  };
}
