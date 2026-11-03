"use client";

import { useCallback, useEffect, useRef } from "react";

type Closer = () => boolean;

const stack: Closer[] = [];

/** Register a handler that returns true if it consumed the system/gesture back. */
export function registerBackCloser(closer: Closer): () => void {
  stack.push(closer);
  return () => {
    const i = stack.lastIndexOf(closer);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Try top-most overlay first (e.g. article reader). */
export function consumeBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]()) return true;
  }
  return false;
}

/**
 * Push a history entry while the reader is open so Android gesture / hardware
 * back closes the reader instead of leaving the current tab.
 */
export function useReaderBack(open: boolean, onClose: () => void): () => void {
  const pushed = useRef(false);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  openRef.current = open;
  onCloseRef.current = onClose;

  const close = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    onCloseRef.current();
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    window.history.pushState({ frontierReader: true }, "");
    pushed.current = true;

    const onPop = () => {
      if (!openRef.current) return;
      openRef.current = false;
      pushed.current = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);

    const unregister = registerBackCloser(() => {
      if (!openRef.current) return false;
      close();
      return true;
    });

    return () => {
      window.removeEventListener("popstate", onPop);
      unregister();
      // Do not history.back() here — it fights tab navigation when unmounting.
      pushed.current = false;
    };
  }, [open, close]);

  return close;
}
