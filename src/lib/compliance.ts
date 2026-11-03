import { endpointCandidates, MIRROR_HOSTS } from "./mirrors";
import { ENRICH_HOSTS } from "./sources";
import { getAllSources } from "./userSources";
import type { ContentBlock } from "./types";

export const USER_AGENT =
  "AITrendingBot/0.1 (+https://localhost/compliance; metadata-only aggregator; respectful)";

/** Hard caps to keep requests polite and excerpts short. */
export const COMPLIANCE = {
  /** ~一段话；仍远短于全文，避免实质转载。 */
  maxExcerptChars: 480,
  /** Bodies are shown only when the publisher's feed already contains them. */
  maxContentChars: 30_000,
  minFullTextChars: 900,
  /** Soft pause only when enriching the same host serially. */
  minGapMsBetweenRequests: 120,
  fetchTimeoutMs: 12_000,
  /** Parallel source fetches during sync. */
  syncConcurrency: 8,
  /** Parallel README / model-card fetches (capped separately). */
  enrichConcurrency: 4,
  /** Max items to enrich with README per sync (rest stay as abstracts). */
  enrichMaxItems: 24,
  maxRedirectsNote:
    "Follow at most platform-default redirects; never chase off-allowlist hosts for body content.",
} as const;

function buildAllowlistHosts(): Set<string> {
  return new Set([
    ...getAllSources().map((s) => new URL(s.endpoint).host),
    ...ENRICH_HOSTS,
    ...MIRROR_HOSTS,
  ]);
}

export function assertAllowlistedUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS endpoints are allowed");
  }
  const allowlistHosts = buildAllowlistHosts();
  if (!allowlistHosts.has(url.host)) {
    throw new Error(`Host not on allowlist: ${url.host}`);
  }
  return url;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  copy: "©",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

async function fetchOnce(
  endpoint: string,
  accept: string,
  timeoutMs: number,
): Promise<Response> {
  const url = assertAllowlistedUrl(endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: accept };
  // Unauthenticated GitHub API calls are limited to 60 an hour; a personal token lifts that.
  if (url.host === "api.github.com" && process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    return await fetch(endpoint, {
      headers,
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch with mirror fallback (HF → hf-mirror, arXiv API host swap).
 * First successful HTTP response wins; 4xx (except 408/429) is not retried on mirrors.
 */
export async function politeFetch(
  endpoint: string,
  accept = "application/rss+xml, application/atom+xml, application/json, application/xml, text/xml, */*;q=0.8",
): Promise<Response> {
  const candidates = endpointCandidates(endpoint);
  let lastError: unknown;
  let lastRes: Response | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    try {
      const res = await fetchOnce(url, accept, COMPLIANCE.fetchTimeoutMs);
      if (res.ok) return res;
      lastRes = res;
      // Auth / not-found: no point trying a mirror with the same path semantics wrong.
      if (res.status === 401 || res.status === 403 || res.status === 404) return res;
      // 408/429/5xx → try next candidate
    } catch (err) {
      lastError = err;
    }
  }

  if (lastRes) return lastRes;
  throw lastError instanceof Error ? lastError : new Error("Fetch failed");
}

export function stripHtml(input: string): string {
  return decodeEntities(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turns feed-supplied HTML into plain-text blocks. Output never contains markup,
 * so publisher HTML is never injected into our pages.
 */
export function htmlToBlocks(html: string): ContentBlock[] {
  const pres: string[] = [];
  let s = html
    .replace(/<(script|style|noscript|iframe|svg|figcaption|button|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner: string) => {
      pres.push(decodeEntities(inner.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")));
      return `\n\n\u0000PRE${pres.length - 1}\u0000\n\n`;
    });

  s = s
    .replace(/<h[1-6][^>]*>/gi, "\n\n\u0001H")
    .replace(/<li[^>]*>/gi, "\n\n\u0001L")
    .replace(/<blockquote[^>]*>/gi, "\n\n\u0001Q")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|section|article|header|footer|h[1-6]|li|ul|ol|blockquote|table|tr|figure|hr)[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  const blocks: ContentBlock[] = [];
  for (const chunk of decodeEntities(s).split(/\n\s*\n/)) {
    const pre = chunk.trim().match(/^\u0000PRE(\d+)\u0000$/);
    if (pre) {
      const code = pres[Number(pre[1])]?.replace(/^\n+|\s+$/g, "");
      if (code) blocks.push({ type: "pre", text: code });
      continue;
    }
    let type: ContentBlock["type"] = "p";
    let text = chunk;
    const marker = text.match(/^\s*\u0001([HLQ])/);
    if (marker) {
      type = marker[1] === "H" ? "h" : marker[1] === "L" ? "li" : "quote";
      text = text.replace(/^\s*\u0001[HLQ]/, "");
    }
    text = text.replace(/[\u0000\u0001]/g, "").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ type, text });
  }
  return blocks;
}

export function blocksLength(blocks: ContentBlock[]): number {
  return blocks.reduce((n, b) => n + b.text.length, 0);
}

/** Keeps whole blocks until the cap, so a stored body is never cut mid-sentence. */
export function capBlocks(blocks: ContentBlock[], maxChars: number): ContentBlock[] {
  const out: ContentBlock[] = [];
  let total = 0;
  for (const b of blocks) {
    if (total + b.text.length > maxChars && out.length > 0) break;
    out.push(b);
    total += b.text.length;
  }
  return out;
}

export function truncateExcerpt(input: string): string {
  const clean = stripHtml(input);
  if (clean.length <= COMPLIANCE.maxExcerptChars) return clean;
  return `${clean.slice(0, COMPLIANCE.maxExcerptChars - 1)}…`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
