import { createHash } from "crypto";
import { XMLParser } from "fast-xml-parser";
import {
  blocksLength,
  capBlocks,
  COMPLIANCE,
  decodeEntities,
  htmlToBlocks,
  politeFetch,
  truncateExcerpt,
} from "./compliance";
import { attachReadmes } from "./enrich";
import { mapPool } from "./pool";
import { attachRelated } from "./related";
import { keepItem } from "./relevance";
import { getAllSources } from "./userSources";
import type {
  ChannelHealth,
  ContentBlock,
  FeedItem,
  ItemFact,
  SourceDef,
  SourceSyncResult,
} from "./types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function makeId(sourceId: string, url: string, title: string): string {
  return createHash("sha256")
    .update(`${sourceId}|${url}|${title}`)
    .digest("hex")
    .slice(0, 16);
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pickText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node === "object" && node && "#text" in node) {
    return String((node as { "#text": unknown })["#text"] ?? "");
  }
  return "";
}

function pickRssLink(item: Record<string, unknown>): string {
  const link = item?.link;
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    for (const l of link) {
      if (typeof l === "string" && l) return l;
      if (l && typeof l === "object" && "@_href" in l) {
        return String((l as { "@_href": string })["@_href"]);
      }
    }
  }
  if (link && typeof link === "object" && "@_href" in link) {
    return String((link as { "@_href": string })["@_href"]);
  }
  return pickText(item?.guid);
}

function normalizeDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Plain text (arXiv/HF abstracts) keeps its line breaks; HTML goes through htmlToBlocks. */
function toBlocks(body: string): ContentBlock[] {
  if (!/<[a-z!/][^>]*>/i.test(body)) {
    return decodeEntities(body)
      .split(/\n\s*\n/)
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((text) => ({ type: "p" as const, text }));
  }
  return htmlToBlocks(body);
}

/**
 * arXiv serves its HTML papers without frame restrictions; abs pages and HF paper
 * pages forbid framing, so papers are shown through the HTML version.
 */
