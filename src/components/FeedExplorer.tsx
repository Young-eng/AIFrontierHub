"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArticleReader } from "@/components/ArticleReader";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useReaderBack } from "@/hooks/useReaderBack";
import { loadFavorites, toggleFavorite } from "@/lib/favorites";
import { absoluteDate, relativeTime } from "@/lib/format";
import { LANES } from "@/lib/lanes";
import { addToQueue, loadQueue } from "@/lib/queue";
import { loadReadIds, markRead } from "@/lib/readState";
import { toQueueItem } from "@/lib/savedItem";
import type { ContentBlock, FeedItem, SourceCategory } from "@/lib/types";

type SyncProgress = { phase: "fetching" | "readmes" | "linking"; done: number; total: number };

type SyncState = {
  running: boolean;
  progress: SyncProgress | null;
  error: string | null;
  translationError: string | null;
  finishedAt: string | null;
  translator?: string | null;
};

type Bundle = {
  generatedAt: string | null;
  items: FeedItem[];
  results?: unknown[];
  fromCache?: boolean;
  sync?: SyncState;
  translator?: string | null;
};

function syncMessage(s: SyncState): string {
  const p = s.progress;
  if (!p || p.phase === "fetching") {
    return p && p.total ? `正在拉取来源，${p.done}/${p.total}` : "正在开始同步…";
  }
  if (p.phase === "readmes") return "正在读取模型卡和项目说明…";
  return "正在整理相关报道…";
}

const DESKTOP_QUERY = "(min-width: 901px)";

function todayLabel() {
  const d = new Date();
  return {
    date: `${d.getMonth() + 1}月${d.getDate()}日`,
    weekday: new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(d),
  };
}

