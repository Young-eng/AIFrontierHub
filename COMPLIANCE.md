# 合规底线（必须遵守）

本项目是**个人使用的 RSS 聚合阅读与发现工具**，不是内容转载站。任何采集与展示都必须同时满足法律与商业许可边界。

## 允许做的事

1. **仅拉取白名单渠道**：见 `src/lib/sources.ts`。新增源必须同时满足：
   - 对方提供**公开 RSS/Atom**，或**文档化的公开 API**；
   - 用途属于合理发现/索引（标题、链接、短摘要、发布时间）；
   - 能在卡片上标明来源并**外链到一手原文**。
2. **正文只取 feed 自带的部分**：标题、规范 URL、发布时间、≤480 字符摘要；若发布方在自己的 RSS/Atom 中提供了全文（`content:encoded` / Atom `content`），在本地阅读区原样显示（转为纯文本，上限 30,000 字符），用途与普通 RSS 阅读器相同。**绝不为补全正文去请求文章网页。**
   - 全文仅存本机 `data/cache`，供个人阅读；若面向公众部署，必须关闭全文显示，只保留摘要。
   - 机构自己公开的机器可读文本也算：Hugging Face 模型卡、GitHub README（REST API）、Hugging Face 官方博客在其公开仓库 `huggingface/blog` 里的 Markdown 原稿。
   - **嵌入原网页**：对方的 RSS 只给摘要时，阅读区可以用 iframe 显示原网页。页面由用户浏览器直接向原站请求，本站服务器不请求、不保存、不改写页面内容，原站的广告和统计照常生效。只对实测**未设置** `X-Frame-Options` / CSP `frame-ancestors` 的站点开启（来源上标 `embed: true`；论文用 arXiv 的 HTML 版）；明确禁止嵌入的站点（OpenAI、DeepMind、HF 博客、TechCrunch、The Verge 等）不嵌入，只给外链。
   - 综合类科技媒体（`aiOnly: true`）只保留与 AI 相关的条目。
3. **礼貌访问**：固定可识别 User-Agent、请求间隔、失败退避；不并发压垮对方。
4. **用户内容本地化**：待读队列仅存浏览器本地（localStorage），默认不上云。

## 禁止做的事

1. 抓取文章网页正文，或公开镜像、转载受版权保护的新闻/博客全文（含公众号、付费墙后内容）。
2. 绕过登录墙、验证码、反爬、地区限制、robots 禁止路径。
3. 抓取明确禁止自动化的页面，或违反对方服务条款的批量爬取。
4. 伪造身份、隐藏机器人身份、或冒充浏览器去骗取仅对人开放的内容。
5. 再分发模型权重、数据集或受许可约束的完整论文 PDF（一律外链官方入口）。
6. 把「不可核验 / 需登录」的源写成已抓取成功。

## 当前白名单策略说明

| 类型 | 示例 | 依据 |
|---|---|---|
| 官方 RSS/Atom | arXiv、OpenAI News、DeepMind、HF Blog、Import AI 等 | 公开发布的订阅端点，用于阅读器聚合是常规用法 |
| 官方公开 API | Hugging Face `daily_papers` / models trending | 文档化公开 JSON；我们只取标题、链接、热度类字段 |
| 机构官方账号 | DeepSeek、Kimi、智谱、MiniMax、Qwen、Anthropic 等的 GitHub 机构仓库（REST API）；arXiv 上以 `DeepSeek-AI`、`Kimi Team` 等团队署名的技术报告（arXiv API）；Anthropic 可解释性站 transformer-circuits.pub 的 Atom | 都是机构自己发布、平台提供的公开接口；GitHub 未登录每小时限 60 次，可在 `.env.local` 填 `GITHUB_TOKEN` 提高额度 |
| 中文媒体 RSS | 量子位、新智元、雷峰网、InfoQ、开源中国 | 仅在其**开放 RSS** 范围内取条目元数据；无 RSS 的媒体（如机器之心）**不做站内抓取** |
| 实验室/工程博客 RSS | OpenAI、DeepMind、Google、MSR、Meta Engineering、Apple ML、AWS、BAIR、CMU、Ai2、Sakana、Stability、PyTorch、vLLM、NVIDIA、美团技术团队 等 | **仅在官方提供 feed 时接入**；Anthropic / 多数国内大厂官网因无公开 RSS **不抓 HTML** |
| 外媒分类 RSS | MIT Technology Review、The Verge、TechCrunch、Ars Technica、MarkTechPost | 官方提供的 AI 分类 feed |
| 中文综合科技媒体 RSS | 极客公园、爱范儿、钛媒体、IT之家 | 官方 RSS，按关键词只保留 AI 相关条目 |

## 翻译说明

同步时把英文标题和摘要译成中文，方便扫读列表；阅读区默认显示原文，点「翻译成中文」才翻译正文。译文本地缓存。翻译结果可能不完美；**不改变原文版权归属**，完整内容仍以外链一手源为准。

## 免责声明（产品内也会展示）

- 条目版权归属原作者/原出版方；本站不主张对其正文的权利。
- 摘要可能来自 feed 自带 description；若无 description，仅展示标题。
- 用户点击「打开原文」即离开本站，适用目标站点条款。
- 本工具不提供法律意见；上线前若面向公众运营，请自行咨询律师并复核各源 ToS。
