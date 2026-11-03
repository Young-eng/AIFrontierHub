import { readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import { getEnabledSources, SOURCES } from "./sources";
import type { SourceCategory, SourceDef } from "./types";

const filePath = path.join(process.cwd(), "data", "user-sources.json");
const UA =
  "AITrendingBot/0.1 (+https://localhost/compliance; metadata-only aggregator; respectful)";

export function loadUserSources(): SourceDef[] {
  try {
    const list = JSON.parse(readFileSync(filePath, "utf8")) as SourceDef[];
    return list.map((s) => ({ ...s, custom: true }));
  } catch {
    return [];
  }
}

async function saveUserSources(list: SourceDef[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(list, null, 2), "utf8");
}

/** Built-in plus user-added sources; the single list the ingest layer may fetch. */
export function getAllSources(): SourceDef[] {
  return [...getEnabledSources(), ...loadUserSources().filter((s) => s.enabled)];
}

type FeedProbe = { kind: "rss" | "atom"; title: string; items: string[] };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "object") return String((node as { "#text"?: unknown })["#text"] ?? "");
  return String(node);
}

function probeFeed(body: string): FeedProbe | null {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(body.slice(0, 2000))) return null;
  try {
    const doc = parser.parse(body);
    if (doc?.rss?.channel) {
      const items = [].concat(doc.rss.channel.item ?? []) as Record<string, unknown>[];
      return { kind: "rss", title: text(doc.rss.channel.title), items: items.map((i) => text(i.title)) };
    }
    if (doc?.feed) {
      const entries = [].concat(doc.feed.entry ?? []) as Record<string, unknown>[];
      return { kind: "atom", title: text(doc.feed.title), items: entries.map((e) => text(e.title)) };
    }
  } catch {
    return null;
  }
  return null;
}

/** <link rel="alternate" type="application/rss+xml"> — standard feed autodiscovery. */
function findFeedLinks(html: string, base: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      out.push(new URL(href, base).toString());
    } catch {
      /* ignore malformed href */
    }
  }
  return out;
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; body: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/html;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
    return { ok: res.ok, status: res.status, body: await res.text(), finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

export type AddSourceResult =
  | { ok: true; source: SourceDef; preview: string[] }
  | { ok: false; error: string };

function slug(host: string): string {
  return host.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

/**
 * Accepts a feed URL or a site homepage. A homepage is read once, only to find the
 * feed it advertises; only RSS/Atom ever becomes a source.
 */
export async function addUserSource(input: string, category: SourceCategory): Promise<AddSourceResult> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: "这不是一个有效的网址，请粘贴完整地址，例如 https://example.com/blog" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "只支持 https 开头的网址。" };
  }
  if (/^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(url.hostname) || !url.hostname.includes(".")) {
    return { ok: false, error: "只能添加公网网站的域名地址。" };
  }

  let feedUrl = url.toString();
  let first: Awaited<ReturnType<typeof fetchText>>;
  try {
    first = await fetchText(feedUrl);
  } catch {
    return { ok: false, error: "这个网址打不开或超时了，确认地址正确后再试。" };
  }
  if (!first.ok) {
    return { ok: false, error: `对方返回 HTTP ${first.status}，没法读取。` };
  }

  let probe = probeFeed(first.body);
  if (!probe) {
    const candidates = findFeedLinks(first.body, first.finalUrl).filter((c) => c.startsWith("https:"));
    for (const candidate of candidates.slice(0, 3)) {
      try {
        const res = await fetchText(candidate);
        const p = res.ok ? probeFeed(res.body) : null;
        if (p) {
          probe = p;
          feedUrl = res.finalUrl;
          break;
        }
      } catch {
        /* try the next advertised feed */
      }
    }
  } else {
    feedUrl = first.finalUrl;
  }

  if (!probe) {
    return {
      ok: false,
      error: "这个网站没有公开 RSS 或 Atom，按合规底线不能抓它的网页。可以换成它的博客页或 feed 地址再试。",
    };
  }
  if (probe.items.length === 0) {
    return { ok: false, error: "找到了 feed，但里面没有任何条目，先不添加。" };
  }

  const host = new URL(feedUrl).host;
  const existing = [...SOURCES, ...loadUserSources()];
  if (existing.some((s) => s.endpoint === feedUrl)) {
    return { ok: false, error: "这个来源已经在列表里了。" };
  }

  const source: SourceDef = {
    id: `user-${slug(host)}-${Date.now().toString(36)}`,
    name: probe.title.trim().slice(0, 60) || host,
    kind: probe.kind,
    category,
    endpoint: feedUrl,
    homepage: `${url.protocol}//${url.host}/`,
    legalBasis: "你添加的公开 RSS/Atom（已自动验证）",
    maxItems: 8,
    enabled: true,
  };
  const current = loadUserSources().map(({ custom: _c, ...rest }) => rest);
  await saveUserSources([...current, source]);
  return { ok: true, source: { ...source, custom: true }, preview: probe.items.slice(0, 3) };
}

export async function removeUserSource(id: string): Promise<boolean> {
  const current = loadUserSources();
  const next = current.filter((s) => s.id !== id);
  if (next.length === current.length) return false;
  await saveUserSources(next.map(({ custom: _c, ...rest }) => rest));
  return true;
}
