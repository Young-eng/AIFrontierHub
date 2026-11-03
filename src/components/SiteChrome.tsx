"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BrandLockup } from "@/components/BrandLockup";
import { FAVORITES_EVENT, loadFavorites } from "@/lib/favorites";
import { loadQueue, QUEUE_EVENT } from "@/lib/queue";
import { getEnabledSources } from "@/lib/sources";

const SIDE_LINKS = [
  { href: "/", label: "今日" },
  { href: "/queue", label: "待读" },
  { href: "/favorites", label: "收藏" },
  { href: "/health", label: "来源状态" },
  { href: "/settings", label: "设置" },
  { href: "/compliance", label: "合规说明" },
];

const TAB_LINKS = [
  { href: "/", label: "今日", icon: "today" },
  { href: "/queue", label: "待读", icon: "queue" },
  { href: "/favorites", label: "收藏", icon: "favorite" },
  { href: "/more", label: "更多", icon: "more" },
] as const;

const MORE_PATHS = ["/more", "/health", "/settings", "/compliance"];

const SOURCE_COUNT = getEnabledSources().length;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname === "";
  if (href === "/more") return MORE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TabIcon({ name, active }: { name: (typeof TAB_LINKS)[number]["icon"]; active: boolean }) {
  return (
    <svg className="tabbar__icon" viewBox="0 0 24 24" fill={active && name === "favorite" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "today" ? <><path d="M5 3.5h14v17H5z" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></> : null}
      {name === "queue" ? <path d="M6 3.5h12v17l-6-3.7-6 3.7z" /> : null}
      {name === "favorite" ? <path d="m12 3 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 17.03l-5.5 2.89 1.05-6.12L3.1 9.47l6.15-.9z" /> : null}
      {name === "more" ? <><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" /></> : null}
    </svg>
  );
}

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [queueCount, setQueueCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);

  useEffect(() => {
    const sync = () => {
      setQueueCount(loadQueue().length);
      setFavoriteCount(loadFavorites().length);
    };
    sync();
    window.addEventListener(QUEUE_EVENT, sync);
    window.addEventListener(FAVORITES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(QUEUE_EVENT, sync);
      window.removeEventListener(FAVORITES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <div className="shell">
      <aside className="rail rail--side">
        <BrandLockup />

        <nav className="rail__nav" aria-label="主导航">
          {SIDE_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="rail__link"
                aria-current={active ? "page" : undefined}
              >
                <span>{link.label}</span>
                {link.href === "/queue" && queueCount > 0 ? (
                  <span className="rail__count">{queueCount}</span>
                ) : null}
                {link.href === "/favorites" && favoriteCount > 0 ? (
                  <span className="rail__count">{favoriteCount}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <p className="rail__foot">
          汇总 {SOURCE_COUNT} 个官方来源，只读取 RSS 与公开 API，不抓取网页。
        </p>
      </aside>

      <header className="topbar">
        <BrandLockup compact />
      </header>

      <div className="workspace">{children}</div>

      <nav className="tabbar" aria-label="底部导航">
        {TAB_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`tabbar__link${active ? " tabbar__link--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="tabbar__item">
                <TabIcon name={link.icon} active={active} />
                <span className="tabbar__label">{link.label}</span>
              </span>
              {link.href === "/queue" && queueCount > 0 ? (
                <span className="tabbar__count">{queueCount > 99 ? "99+" : queueCount}</span>
              ) : null}
              {link.href === "/favorites" && favoriteCount > 0 ? (
                <span className="tabbar__count">{favoriteCount > 99 ? "99+" : favoriteCount}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
