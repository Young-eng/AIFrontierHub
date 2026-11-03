import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

/** Remount on route change with a soft enter animation (iOS / Harmony-like). */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="page-transition" key={pathname}>
      {children}
    </div>
  );
}
