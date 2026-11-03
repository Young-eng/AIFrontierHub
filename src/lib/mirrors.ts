/**
 * Endpoint mirrors for regions where huggingface.co / export.arxiv.org are flaky.
 * Prefer mirror first; fall back to the official host.
 */

/** Extra hosts that may be fetched even when not listed as a source endpoint. */
export const MIRROR_HOSTS = ["hf-mirror.com", "rss.arxiv.org"] as const;

const HF_HOSTS = new Set(["huggingface.co", "hf-mirror.com"]);
const ARXIV_API_HOSTS = new Set(["export.arxiv.org", "arxiv.org"]);

function swapHost(url: string, host: string): string {
  const u = new URL(url);
  u.hostname = host;
  return u.toString();
}

/**
 * Ordered candidates to try for a given endpoint.
 * Deduplicates while preserving order.
 */
export function endpointCandidates(endpoint: string): string[] {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return [endpoint];
  }

  const out: string[] = [];
  const push = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };

  if (HF_HOSTS.has(u.hostname)) {
    // China: hf-mirror.com often works when huggingface.co times out.
    // Elsewhere: mirror may 308 to huggingface — still fine with redirect:follow.
    push(swapHost(endpoint, "hf-mirror.com"));
    push(swapHost(endpoint, "huggingface.co"));
    return out;
  }

  if (u.hostname === "rss.arxiv.org") {
    push(endpoint);
    // Rare fallback: some networks only resolve one of the two.
    push(endpoint.replace("https://rss.arxiv.org/rss/", "https://export.arxiv.org/rss/"));
    return out;
  }

  if (ARXIV_API_HOSTS.has(u.hostname) && u.pathname.includes("/api/query")) {
    push(swapHost(endpoint, "export.arxiv.org"));
    push(swapHost(endpoint, "arxiv.org"));
    return out;
  }

  push(endpoint);
  return out;
}

/** Rewrite Hugging Face content URLs (README raw) onto the preferred mirror. */
export function hfContentCandidates(url: string): string[] {
  try {
    const u = new URL(url);
    if (!HF_HOSTS.has(u.hostname)) return [url];
    return endpointCandidates(url);
  } catch {
    return [url];
  }
}
