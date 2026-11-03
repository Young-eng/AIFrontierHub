function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createHash(_algo: string) {
  let data = "";
  return {
    update(chunk: string) {
      data += chunk;
      return this;
    },
    digest(_encoding: string) {
      // Synchronous digest is not available in Web Crypto; callers await via thenable misuse.
      // ingest only needs a stable id — use a sync FNV-1a style hash for the mobile build.
      let h = 2166136261;
      for (let i = 0; i < data.length; i++) {
        h ^= data.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0).toString(16).padStart(8, "0") + data.length.toString(16).padStart(8, "0");
    },
  };
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(buf);
}

export default { createHash };