function embedUrlFor(source: SourceDef, url: string): string | undefined {
  const paper =
    url.match(/^https:\/\/arxiv\.org\/abs\/([^?#]+)$/) ?? url.match(/^https:\/\/huggingface\.co\/papers\/([\d.]+)$/);
  if (paper) return `https://arxiv.org/html/${paper[1]}`;
  return source.embed && /^https?:\/\//.test(url) ? url : undefined;
}

function baseItem(
  source: SourceDef,
  title: string,
  url: string,
  summary: string,
  publishedAt: string | null,
  fetchedAt: string,
  body = "",
): FeedItem {
  const t = truncateExcerpt(title.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, "")).slice(0, 300);
  const s = truncateExcerpt(summary || body);
  const blocks = capBlocks(toBlocks(body || summary), COMPLIANCE.maxContentChars);
  // A paper abstract can be long, but it is still only the abstract.
  const isPaper = source.category === "papers" || url.includes("arxiv.org/abs/");
  const fullText = !isPaper && blocksLength(blocks) >= COMPLIANCE.minFullTextChars;
  return {
    id: makeId(source.id, url, t),
    sourceId: source.id,
    sourceName: source.name,
    category: source.category,
    title: t,
    titleZh: t,
    url,
    summary: s,
    summaryZh: s || t,
    publishedAt,
    fetchedAt,
    fullText,
    content: blocks.length ? blocks : undefined,
    embedUrl: fullText ? undefined : embedUrlFor(source, url),
  };
}

function longest(...candidates: string[]): string {
  return candidates.reduce((best, c) => (c.length > best.length ? c : best), "");
}

function parseRssOrAtom(source: SourceDef, xml: string, fetchedAt: string): FeedItem[] {
  const doc = xmlParser.parse(xml);
  const items: FeedItem[] = [];

  const rssItems = asArray(doc?.rss?.channel?.item) as Array<Record<string, unknown>>;
  for (const item of rssItems) {
    const title = pickText(item?.title);
    const link = pickRssLink(item);
    if (!title || !link) continue;
    const description = pickText(item?.description) || pickText(item?.summary);
    items.push(
      baseItem(
        source,
        title,
        link,
        description,
        normalizeDate(pickText(item?.pubDate) || pickText(item?.published) || null),
        fetchedAt,
        longest(pickText(item?.["content:encoded"]), description),
      ),
    );
  }

  const atomEntries = asArray(doc?.feed?.entry);
  for (const entry of atomEntries) {
    const title = pickText(entry?.title);
    const links = asArray(entry?.link) as Array<Record<string, string>>;
    const htmlLink = links.find(
      (l) => l?.["@_type"] === "text/html" || l?.["@_rel"] === "alternate",
    );
    const absLink = links.find((l) =>
      String(l?.["@_href"] || "").includes("arxiv.org/abs/"),
    );
    const href =
      String(htmlLink?.["@_href"] || absLink?.["@_href"] || links[0]?.["@_href"] || "") ||
      pickText(entry?.id);
    if (!title || !href) continue;
    const url = href.replace(/^http:\/\/(arxiv\.org|rss\.arxiv\.org)/, "https://$1");
    const summary = pickText(entry?.summary);
    const item = baseItem(
      source,
      title,
      url,
      summary,
      normalizeDate(pickText(entry?.published) || pickText(entry?.updated) || null),
      fetchedAt,
      longest(pickText(entry?.content), summary),
    );
    if (url.includes("arxiv.org/abs/")) item.facts = arxivFacts(entry, url);
    items.push(item);
  }

  return items
    .filter((i) => keepItem(source, i.title, i.summary))
    .slice(0, source.maxItems);
}

function arxivFacts(entry: Record<string, unknown>, url: string): ItemFact[] {
  const facts: ItemFact[] = [];
  const authors = asArray(entry?.author as unknown)
    .map((a) => pickText((a as { name?: unknown })?.name))
    .filter(Boolean);
  if (authors.length) {
    facts.push({
      label: "作者",
      value: authors.length > 6 ? `${authors.slice(0, 6).join(", ")} 等 ${authors.length} 人` : authors.join(", "),
    });
  }
  const primary = (entry?.["arxiv:primary_category"] as { "@_term"?: string } | undefined)?.["@_term"];
  if (primary) facts.push({ label: "主分类", value: primary });
  const comment = pickText(entry?.["arxiv:comment"]);
  if (comment) facts.push({ label: "备注", value: comment.replace(/\s+/g, " ").slice(0, 200) });
  facts.push({ label: "PDF", value: "arXiv PDF", href: url.replace("/abs/", "/pdf/") });
  return facts;
}

function formatCount(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)} 亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)} 万`;
  return String(n);
}

const TASK_LABEL: Record<string, string> = {
  "text-generation": "文本生成",
  "image-text-to-text": "图文理解",
  "text-to-image": "文生图",
  "text-to-video": "文生视频",
  "image-to-video": "图生视频",
  "text-to-speech": "语音合成",
  "automatic-speech-recognition": "语音识别",
  "feature-extraction": "向量嵌入",
  "sentence-similarity": "句向量",
  "image-to-image": "图像编辑",
  "any-to-any": "全模态",
  "audio-text-to-text": "音频理解",
  "video-text-to-text": "视频理解",
  "robotics": "机器人",
  "text-ranking": "重排序",
};

function slugTitle(slug: string): string {
  const words = decodeURIComponent(slug).replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug;
}

function compileUrlPattern(source: SourceDef): RegExp | null {
  if (!source.urlPattern) return null;
  try {
    return new RegExp(source.urlPattern, "i");
  } catch {
    return null;
  }
}

/** Parses a crawler sitemap; only matching locs (+ lastmod) become items — no page bodies. */
function parseSitemap(source: SourceDef, xml: string, fetchedAt: string): FeedItem[] {
  const re = compileUrlPattern(source);
  if (!re) return [];

  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap((m) => {
    const loc = m[1].match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
    if (!loc || !re.test(loc)) return [];
    const lastmod = normalizeDate(m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? null);
    const match = loc.match(re);
    const slug = match?.[match.length - 1] || loc.split("/").filter(Boolean).at(-1) || "item";
    return [{ loc, lastmod, slug: String(slug) }];
  });

  // Prefer zh DeepSeek URLs when both /news/ and /en/news/ exist — pattern should already exclude /en/.
  const seen = new Set<string>();
  const deduped = entries.filter((e) => {
    if (seen.has(e.loc)) return false;
    seen.add(e.loc);
    return true;
  });
  deduped.sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? ""));

  return deduped.slice(0, source.maxItems).map((e) => {
    const title = slugTitle(e.slug);
    return baseItem(
      source,
      title,
      e.loc,
      `${source.name}有更新。站点未提供正文 RSS，这里只显示标题与链接，请打开原文阅读。`,
      e.lastmod,
      fetchedAt,
    );
  });
}

/**
 * Lab news/blog index HTML: extract allowlisted article links only (same spirit as sitemap).
 * Never reads article page bodies.
 */
function parseListing(source: SourceDef, html: string, fetchedAt: string): FeedItem[] {
  const re = compileUrlPattern(source);
  if (!re) return [];

  let base: URL;
  try {
    base = new URL(source.endpoint);
  } catch {
    return [];
  }

  const found = new Map<string, string>(); // url -> title hint
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = m[1]?.trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    try {
      const abs = new URL(href, base).toString().replace(/#.*$/, "");
      if (!re.test(abs)) continue;
      const text = stripTags(m[2]).replace(/\s+/g, " ").trim();
      const prev = found.get(abs);
      if (!prev || (text && text.length > prev.length && text.length < 120)) {
        found.set(abs, text);
      }
    } catch {
      /* skip bad href */
    }
  }

  const items: FeedItem[] = [];
  for (const [url, text] of found) {
    const match = url.match(re);
    const slug = match?.[match.length - 1] || url.split("/").filter(Boolean).at(-1) || "item";
    const title = text && text.length >= 2 ? text : slugTitle(String(slug));
    items.push(
      baseItem(
        source,
        title,
        url,
        `${source.name}有更新。站点未提供正文 RSS，这里只显示标题与链接，请打开原文阅读。`,
        null,
        fetchedAt,
      ),
    );
  }
  return items.slice(0, source.maxItems);
}

function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ");
}

function parseHfDailyPapers(source: SourceDef, data: unknown, fetchedAt: string): FeedItem[] {
  if (!Array.isArray(data)) return [];
  const items: FeedItem[] = [];
  for (const row of data.slice(0, source.maxItems)) {
    const paper = (row as { paper?: Record<string, unknown> })?.paper ?? row;
    const p = paper as {
      id?: string;
      title?: string;
      summary?: string;
      publishedAt?: string;
      upvotes?: number;
      projectPage?: string;
      githubRepo?: string;
      authors?: { name?: string }[];
      organization?: { fullname?: string; name?: string };
    };
    if (!p.id || !p.title) continue;
    const item = baseItem(
      source,
      p.title,
      `https://huggingface.co/papers/${p.id}`,
      p.summary ?? "",
      normalizeDate(p.publishedAt ?? null),
      fetchedAt,
    );
    const facts: ItemFact[] = [];
    const authors = (p.authors ?? []).map((a) => a.name).filter((n): n is string => Boolean(n));
    if (authors.length) {
      facts.push({
        label: "作者",
        value: authors.length > 6 ? `${authors.slice(0, 6).join(", ")} 等 ${authors.length} 人` : authors.join(", "),
      });
    }
    const org = p.organization?.fullname || p.organization?.name;
    if (org) facts.push({ label: "机构", value: org });
    if (typeof p.upvotes === "number") facts.push({ label: "社区点赞", value: String(p.upvotes) });
    if (p.githubRepo?.startsWith("https://")) facts.push({ label: "代码", value: p.githubRepo.replace(/^https:\/\/(www\.)?/, ""), href: p.githubRepo });
    if (p.projectPage?.startsWith("https://")) facts.push({ label: "项目页", value: p.projectPage.replace(/^https:\/\/(www\.)?/, ""), href: p.projectPage });
    facts.push({ label: "arXiv", value: p.id, href: `https://arxiv.org/abs/${p.id}` });
    item.facts = facts;
    items.push(item);
  }
  return items;
}

