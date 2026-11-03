import type { FeedItem } from "./types";

export function absoluteDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function relativeTime(item: FeedItem, now: number): string {
  if (!item.publishedAt) return item.category === "models" ? "热门榜" : "时间未知";
  const minutes = Math.round((now - new Date(item.publishedAt).getTime()) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return absoluteDate(item.publishedAt);
}

export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const full = `${u.host.replace(/^www\./, "")}${path}`;
    return full.length > 72 ? `${full.slice(0, 71)}…` : full;
  } catch {
    return url;
  }
}

/** Same gate as the server: little CJK and plenty of Latin letters. */
export function looksForeign(text: string): boolean {
  const sample = text.slice(0, 400);
  const cjk = (sample.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  return cjk < 8 && latin >= 12;
}
