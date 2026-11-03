import { buildFeedBundle, lastTranslationError } from "@/lib/ingest";
import { loadFeedBundle, saveFeedBundle, withoutContent } from "@/lib/store";
import { translateItemBody, getSyncState, startSync as startJobSync } from "@/lib/syncJob";
import {
  blocksNeedTranslation,
  needsChineseTranslation,
  translateBlocks,
  translateTexts,
  translationProvider,
} from "@/lib/translate";
import { LlmError } from "@/lib/llm";
import type { ContentBlock, FeedItem } from "@/lib/types";

type SyncState = ReturnType<typeof getSyncState> & { translator?: string | null };

let syncRunning = false;

async function jsonResponse(data: unknown, status = 200): Promise<Response> {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleFeed(): Promise<Response> {
  const sync = getSyncState();
  const cached = await loadFeedBundle();
  if (!cached) {
    return jsonResponse({
      generatedAt: null,
      items: [],
      results: [],
      fromCache: false,
      sync,
      translator: translationProvider(),
    });
  }
  return jsonResponse({
    ...withoutContent(cached),
    fromCache: true,
    sync,
    translator: translationProvider(),
  });
}

async function handleSyncGet(): Promise<Response> {
  return jsonResponse({ ...getSyncState(), translator: translationProvider() });
}

async function handleSyncPost(): Promise<Response> {
  if (syncRunning || getSyncState().running) {
    return jsonResponse({ ...getSyncState(), translator: translationProvider() });
  }
  // Prefer the shared job when available; fall back to a direct run.
  try {
    const started = startJobSync("manual");
    return jsonResponse({ ...started, translator: translationProvider() });
  } catch {
    syncRunning = true;
    void (async () => {
      try {
        const bundle = await buildFeedBundle();
        await saveFeedBundle(bundle);
      } finally {
        syncRunning = false;
      }
    })();
    return jsonResponse({
      running: true,
      trigger: "manual",
      translator: translationProvider(),
      translationError: lastTranslationError(),
    } satisfies Partial<SyncState>);
  }
}

async function handleHealth(): Promise<Response> {
  const bundle = await loadFeedBundle();
  return jsonResponse({
    ok: true,
    items: bundle?.items.length ?? 0,
    lastSyncAt: bundle?.generatedAt ?? null,
    translator: translationProvider(),
    sync: getSyncState(),
  });
}

async function handleItemGet(url: URL): Promise<Response> {
  const id = url.searchParams.get("id");
  const lang = url.searchParams.get("lang") === "zh" ? "zh" : "orig";
  if (!id) return jsonResponse({ error: "缺少 id 参数" }, 400);
  const bundle = await loadFeedBundle();
  const item = bundle?.items.find((i) => i.id === id);
  if (!item) {
    return jsonResponse({ error: "这条内容不在当前缓存里，点「立即同步」后再打开。" }, 404);
  }
  return itemResponse(item, lang);
}

async function itemResponse(item: FeedItem, lang: "orig" | "zh"): Promise<Response> {
  const original = item.content ?? [];
  const translator = translationProvider();
  const foreign =
    (original.length > 0 && blocksNeedTranslation(original)) ||
    needsChineseTranslation(`${item.title} ${item.summary}`);
  const base = { id: item.id, foreign, translator, title: item.title, summary: item.summary };
  if (lang === "orig" || !foreign) {
    return jsonResponse({ ...base, content: original, translated: false });
  }
  if (!translator) {
    return jsonResponse({
      ...base,
      content: original,
      translated: false,
      error: "还没配置翻译服务。打开「设置」填入 DeepSeek API Key。",
    });
  }
  try {
    const [content, meta] = await Promise.all([
      translateItemBody(item),
      translateTexts([item.title, item.summary].filter(Boolean)),
    ]);
    return jsonResponse({
      ...base,
      title: meta.get(item.title) ?? item.title,
      summary: item.summary ? (meta.get(item.summary) ?? item.summary) : "",
      content,
      translated: true,
    });
  } catch (err) {
    const message =
      err instanceof LlmError ? err.message : "翻译没有完成，可能是网络问题，稍后再点一次「翻译成中文」。";
    return jsonResponse({ ...base, content: original, translated: false, error: message });
  }
}

function asBlocks(value: unknown): ContentBlock[] {
  if (!Array.isArray(value)) return [];
  const types = new Set(["p", "h", "li", "pre", "quote"]);
  return value
    .flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const type = (row as { type?: unknown }).type;
      const text = (row as { text?: unknown }).text;
      if (typeof type !== "string" || !types.has(type) || typeof text !== "string") return [];
      return [{ type, text: text.slice(0, 8_000) } as ContentBlock];
    })
    .slice(0, 400);
}

async function handleItemPost(request: Request): Promise<Response> {
  let body: { title?: unknown; summary?: unknown; content?: unknown };
  try {
    body = (await request.json()) as { title?: unknown; summary?: unknown; content?: unknown };
  } catch {
    return jsonResponse({ error: "请求内容无法读取" }, 400);
  }
  const title = typeof body.title === "string" ? body.title.slice(0, 500) : "";
  const summary = typeof body.summary === "string" ? body.summary.slice(0, 2_000) : "";
  const original = asBlocks(body.content);
  const translator = translationProvider();
  const foreign =
    (original.length > 0 && blocksNeedTranslation(original)) || needsChineseTranslation(`${title} ${summary}`);
  const base = { foreign, translator, title, summary, content: original, translated: false };
  if (!foreign) return jsonResponse(base);
  if (!translator) {
    return jsonResponse({
      ...base,
      error: "还没配置翻译服务。打开「设置」填入 DeepSeek API Key。",
    });
  }
  try {
    const [content, meta] = await Promise.all([
      translateBlocks(original),
      translateTexts([title, summary].filter(Boolean)),
    ]);
    return jsonResponse({
      ...base,
      title: meta.get(title) ?? title,
      summary: summary ? (meta.get(summary) ?? summary) : "",
      content,
      translated: true,
    });
  } catch (err) {
    const message =
      err instanceof LlmError ? err.message : "翻译没有完成，可能是网络问题，稍后再点一次「翻译成中文」。";
    return jsonResponse({ ...base, error: message });
  }
}

async function handleSourcesGet(): Promise<Response> {
  const { getAllSources } = await import("@/lib/userSources");
  return jsonResponse({ sources: getAllSources() });
}

/** Routes /api/* to in-app handlers so the shared UI keeps working without a Node server. */
export function installApiBridge(): void {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let url: URL;
    try {
      url = new URL(raw, window.location.origin);
    } catch {
      return nativeFetch(input, init);
    }
    if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);

    const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") || "GET").toUpperCase();
    try {
      if (url.pathname === "/api/feed" && method === "GET") return await handleFeed();
      if (url.pathname === "/api/sync" && method === "GET") return await handleSyncGet();
      if (url.pathname === "/api/sync" && method === "POST") return await handleSyncPost();
      if (url.pathname === "/api/health" && method === "GET") return await handleHealth();
      if (url.pathname === "/api/item" && method === "GET") return await handleItemGet(url);
      if (url.pathname === "/api/item" && method === "POST") {
        const req = new Request(url, init);
        return await handleItemPost(req);
      }
      if (url.pathname === "/api/sources" && method === "GET") return await handleSourcesGet();
      if (url.pathname === "/api/sources") {
        return jsonResponse({ error: "手机版暂不支持添加自定义来源，请在电脑版操作。" }, 400);
      }
      return jsonResponse({ error: `未实现 ${method} ${url.pathname}` }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "请求失败";
      return jsonResponse({ error: message }, 500);
    }
  };
}
