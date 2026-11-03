import { buildFeedBundle, lastTranslationError, type SyncProgress } from "./ingest";
import { saveFeedBundle } from "./store";
import { blocksNeedTranslation, translateBlocks, translationProvider } from "./translate";
import type { ContentBlock, FeedItem } from "./types";

export type SyncState = {
  running: boolean;
  trigger: "manual" | null;
  startedAt: string | null;
  finishedAt: string | null;
  progress: SyncProgress | null;
  error: string | null;
  translationError: string | null;
};

type Store = {
  state: SyncState;
  bodyJobs: Map<string, Promise<ContentBlock[]>>;
};

const g = globalThis as unknown as { __aiTrendingSync?: Store };
const store: Store = (g.__aiTrendingSync ??= {
  state: {
    running: false,
    trigger: null,
    startedAt: null,
    finishedAt: null,
    progress: null,
    error: null,
    translationError: null,
  },
  bodyJobs: new Map(),
});

export function getSyncState(): SyncState {
  return { ...store.state };
}

/** Starts a sync in the background; only ever called from the 立即同步 button. */
export function startSync(trigger: "manual"): SyncState {
  if (store.state.running) return getSyncState();
  store.state = {
    ...store.state,
    running: true,
    trigger,
    startedAt: new Date().toISOString(),
    progress: { phase: "fetching", done: 0, total: 0 },
    error: null,
  };

  void (async () => {
    try {
      const bundle = await buildFeedBundle((p) => {
        store.state.progress = p;
      });
      await saveFeedBundle(bundle);
      store.state.translationError = lastTranslationError();
    } catch (err) {
      store.state.error = err instanceof Error ? err.message : "同步失败";
    } finally {
      store.state.running = false;
      store.state.progress = null;
      store.state.finishedAt = new Date().toISOString();
    }
  })();

  return getSyncState();
}

/** Translated body for one item; concurrent requests for the same item share one job. */
export function translateItemBody(item: FeedItem): Promise<ContentBlock[]> {
  const blocks = item.content ?? [];
  if (!blocks.length || !translationProvider() || !blocksNeedTranslation(blocks)) {
    return Promise.resolve(blocks);
  }
  const existing = store.bodyJobs.get(item.id);
  if (existing) return existing;
  const job = translateBlocks(blocks).finally(() => store.bodyJobs.delete(item.id));
  store.bodyJobs.set(item.id, job);
  return job;
}