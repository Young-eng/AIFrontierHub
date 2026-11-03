import type { ContentBlock, FeedItem, QueueItem } from "./types";

export function toQueueItem(item: FeedItem, content?: ContentBlock[]): Omit<QueueItem, "savedAt"> {
  return {
    id: item.id,
    title: item.title,
    titleZh: item.titleZh || item.title,
    url: item.url,
    sourceName: item.sourceName,
    summaryZh: item.summaryZh || item.summary || item.titleZh || item.title,
    summary: item.summary,
    category: item.category,
    publishedAt: item.publishedAt,
    fullText: item.fullText,
    content: content ?? item.content,
    facts: item.facts,
    embedUrl: item.embedUrl,
    contentLabel: item.contentLabel,
  };
}

/** Prefer the live feed copy, and keep a stored body for when the feed no longer has it. */
export function savedToFeedItem(saved: QueueItem, live?: FeedItem): FeedItem {
  if (live) {
    return {
      ...live,
      content: live.content ?? saved.content,
      embedUrl: live.embedUrl ?? saved.embedUrl,
      facts: live.facts?.length ? live.facts : saved.facts,
      contentLabel: live.contentLabel ?? saved.contentLabel,
      fullText: live.fullText || Boolean(saved.fullText),
    };
  }
  return {
    id: saved.id,
    sourceId: "saved",
    sourceName: saved.sourceName,
    category: saved.category ?? "news",
    title: saved.title,
    titleZh: saved.titleZh || saved.title,
    url: saved.url,
    summary: saved.summary || saved.summaryZh,
    summaryZh: saved.summaryZh || saved.summary || saved.titleZh,
    publishedAt: saved.publishedAt ?? null,
    fetchedAt: saved.savedAt,
    fullText: Boolean(saved.fullText),
    content: saved.content,
    facts: saved.facts,
    embedUrl: saved.embedUrl,
    contentLabel: saved.contentLabel,
  };
}
