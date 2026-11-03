"use client";

import { useCallback, useEffect, useState } from "react";
import { LANES, laneLabel } from "@/lib/lanes";
import { getEnabledSources, REFUSED_SOURCES } from "@/lib/sources";
import type { ChannelHealth, SourceCategory, SourceDef, SourceSyncResult } from "@/lib/types";

type Bundle = { generatedAt: string; results: SourceSyncResult[] };

const HEALTH_LABEL: Record<ChannelHealth, string> = {
  active: "活跃",
  slow: "放缓",
  dormant: "休眠",
  error: "出错",
  blocked_policy: "被拒绝访问",
};

const KIND_LABEL = { rss: "RSS", atom: "Atom", api: "公开 API", sitemap: "站点地图" } as const;

type AddState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; name: string; preview: string[] }
  | { kind: "error"; message: string };

function AddSourceForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<SourceCategory>("engineering");
  const [state, setState] = useState<AddState>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, category }),
      });
      const data = (await res.json()) as
        | { ok: true; source: SourceDef; preview: string[] }
        | { ok: false; error: string };
      if (data.ok) {
        setState({ kind: "done", name: data.source.name, preview: data.preview });
        setUrl("");
        onAdded();
      } else {
        setState({ kind: "error", message: data.error });
      }
    } catch {
      setState({ kind: "error", message: "请求没发出去，确认开发服务器在运行后再试。" });
    }
  }

  return (
    <form className="add-source" onSubmit={submit}>
      <div className="add-source__fields">
        <input
          type="url"
          className="search"
          required
          placeholder="粘贴博客首页或 RSS 地址，例如 https://example.com/blog"
          aria-label="来源网址"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <select
          className="select"
          aria-label="分类"
          value={category}
          onChange={(e) => setCategory(e.target.value as SourceCategory)}
        >
          {LANES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <button type="submit" className="button button--primary" disabled={state.kind === "busy"}>
          {state.kind === "busy" ? "检查中…" : "检查并添加"}
        </button>
      </div>
      {state.kind === "done" ? (
        <p className="add-source__msg add-source__msg--ok">
          已添加「{state.name}」，下次同步时开始拉取。最新几条：{state.preview.join("；")}
        </p>
      ) : null}
      {state.kind === "error" ? <p className="add-source__msg add-source__msg--error">{state.message}</p> : null}
    </form>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "无";
  return new Date(iso).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

export function HealthView() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [failed, setFailed] = useState(false);
  const [sources, setSources] = useState<SourceDef[]>(() => getEnabledSources());

  const loadSources = useCallback(() => {
    fetch("/api/sources", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { sources: SourceDef[] }) => setSources(data.sources))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/feed", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Bundle) => setBundle(data))
      .catch(() => setFailed(true));
    loadSources();
  }, [loadSources]);

  async function remove(id: string) {
    await fetch(`/api/sources?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    loadSources();
  }

  const byId = new Map((bundle?.results ?? []).map((r) => [r.sourceId, r]));
  const tally = (h: ChannelHealth) =>
    (bundle?.results ?? []).filter((r) => r.health === h).length;

  return (
    <div className="page">
      <div className="page__inner page__inner--wide">
        <h1 className="page__title">来源状态</h1>
        <p className="page__lead">
          判断一个来源是否还在更新，看的是它最近一条内容的发布时间，而不是网页能不能打开。超过 3 周没有新内容记为放缓，超过 2 个月记为休眠。
        </p>

        {failed ? (
          <p className="page__empty">读取同步结果失败。回到「今日」点「立即同步」后再来看。</p>
        ) : null}

        {bundle ? (
          <p className="tally">
            {formatDate(bundle.generatedAt)}同步的 {bundle.results.length} 个来源中，
            <span className="status status--active">{tally("active")} 个活跃</span>，
            <span className="status status--slow">{tally("slow")} 个放缓</span>，
            <span className="status status--dormant">{tally("dormant")} 个休眠</span>，
            <span className="status status--error">
              {tally("error") + tally("blocked_policy")} 个出错
            </span>
            。
          </p>
        ) : null}

        <section className="page__section">
          <h2 className="page__h2">添加来源</h2>
          <p className="page__lead">
            粘贴网站首页或 RSS 地址。系统会找它公开的 RSS 或 Atom 并验证，没有 feed 的网站不会添加。
          </p>
          <AddSourceForm onAdded={loadSources} />
        </section>

        <section className="page__section">
          <h2 className="page__h2">正在使用的来源（{sources.length} 个）</h2>
          <div className="sheet sheet--scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>来源</th>
                  <th>分类</th>
                  <th>状态</th>
                  <th className="table__num">本次条数</th>
                  <th>最近一条</th>
                  <th>为什么可以用</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const r = byId.get(s.id);
                  return (
                    <tr key={s.id}>
                      <td>
                        <a href={s.homepage} target="_blank" rel="noopener noreferrer">
                          {s.name}
                        </a>
                        <div className="muted">{KIND_LABEL[s.kind]}</div>
                      </td>
                      <td>{laneLabel(s.category)}</td>
                      <td>
                        {r ? (
                          <span className={`status status--${r.health}`}>
                            {HEALTH_LABEL[r.health]}
                          </span>
                        ) : (
                          <span className="muted">未同步</span>
                        )}
                        {r?.error ? <div className="muted">{r.error}</div> : null}
                      </td>
                      <td className="table__num">{r?.itemCount ?? "无"}</td>
                      <td>{formatDate(r?.latestPublishedAt)}</td>
                      <td className="muted">
                        {s.legalBasis}
                        {s.custom ? (
                          <div>
                            <button type="button" className="link-button" onClick={() => void remove(s.id)}>
                              移除这个来源
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="page__section">
          <h2 className="page__h2">不接入的来源</h2>
          <p className="page__lead">
            这些来源没有公开的 RSS 或接口，自动抓取会违反对方条款，所以只能手动访问。
          </p>
          <div className="sheet sheet--scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>来源</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {REFUSED_SOURCES.map((r) => (
                  <tr key={r.name}>
                    <td className="table__name">{r.name}</td>
                    <td className="muted">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