type HfModelRow = {
  id?: string;
  modelId?: string;
  likes?: number;
  downloads?: number;
  pipeline_tag?: string;
  library_name?: string;
  createdAt?: string;
  tags?: string[];
};

function parseHfModels(source: SourceDef, data: unknown, fetchedAt: string): FeedItem[] {
  if (!Array.isArray(data)) return [];
  const isOrgFeed = source.id.startsWith("hf-org-");
  return (data as HfModelRow[]).slice(0, source.maxItems).flatMap((m) => {
    const modelId = m.id || m.modelId;
    if (!modelId) return [];
    const [org] = modelId.split("/");
    const task = m.pipeline_tag ? (TASK_LABEL[m.pipeline_tag] ?? m.pipeline_tag) : null;
    const license = m.tags?.find((t) => t.startsWith("license:"))?.slice(8);
    const created = normalizeDate(m.createdAt ?? null);

    const parts = [`${org} 在 Hugging Face 发布的${task ? `${task}` : ""}模型`];
    if (license) parts.push(`许可证 ${license}`);
    if (typeof m.likes === "number") parts.push(`${formatCount(m.likes)} 人点赞`);
    if (typeof m.downloads === "number") parts.push(`近 30 天下载 ${formatCount(m.downloads)} 次`);

    const item = baseItem(
      source,
      modelId,
      `https://huggingface.co/${modelId}`,
      `${parts.join("，")}。`,
      isOrgFeed ? created : null,
      fetchedAt,
    );
    const facts: ItemFact[] = [];
    if (task) facts.push({ label: "任务", value: task });
    if (license) facts.push({ label: "许可证", value: license });
    if (m.library_name) facts.push({ label: "框架", value: m.library_name });
    if (typeof m.likes === "number") facts.push({ label: "点赞", value: formatCount(m.likes) });
    if (typeof m.downloads === "number") facts.push({ label: "近 30 天下载", value: formatCount(m.downloads) });
    if (created) facts.push({ label: "创建于", value: created.slice(0, 10) });
    item.facts = facts;
    return [item];
  });
}

