"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const THRESHOLD = 64;
const MAX_PULL = 96;

type Props = {
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * Touch pull-to-refresh for the scrollable list. Desktop keeps using an explicit button.
 */
export function PullToRefresh({
  onRefresh,
  refreshing,
  disabled,
  children,
  className,
  "aria-label": ariaLabel,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const armedRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [armed, setArmed] = useState(false);

  const reset = useCallback(() => {
    pulling.current = false;
    armedRef.current = false;
    setOffset(0);
    setArmed(false);
  }, []);

  useEffect(() => {
    if (!refreshing) reset();
  }, [refreshing, reset]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || disabled) return;

    const onStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (el.scrollTop > 0) {
        pulling.current = false;
        return;
      }
      startY.current = e.touches[0]?.clientY ?? 0;
      pulling.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return;
      if (el.scrollTop > 0) {
        reset();
        return;
      }
      const y = e.touches[0]?.clientY ?? 0;
      const dy = y - startY.current;
      if (dy <= 0) {
        armedRef.current = false;
        setOffset(0);
        setArmed(false);
        return;
      }
      // Resist after threshold for a springy feel
      const next = Math.min(MAX_PULL, dy * 0.55);
      const nextArmed = next >= THRESHOLD;
      armedRef.current = nextArmed;
      setOffset(next);
      setArmed(nextArmed);
      if (dy > 8) e.preventDefault();
    };

    const onEnd = () => {
      if (!pulling.current) return;
      const shouldRefresh = armedRef.current && !refreshing;
      if (shouldRefresh) {
        setOffset(THRESHOLD * 0.7);
        void onRefresh();
      } else {
        reset();
      }
      pulling.current = false;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [disabled, onRefresh, refreshing, reset]);

  const label = refreshing ? "正在同步…" : armed ? "松开刷新" : "下拉同步";

  return (
    <div
      ref={scroller}
      className={`ptr${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
    >
      <div
        className={`ptr__hint${refreshing || offset > 0 ? " ptr__hint--visible" : ""}`}
        style={{ height: refreshing ? 48 : offset }}
        aria-live="polite"
      >
        <span className={`ptr__spinner${refreshing ? " ptr__spinner--spin" : ""}`} aria-hidden="true" />
        <span className="ptr__label">{label}</span>
      </div>
      <div
        className="ptr__body"
        style={{
          transform: offset > 0 && !refreshing ? `translateY(${offset * 0.15}px)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