export function FeedExplorer() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [lane, setLane] = useState<SourceCategory | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const originals = useRef<Record<string, ContentBlock[]>>({});
  const today = todayLabel();
  const closeReader = useReaderBack(readerOpen, () => setReaderOpen(false));

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/feed", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Bundle;
      setBundle(data);
      if (data.sync) setSync({ ...data.sync, translator: data.translator });
      setNow(Date.now());
    } catch (err) {
      const reason = err instanceof Error ? err.message : "网络错误";
      setError(`读取失败（${reason}）。本地服务可能没在运行，按说明启动后刷新页面。`);
    } finally {
      setStatus("ready");
    }
  }, []);

  useEffect(() => {
    void load();
    setReadIds(loadReadIds());
    setSavedIds(new Set(loadQueue().map((q) => q.id)));
    setFavoriteIds(new Set(loadFavorites().map((q) => q.id)));
  }, [load]);

  const startSync = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSync((await res.json()) as SyncState);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "网络错误";
      setError(`没能开始同步（${reason}）。上次的内容仍可阅读，稍后再试。`);
    }
  }, []);

  const running = Boolean(sync?.running);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/sync", { cache: "no-store" });
        const next = (await res.json()) as SyncState;
        setSync(next);
        if (!next.running) {
          clearInterval(timer);
          if (next.error) setError(`同步失败：${next.error}。上次的内容仍可阅读。`);
          void load();
        }
      } catch {
        /* the server may be restarting; keep polling */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [running, load]);

  const counts = useMemo(() => {
    const map = new Map<SourceCategory, number>();
    for (const item of bundle?.items ?? []) {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [bundle]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (bundle?.items ?? []).filter((item) => {
      if (lane && item.category !== lane) return false;
      if (!q) return true;
      return [item.titleZh, item.title, item.summaryZh, item.sourceName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [bundle, lane, query]);

  const selected = useMemo(
    () => visible.find((i) => i.id === selectedId) ?? null,
    [visible, selectedId],
  );

  const select = useCallback((item: FeedItem, open = true) => {
    setSelectedId(item.id);
    setReadIds(markRead(item.id));
    if (open) setReaderOpen(true);
    requestAnimationFrame(() =>
      document.getElementById(`row-${item.id}`)?.scrollIntoView({ block: "nearest" }),
    );
  }, []);

  const openById = useCallback(
    (id: string) => {
      const item = bundle?.items.find((i) => i.id === id);
      if (!item) return;
      if (!visible.some((i) => i.id === id)) {
        setLane(null);
        setQuery("");
      }
      select(item);
    },
    [bundle, visible, select],
  );

  useEffect(() => {
    if (selected || visible.length === 0) return;
    if (window.matchMedia(DESKTOP_QUERY).matches) select(visible[0], false);
  }, [selected, visible, select]);

  const save = useCallback((item: FeedItem) => {
    addToQueue(toQueueItem(item, originals.current[item.id]));
    setSavedIds((prev) => new Set(prev).add(item.id));
  }, []);

  const favorite = useCallback((item: FeedItem) => {
    const on = toggleFavorite(toQueueItem(item, originals.current[item.id]));
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
  }, []);

  const remember = useCallback((id: string, blocks: ContentBlock[]) => {
    originals.current[id] = blocks;
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = visible.findIndex((i) => i.id === selectedId);
      if (e.key === "j") {
        const next = visible[Math.min(idx + 1, visible.length - 1)];
        if (next) select(next, false);
      } else if (e.key === "k") {
        const prev = visible[Math.max(idx - 1, 0)];
        if (prev) select(prev, false);
      } else if (e.key === "o" && selected) {
        window.open(selected.url, "_blank", "noopener,noreferrer");
      } else if (e.key === "s" && selected) {
        save(selected);
      } else if (e.key === "f" && selected) {
        favorite(selected);
      } else if (e.key === "Escape") {
        closeReader();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, selected, select, save, favorite, closeReader]);

  const meta =
    sync?.running
      ? `${syncMessage(sync)}　上次的内容可以照常阅读。`
      : bundle?.generatedAt
        ? `共 ${bundle.items.length} 条，上次同步于 ${absoluteDate(bundle.generatedAt)}`
        : "";
  const translator = bundle?.translator ?? sync?.translator ?? null;

  return (
    <div className="feed">
      <PullToRefresh
        className="list-pane"
        aria-label="今日条目"
        onRefresh={startSync}
        refreshing={running}
        disabled={status !== "ready"}
      >
        <header className="today">
          <div className="today__head">
            <h1 className="today__date" suppressHydrationWarning>
              {today.date}
              <span className="today__weekday">{today.weekday}</span>
            </h1>
            <button
              type="button"
              className="button button--small today__sync"
              disabled={status !== "ready" || running}
              onClick={() => void startSync()}
            >
              {running ? "同步中…" : "立即同步"}
            </button>
          </div>
          <p className="today__meta" role="status">
            {meta}
            {bundle?.generatedAt && !running ? (
              <span className="today__pull-hint"> · 下拉刷新</span>
            ) : null}
          </p>

          <div className="budget">
            <p className="budget__title">按这个顺序扫一遍，大约 30 分钟</p>
            <ol
              className="budget__bar"
              style={{
                gridTemplateColumns: LANES.map((l) => `minmax(52px, ${l.minutes}fr)`).join(" "),
              }}
            >
              {LANES.map((l, i) => (
                <li key={l.id} className={`lane-${l.id}`}>
                  <button
                    type="button"
                    className="budget__seg"
                    aria-pressed={lane === l.id}
                    onClick={() => setLane(lane === l.id ? null : l.id)}
                  >
                    <span className="budget__name">
                      <span className="budget__step">{i + 1}</span>
                      {l.label}
                    </span>
                    <span className="budget__count">{counts.get(l.id) ?? 0} 条</span>
                    <span className="budget__count">{l.minutes} 分钟</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="list-tools">
            <input
              type="search"
              className="search"
              placeholder="搜索标题、摘要或来源"
              aria-label="搜索条目"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {lane ? (
              <button type="button" className="button button--small" onClick={() => setLane(null)}>
                显示全部
              </button>
            ) : null}
          </div>
        </header>

        {error ? <p className="list-note list-note--error">{error}</p> : null}
        {bundle && !translator ? (
          <p className="list-note">
            未配置翻译密钥时外文保持原文。需要中文时打开文章点「翻译成中文」（「设置」里填 DeepSeek API Key）。
          </p>
        ) : null}
        {status === "loading" && !bundle ? (
          <p className="list-note">正在读取上次同步的内容…</p>
        ) : null}
        {bundle && bundle.items.length === 0 ? (
          <p className="list-note">
            {sync?.running
              ? "第一次同步正在进行，几分钟后条目会出现在这里。"
              : "还没有内容。下拉刷新，从官方来源拉取今天的条目。"}
          </p>
        ) : null}
        {bundle && bundle.items.length > 0 && visible.length === 0 ? (
          <p className="list-note">没有符合条件的条目。换个关键词，或点「显示全部」。</p>
        ) : null}

        <ul className="rows">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                id={`row-${item.id}`}
                className={`row lane-${item.category}`}
                aria-current={item.id === selectedId ? "true" : undefined}
                data-read={readIds.has(item.id) ? "true" : undefined}
                onClick={() => select(item)}
              >
                <span className="row__meta">
                  <span className="row__source">{item.sourceName}</span>
                  <span className="row__time">{relativeTime(item, now)}</span>
                  <span className="row__flags">
                    {item.fullText ? <span className="row__flag">全文</span> : null}
                    {savedIds.has(item.id) ? <span className="row__flag">已存</span> : null}
                    {favoriteIds.has(item.id) ? <span className="row__flag">收藏</span> : null}
                  </span>
                </span>
                <span className="row__title">{item.titleZh || item.title}</span>
                {item.summaryZh && item.summaryZh !== item.titleZh ? (
                  <span className="row__summary">{item.summaryZh}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </PullToRefresh>

      <ArticleReader
        item={selected}
        now={now}
        open={readerOpen}
        saved={selected ? savedIds.has(selected.id) : false}
        favorited={selected ? favoriteIds.has(selected.id) : false}
        onClose={closeReader}
        onSave={() => selected && save(selected)}
        onFavorite={() => selected && favorite(selected)}
        onOpenRelated={openById}
        onOriginal={remember}
      />
    </div>
  );
}
