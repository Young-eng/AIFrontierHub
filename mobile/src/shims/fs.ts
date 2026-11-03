import { get } from "idb-keyval";

const cache = new Map<string, string>();

export function readFileSync(path: string, _encoding?: string): string {
  const k = `fs:${path.replace(/\\/g, "/")}`;
  if (cache.has(k)) return cache.get(k)!;
  // userSources loads once at startup; return empty until hydrated.
  return "[]";
}

export async function hydrateSyncFile(path: string): Promise<void> {
  const k = `fs:${path.replace(/\\/g, "/")}`;
  const hit = await get<string>(k);
  if (hit != null) cache.set(k, hit);
}

export default { readFileSync };
