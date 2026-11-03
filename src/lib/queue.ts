"use client";

import type { QueueItem } from "./types";

const KEY = "ai-trending-queue-v2";
export const QUEUE_EVENT = "ai-trending:queue";

export function loadQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQueue(items: QueueItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function addToQueue(item: Omit<QueueItem, "savedAt">): QueueItem[] {
  const current = loadQueue().filter((q) => q.id !== item.id);
  const next = [{ ...item, savedAt: new Date().toISOString() }, ...current];
  saveQueue(next);
  return next;
}

export function removeFromQueue(id: string): QueueItem[] {
  const next = loadQueue().filter((q) => q.id !== id);
  saveQueue(next);
  return next;
}

/** Stores the body once it has loaded, so the entry stays readable after it leaves the feed. */
export function patchQueueItem(id: string, patch: Partial<QueueItem>): void {
  const current = loadQueue();
  const prev = current.find((q) => q.id === id);
  if (!prev || (patch.content && prev.content && prev.content.length === patch.content.length)) return;
  saveQueue(current.map((q) => (q.id === id ? { ...q, ...patch, id: q.id, savedAt: q.savedAt } : q)));
}
