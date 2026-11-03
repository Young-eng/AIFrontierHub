import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { capBlocks, COMPLIANCE, politeFetch } from "./compliance";
import { markdownToBlocks } from "./markdown";
import { mapPool } from "./pool";
import type { ContentBlock, FeedItem } from "./types";

type CacheEntry = { at: string; blocks: ContentBlock[] | null };
type Cache = Record<string, CacheEntry>;

const cachePath = path.join(process.cwd(), "data", "cache", "enrich.json");
const README_MAX_CHARS = 8_000;
const README_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function loadCache(): Promise<Cache> {
  try {
    return JSON.parse(await readFile(cachePath, "utf8")) as Cache;
  } catch {
    return {};
  }
}

async function saveCache(cache: Cache): Promise<void> {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache), "utf8");
}

/** `undefined` means "try again next sync"; `null` means there is none. */
async function fetchMarkdown(
  url: string,
  accept: string | undefined,
  maxChars: number,
): Promise<ContentBlock[] | null | undefined> {
  try {
    // politeFetch already tries hf-mirror.com before huggingface.co
    const res = await politeFetch(url, accept ?? "text/plain, text/markdown, */*;q=0.8");
    if (res.status === 403 || res.status === 429 || res.status >= 500) return undefined;
    if (!res.ok) return null;
    const blocks = capBlocks(markdownToBlocks(await res.text()), maxChars);
    return blocks.length ? blocks : null;
  } catch {
    return undefined;
  }
}

type Target = { key: string; url: string; accept?: string; label?: string; maxChars: number };

function targetFor(item: FeedItem): Target | null {
  if (item.category === "models") {
    const m = item.url.match(/^https:\/\/huggingface\.co\/([^/]+\/[^/?#]+)$/);
    if (m) {
      return {
        key: `hf:${m[1]}`,
        url: `https://huggingface.co/${m[1]}/raw/main/README.md`,
        accept: "text/plain",
        label: "模型卡",
        maxChars: README_MAX_CHARS,
      };
    }
  }
  if (item.sourceId === "github-trending-python" || item.sourceId.startsWith("gh-org-")) {
    const m = item.url.match(/^https:\/\/github\.com\/([^/]+\/[^/?#]+)\/?$/);
    if (m) {
      return {
        key: `gh:${m[1]}`,
        url: `https://api.github.com/repos/${m[1]}/readme`,
        accept: "application/vnd.github.raw",
        label: "项目说明（README）",
        maxChars: README_MAX_CHARS,
      };
    }
  }
  if (item.sourceId === "hf-blog") {
    const m = item.url.match(/^https:\/\/huggingface\.co\/blog\/([A-Za-z0-9._-]+)$/);
    if (m) {
      return {
        key: `hfblog:${m[1]}`,
        url: `https://raw.githubusercontent.com/huggingface/blog/main/${m[1]}.md`,
        maxChars: COMPLIANCE.maxContentChars,
      };
    }
  }
  return null;
}

/**
 * Model cards / READMEs. Parallel, capped, cached a week.
 * Hugging Face raw URLs go through the same mirror fallback as APIs.
 */
export async function attachReadmes(
  items: FeedItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<FeedItem[]> {
  const cache = await loadCache();
  const now = Date.now();

  const jobs: { index: number; item: FeedItem; target: Target }[] = [];
  for (let i = 0; i < items.length; i++) {
    const target = targetFor(items[i]);
    if (!target) continue;
    const entry = cache[target.key];
    const fresh = entry && now - new Date(entry.at).getTime() <= README_TTL_MS;
    if (fresh) continue;
    jobs.push({ index: i, item: items[i], target });
  }

  const limited = jobs.slice(0, COMPLIANCE.enrichMaxItems);
  let done = 0;
  onProgress?.(0, limited.length);

  await mapPool(limited, COMPLIANCE.enrichConcurrency, async (job) => {
    const blocks = await fetchMarkdown(job.target.url, job.target.accept, job.target.maxChars);
    if (blocks !== undefined) {
      cache[job.target.key] = { at: new Date().toISOString(), blocks };
    }
    done += 1;
    onProgress?.(done, limited.length);
  });

  await saveCache(cache);

  return items.map((item) => {
    const target = targetFor(item);
    if (!target) return item;
    const entry = cache[target.key];
    if (entry?.blocks) {
      return {
        ...item,
        content: entry.blocks,
        fullText: true,
        contentLabel: target.label,
        embedUrl: undefined,
      };
    }
    return item;
  });
}