type GhRepo = {
  full_name?: string;
  html_url?: string;
  description?: string | null;
  fork?: boolean;
  archived?: boolean;
  stargazers_count?: number;
  language?: string | null;
  created_at?: string;
  homepage?: string | null;
  license?: { spdx_id?: string } | null;
};

const GH_REPO_MAX_AGE_DAYS = 120;
const GH_REPO_MIN_STARS = 20;

/** New public repositories of a lab; the README is attached later as the body. */
function parseGithubRepos(source: SourceDef, data: unknown, fetchedAt: string): FeedItem[] {
  if (!Array.isArray(data)) return [];
  const cutoff = Date.now() - GH_REPO_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return (data as GhRepo[])
    .filter(
      (r) =>
        r.full_name &&
        r.html_url?.startsWith("https://github.com/") &&
        !r.fork &&
        !r.archived &&
        (r.stargazers_count ?? 0) >= GH_REPO_MIN_STARS &&
        r.created_at &&
        new Date(r.created_at).getTime() >= cutoff,
    )
    .slice(0, source.maxItems)
    .map((r) => {
      const org = r.full_name!.split("/")[0];
      const item = baseItem(
        source,
        r.full_name!,
        r.html_url!,
        r.description?.trim() || `${org} 在 GitHub 新建的公开项目。`,
        normalizeDate(r.created_at ?? null),
        fetchedAt,
      );
      const facts: ItemFact[] = [];
      if (typeof r.stargazers_count === "number") facts.push({ label: "星标", value: formatCount(r.stargazers_count) });
      if (r.language) facts.push({ label: "语言", value: r.language });
      const license = r.license?.spdx_id;
      if (license && license !== "NOASSERTION") facts.push({ label: "许可证", value: license });
      if (r.created_at) facts.push({ label: "创建于", value: r.created_at.slice(0, 10) });
      if (r.homepage?.startsWith("https://")) {
        facts.push({ label: "主页", value: r.homepage.replace(/^https:\/\/(www\.)?/, ""), href: r.homepage });
      }
      item.facts = facts;
      return item;
    });
}

