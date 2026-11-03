/**
 * API key storage. Desktop/web uses localStorage.
 * Native (Capacitor) installs a Preferences-backed store via installSecretStore().
 */

const KEY = "DEEPSEEK_API_KEY";
const LEGACY_KEY = "TRANSLATE_API_KEY";

export type SecretStore = {
  get: () => Promise<string>;
  set: (value: string) => Promise<void>;
};

let memoryKey: string | null = null;

const defaultStore: SecretStore = {
  async get() {
    if (typeof window === "undefined") return "";
    try {
      return (
        window.localStorage.getItem(KEY) ||
        window.localStorage.getItem(LEGACY_KEY) ||
        ""
      ).trim();
    } catch {
      return "";
    }
  },
  async set(value: string) {
    if (typeof window === "undefined") return;
    const next = value.trim();
    try {
      if (next) window.localStorage.setItem(KEY, next);
      else {
        window.localStorage.removeItem(KEY);
        window.localStorage.removeItem(LEGACY_KEY);
      }
    } catch {
      /* ignore quota / private mode */
    }
  },
};

let store: SecretStore = defaultStore;

/** Mobile shell calls this once at boot to use Capacitor Preferences. */
export function installSecretStore(next: SecretStore): void {
  store = next;
}

export async function hydrateSecrets(): Promise<void> {
  memoryKey = (await store.get()).trim();
}

export async function saveApiKey(value: string): Promise<void> {
  const next = value.trim();
  memoryKey = next;
  await store.set(next);
}

/** Sync read for hot paths (translate). Call hydrateSecrets() at startup first. */
export function readApiKeySync(): string {
  if (memoryKey !== null) return memoryKey;
  if (typeof window === "undefined") return "";
  try {
    return (
      window.localStorage.getItem(KEY) ||
      window.localStorage.getItem(LEGACY_KEY) ||
      ""
    ).trim();
  } catch {
    return "";
  }
}

export async function readApiKey(): Promise<string> {
  if (memoryKey !== null) return memoryKey;
  memoryKey = (await store.get()).trim();
  return memoryKey;
}
