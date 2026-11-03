"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArticleReader } from "@/components/ArticleReader";
import { useReaderBack } from "@/hooks/useReaderBack";
import { FAVORITES_EVENT, loadFavorites, patchFavorite, removeFavorite, toggleFavorite } from "@/lib/favorites";
import { relativeTime } from "@/lib/format";
import { loadQueue, patchQueueItem, QUEUE_EVENT, removeFromQueue, addToQueue } from "@/lib/queue";
import { savedToFeedItem, toQueueItem } from "@/lib/savedItem";
import type { ContentBlock, FeedItem, QueueItem } from "@/lib/types";

const DESKTOP_QUERY = "(min-width: 901px)";

const COPY = {
  queue: {
    title: "待读",
    lead: "把想稍后精读的内容留在这里，已保存的正文可继续阅读。",
    empty: "看到感兴趣的内容时，打开文章并点「加入待读」。",
    remove: "读完，移出",
  },
  favorites: {
    title: "收藏",
    lead: "保留值得回看的研究与文章，收藏不会随后续同步被清除。",
    empty: "打开感兴趣的内容，点「收藏」就能在这里找到。",
    remove: "取消收藏",
  },
} as const;

export function SavedExplorer({ kind }: { kind: "queue" | "favorites" }) {
  const copy = COPY[kind];
  const [saved, setSaved] = useState<QueueItem[] | null>(null);
  const [live, setLive] = useState<FeedItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [queueIds, setQueueIds] = useState<Set<string>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const closeReader = useReaderBack(readerOpen, () => setReaderOpen(false));

  const reload = useCallback(() => {
    setSaved(kind === "queue" ? loadQueue() : loadFavorites());
    setQueueIds(new Set(loadQueue().map((q) => q.id)));
    setFavoriteIds(new Set(loadFavorites().map((q) => q.id)));
    setNow(Date.now());
  }, [kind]);

  useEffect(() => {
    reload();
    const onStore = () => reload();
    window.addEventListener(QUEUE_EVENT, onStore);
    window.addEventListener(FAVORITES_EVENT, onStore);
    window.addEventListener("storage", onStore);
    return () => {
      window.removeEventListener(QUEUE_EVENT, onStore);
      window.removeEventListener(FAVORITES_EVENT, onStore);
      window.removeEventListener("storage", onStore);
    };
  }, [reload]);

  useEffect(() => {
    fetch("/api/feed", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: FeedItem[] } | null) => setLive(data?.items ?? []))
      .catch(() => setLive([]));
  }, []);

  const items = useMemo(() => {
    const byId = new Map(live.map((item) => [item.id, item]));
    return (saved ?? []).map((row) => savedToFeedItem(row, byId.get(row.id)));
  }, [saved, live]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.titleZh, item.title, item.summaryZh, item.sourceName].join(" ").toLowerCase().includes(q),
    );
  }, [items, query]);

  const selected = useMemo(
    () => visible.find((item) => item.id === selectedId) ?? null,
    [visible, selectedId],
  );

  const select = useCallback((item: FeedItem, open = true) => {
    setSelectedId(item.id);
    if (open) setReaderOpen(true);
    requestAnimationFrame(() =>
      document.getElementById(`row-${item.id}`)?.scrollIntoView({ block: "nearest" }),
    );
  }, []);

  useEffect(() => {
    if (selected || visible.length === 0) return;
    if (window.matchMedia(DESKTOP_QUERY).matches) select(visible[0], false);
  }, [selected, visible, select]);

  const remember = useCallback(
    (id: string, content: ContentBlock[]) => {
      const item = items.find((row) => row.id === id);
      if (!item) return;
      const patch = {
        content,
        summary: item.summary,
        category: item.category,
        publishedAt: item.publishedAt,
        fullText: item.fullText,
        facts: item.facts,
        embedUrl: item.embedUrl,
        contentLabel: item.contentLabel,
      };
      if (kind === "queue") patchQueueItem(id, patch);
      else patchFavorite(id, patch);
    },
    [items, kind],
  );

  const save = useCallback((item: FeedItem) => {
    addToQueue(toQueueItem(item, item.content));
  }, []);

  const favorite = useCallback((item: FeedItem) => {
    toggleFavorite(toQueueItem(item, item.content));
  }, []);

  const remove = useCallback(
    (item: FeedItem) => {
      const next = kind === "queue" ? removeFromQueue(item.id) : removeFavorite(item.id);
      const idx = visible.findIndex((row) => row.id === item.id);
      const neighbor = visible[idx + 1] ?? visible[idx - 1];
      setSelectedId(neighbor && neighbor.id !== item.id ? neighbor.id : next[0]?.id ?? null);
      if (next.length === 0) setReaderOpen(false);
    },
    [kind, visible],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = visible.findIndex((item) => item.id === selectedId);
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

  return (
    <div className="feed">
      <section className="list-pane" aria-label={copy.title}>
        <header className="today">
          <div className="today__head">
            <h1 className="today__date">
              {copy.title}
              <span className="today__weekday">{saved ? `${saved.length} 条` : ""}</span>
            </h1>
          </div>
          <p className="today__meta">{copy.lead}</p>
          {saved && saved.length > 0 ? <div className="list-tools">
            <input
              type="search"
              className="search"
              placeholder="搜索标题、摘要或来源"
              aria-label="搜索条目"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div> : null}
        </header>

        {saved && saved.length === 0 ? (
          <section className="empty-state">
            <h2 className="empty-state__title">{kind === "queue" ? "留到有空时慢慢读" : "留住值得回看的内容"}</h2>
            <p className="empty-state__text">{copy.empty}</p>
            <Link href="/" className="button button--primary empty-state__action">去今日看看</Link>
          </section>
        ) : null}
        {saved && saved.length > 0 && visible.length === 0 ? (
          <p className="list-note">没有符合条件的条目。换个关键词。</p>
        ) : null}

        <ul className="rows">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                id={`row-${item.id}`}
                className={`row lane-${item.category}`}
                aria-current={item.id === selectedId ? "true" : undefined}
                onClick={() => select(item)}
              >
                <span className="row__meta">
                  <span className="row__source">{item.sourceName}</span>
                  <span className="row__time">{relativeTime(item, now)}</span>
                  <span className="row__flags">
                    {item.fullText ? <span className="row__flag">全文</span> : null}
                    {queueIds.has(item.id) ? <span className="row__flag">已存</span> : null}
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
      </section>

      <ArticleReader
        item={selected}
        now={now}
        open={readerOpen}
        saved={selected ? queueIds.has(selected.id) : false}
        favorited={selected ? favoriteIds.has(selected.id) : false}
        onClose={closeReader}
        onSave={() => selected && save(selected)}
        onFavorite={() => selected && favorite(selected)}
        onOriginal={remember}
        extraAction={selected ? { label: copy.remove, onClick: () => remove(selected) } : undefined}
      />
    </div>
  );
}
