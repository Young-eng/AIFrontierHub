import Link from "next/link";
import { COMPLIANCE, USER_AGENT } from "@/lib/compliance";
import { getEnabledSources } from "@/lib/sources";

export default function CompliancePage() {
  const count = getEnabledSources().length;

  return (
    <div className="page">
      <div className="page__inner">
        <h1 className="page__title">合规说明</h1>
        <p className="page__lead">
          宁可少一条信息，也不做违反法律或站点商业条款的抓取。这是本站的底线。
        </p>

        <div className="prose">
          <h2 className="page__h2">我们做什么</h2>
          <p>
            只从 {count} 个提供公开 RSS、Atom 或文档化公开接口的来源读取条目。如果对方在自己的 RSS 里放了全文，就像普通 RSS
            阅读器一样把全文显示出来；只放了摘要的，本站服务器不会去打开对方网页抓正文。英文标题和摘要用机器翻译成中文，正文点「翻译成中文」才翻译，每条都附原文链接。
          </p>
          <p>
            对方只给摘要、而且原网页允许被嵌入时（没有设置 X-Frame-Options 或 frame-ancestors），阅读区会在框里显示原网页。这个页面由你的浏览器直接从原站加载，本站不请求、不保存、不改动它；明确禁止嵌入的站点只给链接。
          </p>
          <p>
            显示的全文只保存在你这台电脑上，供个人阅读。如果要把本站部署给公众访问，应先关闭全文显示，只保留不超过{" "}
            {COMPLIANCE.maxExcerptChars} 字的摘要。
          </p>
          <p>
            每次请求间隔至少 {COMPLIANCE.minGapMsBetweenRequests} 毫秒，并用可识别的身份标识访问：
            <code>{USER_AGENT}</code>
          </p>
          <p>待读和已读记录只保存在你这台电脑的浏览器里，不上传。</p>

          <h2 className="page__h2">我们不做什么</h2>
          <ul>
            <li>服务器不抓取网页正文。RSS 和公开接口里没有的内容，一律不取。</li>
            <li>不把全文公开转载或对外分发。</li>
            <li>不绕过登录、验证码、付费墙或地区限制。</li>
            <li>不伪装成普通浏览器去获取只对人开放的页面。</li>
            <li>不下载或再分发模型权重、受许可约束的论文 PDF。</li>
          </ul>

          <h2 className="page__h2">为什么看不到 Anthropic 和一些国内大厂</h2>
          <p>
            Anthropic、DeepSeek、Kimi、智谱、MiniMax 等官网目前没有公开的 RSS 或接口。直接爬它们的网页不符合上面的底线，所以只能手动访问。完整名单和原因见{" "}
            <Link href="/health">来源状态</Link>。
          </p>
          <p>
            条目版权归原作者和原站点所有。本站不提供法律意见，若要面向公众运营，请先咨询律师并复核各来源的服务条款。
          </p>
        </div>
      </div>
    </div>
  );
}
