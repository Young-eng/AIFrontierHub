/**
 * OpenAI-compatible chat endpoint. Defaults target DeepSeek; any compatible
 * provider works by setting TRANSLATE_BASE_URL / TRANSLATE_MODEL.
 */
import { readApiKeySync } from "./secrets";

export type LlmConfig = { baseUrl: string; apiKey: string; model: string; label: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getLlmConfig(): LlmConfig | null {
  const apiKey =
    (typeof process !== "undefined" && (process.env.TRANSLATE_API_KEY || process.env.DEEPSEEK_API_KEY)) ||
    readApiKeySync();
  if (!apiKey) return null;
  const baseUrl = (
    (typeof process !== "undefined" && process.env.TRANSLATE_BASE_URL) ||
    "https://api.deepseek.com"
  ).replace(/\/+$/, "");
  const model =
    (typeof process !== "undefined" && process.env.TRANSLATE_MODEL) || "deepseek-chat";
  const label =
    (typeof process !== "undefined" && process.env.TRANSLATE_LABEL) ||
    (baseUrl.includes("deepseek") ? "DeepSeek" : model);
  return { baseUrl, apiKey, model, label };
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type ChatMessage = { role: "system" | "user"; content: string };

export async function chatJson(config: LlmConfig, messages: ChatMessage[], timeoutMs = 120_000): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        throw new LlmError("翻译服务拒绝了 API Key，请检查 .env.local 里的 DEEPSEEK_API_KEY", res.status);
      }
      if (res.status === 402) {
        throw new LlmError("翻译服务账户余额不足，请到服务商后台充值", res.status);
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new LlmError(`翻译服务暂时不可用（HTTP ${res.status}）`, res.status);
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        throw new LlmError(`翻译服务返回 HTTP ${res.status}`, res.status);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? "";
      return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch (err) {
      if (err instanceof LlmError && err.status && err.status < 500 && err.status !== 429) throw err;
      lastError = err;
      await sleep(1500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new LlmError("翻译服务请求失败");
}
