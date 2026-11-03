"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { laneLabel } from "@/lib/lanes";
import { absoluteDate, displayUrl, looksForeign, relativeTime } from "@/lib/format";
import type { ContentBlock, FeedItem } from "@/lib/types";

type Lang = "orig" | "zh";

type ItemResponse = {
  foreign: boolean;
  title: string;
  summary: string;
  content: ContentBlock[];
  translated: boolean;
  translator: string | null;
  error?: string;
};

type Body =
  | { state: "loading" }
  | { state: "ready"; data: ItemResponse }
  | { state: "offline" };

function Blocks({ blocks, lang }: { blocks: ContentBlock[]; lang?: string }) {
  return (
    <div className="article" lang={lang}>
      {blocks.map((b, i) => {
        if (b.type === "h") return <h3 key={i}>{b.text}</h3>;
        if (b.type === "li") return <p key={i} className="article__li">{b.text}</p>;
        if (b.type === "pre") return <pre key={i}>{b.text}</pre>;
        if (b.type === "quote") return <blockquote key={i}>{b.text}</blockquote>;
        return <p key={i}>{b.text}</p>;
      })}
    </div>
  );
}

function textLength(blocks: ContentBlock[]): number {
  return blocks.reduce((n, b) => n + b.text.length, 0);
}

function isHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function isPaperFrame(url: string): boolean {
  return url.startsWith("https://arxiv.org/html/");
}

function OriginalPage({ url }: { url: string }) {
  if (!isHttpsUrl(url)) return null;
  const paper = isPaperFrame(url);
  return (
    <section className="frame" aria-label="原网页">
      <div className="frame__bar">
        <span className="frame__title">{paper ? "论文全文（arXiv HTML 版）" : "原网页"}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          在新标签页打开
        </a>
      </div>
      <iframe
        className="frame__view"
        src={url}
        title={paper ? "arXiv 论文全文" : "原网页"}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
      />
      <p className="frame__note">
        {paper
          ? "页面直接由 arXiv 提供。个别论文没有 HTML 版，框里会显示 arXiv 的提示，这时点上方链接看 PDF。"
          : "页面由原站直接提供，本站不保存它的内容。框内空白时，点上方链接在新标签页阅读。"}
      </p>
    </section>
  );
}

function storedOriginal(item: FeedItem): ItemResponse {
  return {
    foreign: looksForeign(`${item.title} ${item.summary}`),
    title: item.title,
    summary: item.summary,
    content: item.content ?? [],
    translated: false,
    translator: null,
  };
}

function ReaderBody({
  item,
  body,
  origBody,
  lang,
  onRetry,
}: {
  item: FeedItem;
  body: Body | undefined;
  origBody: Body | undefined;
  lang: Lang;
  onRetry: () => void;
}) {
  const data = body?.state === "ready" ? body.data : origBody?.state === "ready" ? origBody.data : null;
  const showingZh = Boolean(data?.translated);
  const fallbackSummary = lang === "zh" ? item.summaryZh : item.summary;
  const summary = data?.summary || fallbackSummary || item.summaryZh || "这条没有摘要。";
  const blocks = data?.content ?? [];
  const textLang = showingZh || !looksForeign(summary) ? "zh-CN" : "en";

  const notice =
    body?.state === "offline" ? (
      <div className="notice" role="alert">
        <p>连不上本地服务，启动它的窗口可能已经关闭。重新运行 npm run app 后点「重试」。</p>
        <button type="button" className="button button--small" onClick={onRetry}>
          重试
        </button>
      </div>
    ) : lang === "zh" && data?.error ? (
      <div className="notice" role="alert">
        <p>{data.error}下面先显示原文。</p>
        <button type="button" className="button button--small" onClick={onRetry}>
          再试一次
        </button>
      </div>
    ) : null;

  const status =
    body?.state === "loading" ? (
      <p className="reader__status" role="status">
        {lang === "zh" ? "正在翻译成中文，长文大约需要半分钟…" : "正在载入…"}
      </p>
    ) : null;

  if (item.fullText) {
    return (
      <>
        {notice}
        {status}
        {item.contentLabel || !blocks.length ? (
          <p className="reader__lead" lang={textLang}>
            {summary}
          </p>
        ) : null}
        {blocks.length ? (
          <>
            {item.contentLabel ? <h3 className="reader__content-label">{item.contentLabel}</h3> : null}
            <Blocks blocks={blocks} lang={textLang} />
          </>
        ) : null}
      </>
    );
  }

  const useBody = blocks.length > 0 && textLength(blocks) > summary.length;
  return (
    <>
      {notice}
      {status}
      {useBody ? (
        <Blocks blocks={blocks} lang={textLang} />
      ) : (
        <p className="reader__lead" lang={textLang}>
          {summary}
        </p>
      )}
      {item.embedUrl ? null : (
        <p className="reader__partial">
          这个来源只公开了摘要，而且原站不允许在别的页面里嵌入显示，完整内容请点「打开原文」。
        </p>
      )}
    </>
  );
}

