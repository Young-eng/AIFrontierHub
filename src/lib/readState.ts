"use client";

const KEY = "ai-trending-read-v1";
const MAX_IDS = 3000;

export function loadReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markRead(id: string): Set<string> {
  const ids = [...loadReadIds()].filter((x) => x !== id);
  ids.push(id);
  const trimmed = ids.slice(-MAX_IDS);
  localStorage.setItem(KEY, JSON.stringify(trimmed));
  return new Set(trimmed);
}
