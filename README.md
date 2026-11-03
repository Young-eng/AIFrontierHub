# AI Frontier Hub

AI 前沿资讯聚合器：只从**官方 RSS / Atom / 公开 API / 站点地图**拉取元数据，不抓网页正文，不后台自动同步。

提供两个入口：

| 形态 | 说明 |
| --- | --- |
| **网页版** | Next.js 本机服务，浏览器打开使用 |
| **安卓 APK** | Capacitor 独立 App，手机本地同步与缓存 |

仓库：https://github.com/Young-eng/AIFrontierHub

---

## 功能一览

- **今日**：按「论文 / 模型 / 实验室 / 具身 / 工程 / 通讯 / 外媒 / 中文」泳道浏览当日聚合
- **手动同步**：网页点「立即同步」；手机**下拉刷新**才拉源（不会开机自启、不会后台定时）
- **阅读**：摘要 / 全文（仅当源本身提供）/ arXiv HTML 嵌入；外链打开原文
- **待读 / 收藏**：本机保存，不依赖账号
- **按篇翻译**：同步**不会**批量翻译；打开文章后点「翻译成中文」才调用模型（省 token）
- **来源状态**：查看各源是否成功；网页版可添加自定义 HTTPS RSS/Atom
- **合规底线**：白名单域名、仅 HTTPS、礼貌间隔；HF 走镜像回退；DeepSeek / Kimi / Qwen / OpenAI / Mistral 等优先官网或 GitHub

---

## 环境要求

- Node.js 20+（建议 LTS）
- 网页版：Windows / macOS / Linux 均可
- 安卓版构建：JDK **21**、Android SDK（Android Studio 可选）

---

## 网页版怎么用

### 1. 安装依赖

```bash
git clone https://github.com/Young-eng/AIFrontierHub.git
cd AIFrontierHub
npm install
```

### 2. 配置翻译密钥（可选）

复制环境变量模板：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入 DeepSeek API Key（或其它兼容 OpenAI Chat Completions 的服务）：

```env
DEEPSEEK_API_KEY=sk-...
```

> `.env.local` 已被 gitignore，不会进仓库。不填密钥也能同步与阅读外文原文；只有点「翻译成中文」才需要密钥。

可选：`GITHUB_TOKEN`（公开仓库只读）可减轻 GitHub API 限流。

### 3. 启动

**Windows（推荐一键脚本）：**

```powershell
npm run app
# 或
.\start.ps1
.\start.ps1 -SetKey    # 重新录入密钥
.\start.ps1 -Build     # 改代码后重建再启动
```

**通用：**

```bash
npm run build
npm run start
```

浏览器打开：http://localhost:3000

### 4. 日常使用

1. 打开「今日」→ 点 **立即同步**（首次会稍久，之后有缓存）
2. 点条目阅读；外文需要中文时再点 **翻译成中文**
3. 可加入 **待读** / **收藏**
4. 「来源状态」查看失败源；可添加自己的 HTTPS feed

停止服务：在运行窗口按 `Ctrl+C`。

---

## 安卓 APK 怎么用

### 安装现成包

若维护者提供了 Release 里的 APK（或本地 `release/FrontierHub-*.apk`）：

1. 传到手机，允许「安装未知应用」
2. 安装后打开 **Frontier Hub**
3. **设置** → 填写 DeepSeek API Key → 保存  
4. **今日** → **下拉刷新** 同步  
5. 打开文章 → 需要时再点 **翻译成中文**

数据（密钥、收藏、待读、缓存）都在本机，卸载会清空。

### 自己从源码打包

```bash
cd AIFrontierHub
npm install
cd mobile
npm install
```

```powershell
# 按本机路径设置
$env:JAVA_HOME = "你的\JDK21路径"
$env:ANDROID_HOME = "你的\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

cd mobile
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleRelease   # 或 assembleDebug
```

- Debug：`mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Release：需配置 `mobile/android/keystore.properties` 与签名文件（勿提交密钥库）

也可用 Android Studio：`npm run mobile:open` 后点 Run。

> Capacitor 8 需要 **JDK 21**。不要用过新的 JBR 25 或仅 17 的 JDK 硬编。

### 手机使用注意

| 点 | 说明 |
| --- | --- |
| 同步 | 下拉刷新；无后台自动拉源 |
| 翻译 | 仅单篇手动；同步不耗翻译 token |
| 手势返回 | 阅读器打开时先关阅读器，留在当前 Tab |
| 网络 | 部分源在国内可能失败；已对 HF / arXiv 等做镜像或官网替代 |

---

## 项目结构（简图）

```
AIFrontierHub/
├── src/                 # 共享业务与 Next.js 网页 UI
│   ├── app/             # 页面与 API 路由
│   ├── components/      # 今日、阅读器、底栏等
│   └── lib/             # 同步、源列表、翻译、合规白名单
├── mobile/              # Capacitor + Vite 安卓壳
│   └── android/         # 原生工程
├── start.ps1            # 网页版一键启动
├── .env.example         # 环境变量模板
└── release/             # 本地打好的 APK（默认不入库）
```

---

## 合规与隐私

- 只访问白名单 HTTPS 源；不爬正文页、不做全文转载
- 同步仅由用户触发
- 翻译密钥：网页存 `.env.local` 或设置页；手机存系统 Preferences，并关闭应用备份导出
- 不收集账号，无云端用户数据

---

## 常见问题

**同步很慢 / 部分源 fail**  
源数量多、外网波动都会影响。已并发拉取；国内难连的 HF 机构列表已改为官网 / GitHub。可在「来源状态」看具体错误。

**翻译没反应**  
确认设置里已保存有效 API Key；必须在文章页点「翻译成中文」，刷新列表不会自动翻译。

**安卓 logo / 安装失败**  
签名不同需先卸载旧包；桌面图标缓存异常时可重启桌面或重装。

---

## 开发脚本

| 命令 | 作用 |
| --- | --- |
| `npm run app` | Windows 一键构建并启动网页版 |
| `npm run dev` | Next 开发模式 |
| `npm run build` / `npm start` | 生产构建与启动 |
| `npm run mobile:build` | 构建手机 Web 资源 |
| `npm run mobile:sync` | 同步到 Android 工程 |
| `npm run mobile:open` | 用 Android Studio 打开 |

---

## License

本仓库默认按个人/学习用途分享。第三方源内容版权归原发布方；请遵守各源条款与当地法规。
