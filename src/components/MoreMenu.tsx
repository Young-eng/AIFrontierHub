"use client";

import Link from "next/link";
import { getEnabledSources } from "@/lib/sources";

const ITEMS = [
  { href: "/settings", label: "设置", desc: "翻译密钥与应用选项", icon: "settings" },
  { href: "/health", label: "来源状态", desc: "查看各渠道最近一次同步情况", icon: "health" },
  { href: "/compliance", label: "合规说明", desc: "了解信息来源与内容使用边界", icon: "shield" },
] as const;

function MenuIcon({ name }: { name: (typeof ITEMS)[number]["icon"] }) {
  return (
    <svg className="more-list__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "settings" ? <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.6-1.4.9-1.9-2.1-2.1-1.9.9-1.4-.6-.7-2h-3l-.7 2-1.4.6-1.9-.9-2.1 2.1.9 1.9-.6 1.4-2 .7v3l2 .7.6 1.4-.9 1.9 2.1 2.1 1.9-.9 1.4.6.7 2h3l.7-2 1.4-.6 1.9.9 2.1-2.1-.9-1.9.6-1.4z" /></> : null}
      {name === "health" ? <path d="M3 12h4l2.2-6 4.1 12 2.2-6H21" /> : null}
      {name === "shield" ? <><path d="m12 3 8 3v6c0 4.7-3.3 7.6-8 9-4.7-1.4-8-4.3-8-9V6z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></> : null}
    </svg>
  );
}

export function MoreMenu() {
  const count = getEnabledSources().length;
  return (
    <div className="page">
      <div className="page__inner">
        <h1 className="page__title">更多</h1>
        <p className="page__lead">汇总 {count} 个官方来源，只读取 RSS 与公开 API，不抓取网页。</p>
        <ul className="more-list">
          {ITEMS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="more-list__link">
                <MenuIcon name={item.icon} />
                <span className="more-list__copy">
                  <span className="more-list__label">{item.label}</span>
                  <span className="more-list__desc">{item.desc}</span>
                </span>
                <span className="more-list__chevron" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
