import { get, set, del } from "idb-keyval";

const mem = new Map<string, string>();

function keyOf(p: string): string {
  return `fs:${p.replace(/\\/g, "/")}`;
}

export async function mkdir(_path: string, _opts?: { recursive?: boolean }): Promise<void> {
  /* IndexedDB has no directories */
}

export async function readFile(path: string, _encoding?: string): Promise<string> {
  const k = keyOf(path);
  const hit = mem.get(k) ?? (await get<string>(k));
  if (hit == null) {
    const err = Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    throw err;
  }
  mem.set(k, hit);
  return hit;
}

export async function writeFile(path: string, data: string): Promise<void> {
  const k = keyOf(path);
  mem.set(k, data);
  await set(k, data);
}

export async function rename(from: string, to: string): Promise<void> {
  const raw = await readFile(from);
  await writeFile(to, raw);
  await del(keyOf(from));
  mem.delete(keyOf(from));
}

export async function stat(path: string): Promise<{ mtimeMs: number }> {
  await readFile(path);
  return { mtimeMs: Date.now() };
}
