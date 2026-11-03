"use client";

import { useEffect, useState } from "react";
import { getLlmConfig } from "@/lib/llm";
import { hydrateSecrets, readApiKey, saveApiKey } from "@/lib/secrets";

export function SettingsView({ mobile = false }: { mobile?: boolean }) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      await hydrateSecrets();
      setKey(await readApiKey());
      setProvider(getLlmConfig()?.label ?? null);
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await saveApiKey(key);
    setSaved(true);
    setProvider(getLlmConfig()?.label ?? null);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="page">
      <div className="page__inner">
        <h1 className="page__title">设置</h1>
        <p className="page__lead">
          {mobile
            ? "翻译密钥只保存在这台手机上。下拉刷新只拉资讯、不自动翻译；打开某篇文章再点「翻译成中文」才会耗 token。"
            : "下拉/同步不会批量翻译。打开单篇文章点「翻译成中文」才调用模型。长期使用建议把密钥写在 .env.local。"}
        </p>

        <form className="settings" onSubmit={(e) => void save(e)}>
          <label className="settings__label" htmlFor="deepseek-key">
            DeepSeek API Key
          </label>
          <input
            id="deepseek-key"
            className="search"
            type="password"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="sk-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <p className="settings__hint">
            在{" "}
            <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">
              platform.deepseek.com
            </a>{" "}
            创建。当前翻译服务：{provider ?? "未配置"}
          </p>
          <button type="submit" className="button button--primary">
            {saved ? "已保存" : "保存"}
          </button>
        </form>
      </div>
    </div>
  );
}
