"use client";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

/** Header brand: drawn mark + type — no cropped plate, blends into Ink chrome. */
export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`brand-lockup${compact ? " brand-lockup--compact" : ""}`} aria-label="AI Frontier">
      <BrandMark className="brand-lockup__mark" size={compact ? 30 : 36} />
      <span className="brand-lockup__text">
        <span className="brand-lockup__title">AI Frontier</span>
        <span className="brand-lockup__sub">
          <span className="brand-lockup__news">NEWS</span>
          <span className="brand-lockup__zh">AI 前沿资讯</span>
        </span>
      </span>
    </Link>
  );
}
