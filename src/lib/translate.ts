import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { sleep, USER_AGENT } from "./compliance";
import { chatJson, getLlmConfig, type LlmConfig } from "./llm";
import type { ContentBlock } from "./types";

/** Rough language gate: enough CJK → treat as Chinese; else may need zh. */
export function needsChineseTranslation(text: string): boolean {
  const sample = text.slice(0, 400);
  if (!sample.trim()) return false;
  const cjk = (sample.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const letters = (sample.match(/[A-Za-z]/g) || []).length;
  if (cjk >= 8) return false;
  return letters >= 12;
}

/** Disk-backed cache shared by every request in this process; writes are serialised. */
class TextCache {
  private data: Record<string, string> | null = null;
  private loading: Promise<void> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private dirty = false;

  constructor(private readonly file: string) {}

  private async ensure(): Promise<Record<string, string>> {
    if (this.data) return this.data;
    this.loading ??= readFile(this.file, "utf8")
      .then((raw) => {
        this.data = JSON.parse(raw) as Record<string, string>;
      })
      .catch(() => {
        this.data = {};
      });
    await this.loading;
    return this.data!;
  }

  async get(key: string): Promise<string | undefined> {
    return (await this.ensure())[key];
  }

  async set(key: string, value: string): Promise<void> {
    (await this.ensure())[key] = value;
    this.dirty = true;
  }

  flush(): Promise<void> {
    this.writing = this.writing.then(async () => {
      if (!this.dirty || !this.data) return;
      this.dirty = false;
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(this.file, JSON.stringify(this.data), "utf8");
    });
    return this.writing;
  }
}

const cacheDir = path.join(process.cwd(), "data", "cache");
const globalCaches = globalThis as unknown as { __aiTrendingCaches?: Record<string, TextCache> };
function cacheFor(name: "meta" | "body"): TextCache {
  globalCaches.__aiTrendingCaches ??= {};
  globalCaches.__aiTrendingCaches[name] ??= new TextCache(
    path.join(cacheDir, name === "meta" ? "translations.json" : "translations-body.json"),
  );
  return globalCaches.__aiTrendingCaches[name];
}

function hashKey(prefix: string, text: string): string {
  return `${prefix}:${createHash("sha256").update(text).digest("hex").slice(0, 24)}`;
}

export function translationProvider(): string | null {
  return getLlmConfig()?.label ?? null;
}

// ---------- LLM translation ----------

const SYSTEM_PROMPT = [
  "你是 AI 与软件工程领域的专业译者。把输入 JSON 里 items 数组的每一项翻译成自然、准确、通顺的简体中文。",
  "要求：",
  "1. 只输出 JSON：{\"items\": [...]}，数组长度和顺序必须与输入完全一致，一项对应一项。",
  "2. 模型名、产品名、公司名、人名、代码、命令、文件名、URL、数字和单位保留原文。",
  "3. 常见术语用中文业界通行译法，例如 agent 译为智能体，inference 译为推理，benchmark 译为基准测试。",
  "4. 已经是中文的项原样返回；不要添加解释，不要合并或拆分条目。",
].join("\n");

const BATCH_CHARS = 3_500;
const BATCH_ITEMS = 40;
const PARALLEL = 4;

function makeBatches(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const t of texts) {
    if (current.length && (size + t.length > BATCH_CHARS || current.length >= BATCH_ITEMS)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(t);
    size += t.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function translateBatch(config: LlmConfig, texts: string[]): Promise<string[]> {
  const out = (await chatJson(config, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify({ items: texts }) },
  ])) as { items?: unknown };
  const items = Array.isArray(out?.items) ? out.items.map((x) => String(x ?? "")) : [];
  if (items.length === texts.length) return items;
  if (texts.length === 1) throw new Error("翻译结果格式不对");
  // The model merged or dropped entries: retry the halves separately.
  const mid = Math.ceil(texts.length / 2);
  return [
    ...(await translateBatch(config, texts.slice(0, mid))),
    ...(await translateBatch(config, texts.slice(mid))),
  ];
}

async function runPool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * Translates every text that is not already Chinese. Returns a map from the
 * original text to its Chinese version; untranslatable texts map to themselves.
 */
export async function translateTexts(texts: string[], kind: "meta" | "body" = "meta"): Promise<Map<string, string>> {
  const cache = cacheFor(kind);
  const result = new Map<string, string>();
  const pending: string[] = [];

  for (const raw of new Set(texts)) {
    const text = raw.trim();
    if (!text || !needsChineseTranslation(text)) {
      result.set(raw, raw);
      continue;
    }
    const hit = await cache.get(hashKey("llm", text));
    if (hit) result.set(raw, hit);
    else pending.push(raw);
  }

  const config = getLlmConfig();
  if (pending.length && config) {
    const batches = makeBatches(pending.map((t) => t.trim()));
    const translated = await runPool(
      batches.map((batch) => () => translateBatch(config, batch)),
      PARALLEL,
    );
    let k = 0;
    for (let b = 0; b < batches.length; b++) {
      for (let i = 0; i < batches[b].length; i++, k++) {
        const zh = translated[b][i].trim();
        const raw = pending[k];
        if (zh) {
          await cache.set(hashKey("llm", raw.trim()), zh);
          result.set(raw, zh);
        }
      }
    }
    await cache.flush();
  }
  return result;
}

/** Code stays as is; everything else becomes Chinese. */
export async function translateBlocks(blocks: ContentBlock[]): Promise<ContentBlock[]> {
  const texts = blocks.filter((b) => b.type !== "pre").map((b) => b.text);
  const map = await translateTexts(texts, "body");
  return blocks.map((b) => (b.type === "pre" ? b : { ...b, text: map.get(b.text) ?? b.text }));
}

export function blocksNeedTranslation(blocks: ContentBlock[]): boolean {
  const sample = blocks
    .filter((b) => b.type !== "pre")
    .map((b) => b.text)
    .join(" ")
    .slice(0, 800);
  return needsChineseTranslation(sample);
}

// ---------- Fallback without an API key: MyMemory, titles and summaries only ----------

async function myMemory(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || !needsChineseTranslation(trimmed)) return trimmed;
  const cache = cacheFor("meta");
  const key = hashKey("mm", trimmed);
  const hit = await cache.get(key);
  if (hit) return hit;

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed.slice(0, 450))}&langpair=en|zh-CN`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return trimmed;
    const data = (await res.json()) as { responseData?: { translatedText?: string }; responseStatus?: number };
    const out = data.responseData?.translatedText?.trim();
    if (!out || data.responseStatus !== 200) return trimmed;
    if (!/[\u4e00-\u9fff]/.test(out) && needsChineseTranslation(out)) return trimmed;
    await cache.set(key, out);
    return out;
  } catch {
    return trimmed;
  }
}

export const FALLBACK_BUDGET = 80;

export async function translateWithFallback(texts: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  let budget = FALLBACK_BUDGET * 2;
  for (const t of new Set(texts)) {
    if (budget <= 0 || !needsChineseTranslation(t)) {
      result.set(t, t);
      continue;
    }
    result.set(t, await myMemory(t));
    budget -= 1;
    await sleep(100);
  }
  await cacheFor("meta").flush();
  return result;
}
