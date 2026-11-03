import { NextResponse } from "next/server";
import { LlmError } from "@/lib/llm";
import { loadFeedBundle } from "@/lib/store";
import { translateItemBody } from "@/lib/syncJob";
import { blocksNeedTranslation, needsChineseTranslation, translateBlocks, translateTexts, translationProvider } from "@/lib/translate";
import type { ContentBlock } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * `lang=orig` returns the publisher's text as is. `lang=zh` translates title,
 * summary and body on demand (cached), which is what the 翻译成中文 button calls.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const lang = params.get("lang") === "zh" ? "zh" : "orig";
  if (!id) {
    return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
  }
  const bundle = await loadFeedBundle();
  const item = bundle?.items.find((i) => i.id === id);
  if (!item) {
    return NextResponse.json({ error: "这条内容不在当前缓存里，点「立即同步」后再打开。" }, { status: 404 });
  }

  const original = item.content ?? [];
  const translator = translationProvider();
  const foreign =
    (original.length > 0 && blocksNeedTranslation(original)) ||
    needsChineseTranslation(`${item.title} ${item.summary}`);
  const base = { id, foreign, translator, title: item.title, summary: item.summary };

  if (lang === "orig" || !foreign) {
    return NextResponse.json({ ...base, content: original, translated: false });
  }
  if (!translator) {
    return NextResponse.json({
      ...base,
      content: original,
      translated: false,
      error: "还没配置翻译服务。用 npm run app -- -SetKey 填入 DeepSeek API Key 后重新启动。",
    });
  }

  try {
    const [content, meta] = await Promise.all([
      translateItemBody(item),
      translateTexts([item.title, item.summary].filter(Boolean)),
    ]);
    return NextResponse.json({
      ...base,
      title: meta.get(item.title) ?? item.title,
      summary: item.summary ? (meta.get(item.summary) ?? item.summary) : "",
      content,
      translated: true,
    });
  } catch (err) {
    const message = err instanceof LlmError ? err.message : "翻译没有完成，可能是网络问题，稍后再点一次「翻译成中文」。";
    return NextResponse.json({ ...base, content: original, translated: false, error: message });
  }
}

function asBlocks(value: unknown): ContentBlock[] {
  if (!Array.isArray(value)) return [];
  const types = new Set(["p", "h", "li", "pre", "quote"]);
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const type = (row as { type?: unknown }).type;
    const text = (row as { text?: unknown }).text;
    if (typeof type !== "string" || !types.has(type) || typeof text !== "string") return [];
    return [{ type, text: text.slice(0, 8_000) } as ContentBlock];
  }).slice(0, 400);
}

/** Translates a body kept in the browser after the item has left the feed cache. */
export async function POST(request: Request) {
  let body: { title?: unknown; summary?: unknown; content?: unknown };
  try {
    body = (await request.json()) as { title?: unknown; summary?: unknown; content?: unknown };
  } catch {
    return NextResponse.json({ error: "请求内容无法读取" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.slice(0, 500) : "";
  const summary = typeof body.summary === "string" ? body.summary.slice(0, 2_000) : "";
  const original = asBlocks(body.content);
  const translator = translationProvider();
  const foreign =
    (original.length > 0 && blocksNeedTranslation(original)) || needsChineseTranslation(`${title} ${summary}`);
  const base = { foreign, translator, title, summary, content: original, translated: false };
  if (!foreign) return NextResponse.json(base);
  if (!translator) {
    return NextResponse.json({
      ...base,
      error: "还没配置翻译服务。用 npm run app -- -SetKey 填入 DeepSeek API Key 后重新启动。",
    });
  }
  try {
    const [content, meta] = await Promise.all([
      translateBlocks(original),
      translateTexts([title, summary].filter(Boolean)),
    ]);
    return NextResponse.json({
      ...base,
      title: meta.get(title) ?? title,
      summary: summary ? (meta.get(summary) ?? summary) : "",
      content,
      translated: true,
    });
  } catch (err) {
    const message = err instanceof LlmError ? err.message : "翻译没有完成，可能是网络问题，稍后再点一次「翻译成中文」。";
    return NextResponse.json({ ...base, error: message });
  }
}