async function loadBody(item: FeedItem, wantZh: boolean): Promise<ItemResponse> {
  const res = await fetch(`/api/item?id=${encodeURIComponent(item.id)}&lang=${wantZh ? "zh" : "orig"}`, {
    cache: "no-store",
  });
  if (res.ok) return (await res.json()) as ItemResponse;
  if (res.status === 404 && item.content?.length) {
    if (!wantZh) return storedOriginal(item);
    const post = await fetch("/api/item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: item.title, summary: item.summary, content: item.content }),
    });
    if (!post.ok) throw new Error(`HTTP ${post.status}`);
    return (await post.json()) as ItemResponse;
  }
  if (res.status === 404) return (await res.json()) as ItemResponse;
  throw new Error(`HTTP ${res.status}`);
}

export function ArticleReader({
  item,
  now,
  open,
  saved,
  favorited,
  onClose,
  onSave,
  onFavorite,
  onOpenRelated,
  onOriginal,
  extraAction,
}: {
  item: FeedItem | null;
  now: number;
  open: boolean;
  saved: boolean;
  favorited: boolean;
  onClose: () => void;
  onSave: () => void;
  onFavorite: () => void;
  onOpenRelated?: (id: string) => void;
  onOriginal?: (id: string, blocks: ContentBlock[]) => void;
  extraAction?: { label: string; onClick: () => void };
}) {
  const [bodies, setBodies] = useState<Record<string, Body>>({});
  const [lang, setLang] = useState<Lang>("orig");
  const sent = useRef("");

  const foreign = item ? looksForeign(`${item.title} ${item.summary}`) : false;
  const origKey = item ? `${item.id}:orig` : "";
  const bodyKey = item ? `${item.id}:${foreign && lang === "zh" ? "zh" : "orig"}` : "";

  // Each article opens in original language — translation only after an explicit tap.
  useEffect(() => {
    setLang("orig");
  }, [item?.id]);

  useEffect(() => {
    if (!item || !origKey) return;
    if (bodies[origKey]) return;
    setBodies((prev) => ({ ...prev, [origKey]: { state: "loading" } }));
    loadBody(item, false)
      .then((data) => setBodies((prev) => ({ ...prev, [origKey]: { state: "ready", data } })))
      .catch(() => setBodies((prev) => ({ ...prev, [origKey]: { state: "offline" } })));
  }, [item, origKey, bodies]);

  useEffect(() => {
    if (!item || !foreign || lang !== "zh") return;
    const zhKey = `${item.id}:zh`;
    if (bodies[zhKey]) return;
    setBodies((prev) => ({ ...prev, [zhKey]: { state: "loading" } }));
    loadBody(item, true)
      .then((data) => setBodies((prev) => ({ ...prev, [zhKey]: { state: "ready", data } })))
      .catch(() => setBodies((prev) => ({ ...prev, [zhKey]: { state: "offline" } })));
  }, [item, foreign, lang, bodies]);

  useEffect(() => {
    if (!item || !onOriginal) return;
    const ready = bodies[`${item.id}:orig`];
    if (ready?.state !== "ready" || !ready.data.content.length) return;
    const mark = `${item.id}:${ready.data.content.length}`;
    if (sent.current === mark) return;
    sent.current = mark;
    onOriginal(item.id, ready.data.content);
  }, [bodies, item, onOriginal]);

  const retryBody = useCallback(() => {
    setBodies((prev) => {
      const next = { ...prev };
      delete next[origKey];
      delete next[bodyKey];
      return next;
    });
  }, [origKey, bodyKey]);

  useEffect(() => {
    document.querySelector(".reader")?.scrollTo({ top: 0 });
  }, [item?.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "t" && foreign) setLang(lang === "zh" ? "orig" : "zh");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [foreign, lang, setLang]);

  const selectedBody = bodyKey ? bodies[bodyKey] : undefined;
  const origBody = origKey ? bodies[origKey] : undefined;
  const readerLang: Lang = foreign ? lang : "orig";
  const shown = selectedBody?.state === "ready" ? selectedBody.data : null;
  const translatedBy = readerLang === "zh" && shown?.translated ? shown.translator : null;
  const readerTitle = readerLang === "zh" ? (shown?.translated ? shown.title : item?.titleZh) : item?.title;
  const translating = readerLang === "zh" && selectedBody?.state === "loading";

  return (
    <article className={`reader${open ? " reader--open" : ""}`} aria-label="正文">
      {item ? (
        <div className="reader__inner" key={item.id}>
          <button type="button" className="button button--small reader__back" onClick={onClose}>
            返回列表
          </button>

          <header className="reader__head">
            <div className="reader__topline">
              <p className={`reader__source lane-${item.category}`}>
                <span className="reader__lane">{laneLabel(item.category)}</span>
                {item.sourceName}
              </p>
              {foreign ? (
                <div className="lang-switch" role="group" aria-label="显示语言">
                  <button type="button" aria-pressed={readerLang === "orig"} onClick={() => setLang("orig")}>
                    原文
                  </button>
                  <button type="button" aria-pressed={readerLang === "zh"} onClick={() => setLang("zh")}>
                    {translating ? "翻译中…" : "翻译成中文"}
                  </button>
                </div>
              ) : null}
            </div>
            <h2 className="reader__title" lang={readerLang === "orig" && foreign ? "en" : "zh-CN"}>
              {readerTitle || item.titleZh || item.title}
            </h2>
            <p className="reader__time">
              {item.publishedAt ? absoluteDate(item.publishedAt) : relativeTime(item, now)}
            </p>
          </header>

          <div className="reader__actions reader__actions--mobile" aria-label="文章操作">
            <button type="button" className={`button reader__save${favorited ? " button--on" : ""}`} aria-pressed={favorited} onClick={onFavorite}>
              {favorited ? "已收藏" : "收藏"}
            </button>
            <button type="button" className="button reader__save" disabled={saved} onClick={onSave}>
              {saved ? "已在待读" : "加入待读"}
            </button>
            {isHttpsUrl(item.url) ? <a className="button reader__original" href={item.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">查看原文</a> : null}
          </div>

          <div className="reader__grid">
            <div className="reader__main">
              <ReaderBody item={item} body={selectedBody} origBody={origBody} lang={readerLang} onRetry={retryBody} />
            </div>

            <aside className="reader__aside" aria-label="条目信息">
              <div className="reader__actions">
                {isHttpsUrl(item.url) ? (
                  <a
                    className="button button--primary"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    打开原文
                  </a>
                ) : null}
                <button type="button" className="button" disabled={saved} onClick={onSave}>
                  {saved ? "已加入待读" : "加入待读"}
                </button>
                <button
                  type="button"
                  className={`button${favorited ? " button--on" : ""}`}
                  aria-pressed={favorited}
                  onClick={onFavorite}
                >
                  {favorited ? "已收藏" : "收藏"}
                </button>
                {extraAction ? (
                  <button type="button" className="button" onClick={extraAction.onClick}>
                    {extraAction.label}
                  </button>
                ) : null}
              </div>

              {item.facts?.length ? (
                <dl className="facts">
                  {item.facts.map((f) => (
                    <div className="facts__row" key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>
                        {f.href && isHttpsUrl(f.href) ? (
                          <a href={f.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                            {f.value}
                          </a>
                        ) : (
                          f.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <p className="reader__link">
                {isHttpsUrl(item.url) ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                    {displayUrl(item.url)}
                  </a>
                ) : (
                  <span>{displayUrl(item.url)}</span>
                )}
              </p>
              {translatedBy ? <p className="reader__note">中文由 {translatedBy} 机器翻译，细节以原文为准。</p> : null}
              <p className="reader__note">
                <kbd>J</kbd> <kbd>K</kbd> 上下切换，<kbd>O</kbd> 打开原文，<kbd>S</kbd> 加入待读，<kbd>F</kbd> 收藏
                {foreign ? (
                  <>
                    ，<kbd>T</kbd> 切换原文和中文
                  </>
                ) : null}
              </p>
            </aside>
          </div>

          {item.embedUrl && !item.fullText ? <OriginalPage url={item.embedUrl} /> : null}

          {onOpenRelated && item.related?.length ? (
            <section className="related" aria-label="其他来源的相关内容">
              <h3 className="related__title">其他来源也在说这件事</h3>
              <ul className="related__list">
                {item.related.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="related__item" onClick={() => onOpenRelated(r.id)}>
                      <span className="related__source">{r.sourceName}</span>
                      <span className="related__headline">{r.title}</span>
                      {r.excerpt ? <span className="related__excerpt">{r.excerpt}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : (
        <p className="reader__empty">从左侧列表选一条，内容会显示在这里。</p>
      )}
    </article>
  );
}