export async function syncOneSource(source: SourceDef): Promise<{
  items: FeedItem[];
  result: SourceSyncResult;
}> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await politeFetch(source.endpoint);
    if (!res.ok) {
      return {
        items: [],
        result: {
          sourceId: source.id,
          sourceName: source.name,
          category: source.category,
          ok: false,
          health: res.status === 403 || res.status === 401 ? "blocked_policy" : "error",
          itemCount: 0,
          latestPublishedAt: null,
          error: `HTTP ${res.status}`,
          fetchedAt,
        },
      };
    }

    let items: FeedItem[] = [];
    if (source.kind === "api") {
      const json = await res.json();
      if (source.id === "hf-daily-papers") {
        items = parseHfDailyPapers(source, json, fetchedAt);
      } else if (
        source.id === "hf-models-trending" ||
        source.id === "hf-robotics-models" ||
        source.id.startsWith("hf-org-")
      ) {
        items = parseHfModels(source, json, fetchedAt);
      } else if (source.id.startsWith("gh-org-")) {
        items = parseGithubRepos(source, json, fetchedAt);
      }
    } else if (source.kind === "sitemap") {
      items = parseSitemap(source, await res.text(), fetchedAt);
    } else if (source.kind === "listing") {
      items = parseListing(source, await res.text(), fetchedAt);
    } else {
      items = parseRssOrAtom(source, await res.text(), fetchedAt);
    }

    const latest = items
      .map((i) => i.publishedAt)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1);

    let health: ChannelHealth = "active";
    if (items.length === 0) health = "slow";
    else if (latest) {
      const ageDays =
        (Date.now() - new Date(latest).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 60) health = "dormant";
      else if (ageDays > 21) health = "slow";
    }

    return {
      items,
      result: {
        sourceId: source.id,
        sourceName: source.name,
        category: source.category,
        ok: true,
        health,
        itemCount: items.length,
        latestPublishedAt: latest ?? null,
        error: items.length === 0 ? "端点可达但本批无条目" : undefined,
        fetchedAt,
      },
    };
  } catch (err) {
    return {
      items: [],
      result: {
        sourceId: source.id,
        sourceName: source.name,
        category: source.category,
        ok: false,
        health: "error",
        itemCount: 0,
        latestPublishedAt: null,
        error: err instanceof Error ? err.message : "Unknown error",
        fetchedAt,
      },
    };
  }
}

/** Kept for API compatibility; sync no longer auto-translates. */
export function lastTranslationError(): string | null {
  return null;
}

export type SyncProgress = {
  phase: "fetching" | "readmes" | "linking";
  done: number;
  total: number;
};

export async function syncAllSources(onProgress?: (p: SyncProgress) => void): Promise<{
  items: FeedItem[];
  results: SourceSyncResult[];
}> {
  const sources = getAllSources();
  const allItems: FeedItem[] = [];
  const results: SourceSyncResult[] = [];
  const seenUrls = new Set<string>();

  let fetched = 0;
  onProgress?.({ phase: "fetching", done: 0, total: sources.length });
  const batches = await mapPool(sources, COMPLIANCE.syncConcurrency, async (source) => {
    const out = await syncOneSource(source);
    fetched += 1;
    onProgress?.({ phase: "fetching", done: fetched, total: sources.length });
    return out;
  });

  for (const { items, result } of batches) {
    for (const item of items) {
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      allItems.push(item);
    }
    results.push(result);
  }

  allItems.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });

  onProgress?.({ phase: "readmes", done: 0, total: Math.min(allItems.length, COMPLIANCE.enrichMaxItems) });
  const withReadmes = await attachReadmes(allItems, (done, total) =>
    onProgress?.({ phase: "readmes", done, total }),
  );
  // No bulk translation — open an article and tap「翻译成中文」to spend tokens per item.
  onProgress?.({ phase: "linking", done: 0, total: allItems.length });
  return { items: attachRelated(withReadmes), results };
}

export type FeedBundle = {
  generatedAt: string;
  complianceNote: string;
  items: FeedItem[];
  results: SourceSyncResult[];
};

export async function buildFeedBundle(onProgress?: (p: SyncProgress) => void): Promise<FeedBundle> {
  const { items, results } = await syncAllSources(onProgress);
  return {
    generatedAt: new Date().toISOString(),
    complianceNote:
      "Allowlisted official RSS/Atom/public APIs only. Bodies are shown only when the publisher's own feed includes them; web pages are never scraped.",
    items,
    results,
  };
}
