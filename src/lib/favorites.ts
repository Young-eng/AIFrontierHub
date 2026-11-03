"use client";

import type { QueueItem } from "./types";

const KEY = "ai-trending-favorites-v1";
export const FAVORITES_EVENT = "ai-trending:favorites";

export function loadFavorites(): QueueItem[] {
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

function saveFavorites(items: QueueItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(FAVORITES_EVENT));
}

/** Returns whether the item is favorited after the toggle. */
export function toggleFavorite(item: Omit<QueueItem, "savedAt">): boolean {
  const current = loadFavorites();
  const exists = current.some((q) => q.id === item.id);
  const next = exists
    ? current.filter((q) => q.id !== item.id)
    : [{ ...item, savedAt: new Date().toISOString() }, ...current];
  saveFavorites(next);
  return !exists;
}

export function removeFavorite(id: string): QueueItem[] {
  const next = loadFavorites().filter((q) => q.id !== id);
  saveFavorites(next);
  return next;
}

/** Stores the body once it has loaded, so the entry stays readable after it leaves the feed. */
export function patchFavorite(id: string, patch: Partial<QueueItem>): void {
  const current = loadFavorites();
  const prev = current.find((q) => q.id === id);
  if (!prev || (patch.content && prev.content && prev.content.length === patch.content.length)) return;
  saveFavorites(current.map((q) => (q.id === id ? { ...q, ...patch, id: q.id, savedAt: q.savedAt } : q)));
}
