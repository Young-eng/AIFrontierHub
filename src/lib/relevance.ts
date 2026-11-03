import type { SourceDef } from "./types";

const AI_PATTERN =
  /\bAI\b|AIGC|AGI|LLM|GPT|OpenAI|Anthropic|Claude|Gemini|DeepSeek|Qwen|Llama|Mistral|Copilot|ChatGPT|Sora|NVIDIA|Transformer|machine learning|deep learning|neural|agent|人工智能|大模型|模型|智能体|机器学习|深度学习|神经网络|算力|英伟达|具身|机器人|生成式|通义|千问|文心|豆包|混元|智谱|月之暗面|Kimi|MiniMax|阶跃|推理芯片/i;

/**
 * Lawsuits, crime and money: dropped even when the title also names a model.
 * Matched against the title only, since a technical article may mention funding in passing.
 */
const HARD_SOCIAL = new RegExp(
  [
    "起诉|被诉|诉讼|索赔|判决|判处|宣判|法院|庭审|造谣|谣言|辟谣|警方|报警|被捕|逮捕|拘留|刑拘|骗局|罚款|网暴",
    "融资|估值|IPO|市值|股价|涨停|跌停|财报|营收|裁员|年薪|薪资|薪酬|门票|购机|大定|订单突破|上市\\s*\\d|起售|售价|元起",
    "\\b(lawsuit|sues|sued|suing|court|jury|verdict|settlement|fined|arrest(ed)?|police|raises|raised|funding|valuation|IPO|stock|shares|layoffs?|tickets?|tariffs?)\\b",
  ].join("|"),
  "i",
);

/** People, opinion and policy: dropped unless the title itself carries a technical signal. */
const SOFT_SOCIAL = new RegExp(
  [
    "诈骗|侵权|维权|投诉|曝光|举报|收购|并购|招聘|离职|辞职|跳槽|出任|任命|高管|董事|创始人.{0,6}(称|表示|回应|发文)|CEO.{0,6}(称|表示|回应|发文)|首席执行官",
    "热搜|网友|吐槽|争议|道歉|明星|网红|综艺|带货|离婚|去世|逝世|监管|立法|法规|政策|关税|制裁|禁令|出口管制|选举|政府|白宫|国会|议员|内幕|末日",
    "\\b(judge|scam|fraud|hires|hiring|resigns?|steps down|appoint(s|ed)|lobby(ing)?|regulators?|regulation|senate|senator|congress|white house|sanctions?|election|ban(s|ned)?|scandal\\w*|doomsday|CEO)\\b",
  ].join("|"),
  "i",
);

/** Evidence that a story is about how something is built or how well it works. */
const TECH_PATTERN = new RegExp(
  [
    "模型|开源|源码|架构|训练|推理|参数|权重|微调|对齐|芯片|GPU|NPU|TPU|算力|基准|评测|跑分|刷榜|论文|算法|框架|接口|API|SDK|token|上下文|多模态|智能体|Agent|编程|代码|部署|量化|蒸馏|强化学习|MoE|Transformer|扩散|数据集|向量|检索|RAG|编译|内核|显存|延迟|吞吐|端侧|具身|机器人|操作系统|版本|新功能|技术|工程|实测|测评|教程|工具|插件|开发者",
    "\\b(GPT|Gemini|Claude|Opus|Sonnet|Haiku|Llama|Qwen|DeepSeek|Kimi|GLM|Grok|Mistral|MiniMax|Seed|Sora|Veo)[- ]?\\d",
    "\\b(model|models|open[- ]source|open[- ]weight|weights|inference|training|train(ed|s)?|fine[- ]tun\\w*|benchmark\\w*|eval\\w*|dataset|paper|research|algorithm|architecture|agents?|agentic|coding|code|GPU|TPU|chip|kernel|latency|throughput|context window|tokens?|multimodal|reasoning|RL|reinforcement|diffusion|transformer|API|SDK|release[ds]?|version|framework|library|robot\\w*|compiler|quantiz\\w*|distill\\w*|retrieval|RAG|embedding\\w*|open sourced|launch(es|ed)?|feature|tool(s|ing)?)\\b",
  ].join("|"),
  "i",
);

export function isAiRelated(title: string, summary: string): boolean {
  return AI_PATTERN.test(title) || AI_PATTERN.test(summary.slice(0, 600));
}

export function isSocialStory(title: string): boolean {
  if (HARD_SOCIAL.test(title)) return true;
  return SOFT_SOCIAL.test(title) && !TECH_PATTERN.test(title);
}

export function hasTechSignal(title: string, summary: string): boolean {
  return TECH_PATTERN.test(title) || TECH_PATTERN.test(summary.slice(0, 400));
}

/**
 * Papers, model releases, engineering feeds and lab blogs are technical by construction.
 * Media must show a technical signal and must not be social news; newsletters
 * (often multi-topic digests) only drop stories that are social without any tech angle.
 */
export function keepItem(source: SourceDef, title: string, summary: string): boolean {
  if (source.aiOnly && !isAiRelated(title, summary)) return false;
  switch (source.category) {
    case "papers":
    case "models":
    case "engineering":
    case "labs":
      return true;
    case "newsletter":
      return !(SOFT_SOCIAL.test(title) || HARD_SOCIAL.test(title)) || TECH_PATTERN.test(title);
    default:
      return !isSocialStory(title) && hasTechSignal(title, summary);
  }
}
