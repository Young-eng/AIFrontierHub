import { decodeEntities } from "./compliance";
import type { ContentBlock } from "./types";

function inline(text: string): string {
  return decodeEntities(
    text
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(^|\W)[*_](\S.*?\S|\S)[*_](?=\W|$)/g, "$1$2"),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Model cards and READMEs → plain-text blocks. Badges, images and raw HTML are dropped. */
export function markdownToBlocks(markdown: string): ContentBlock[] {
  const src = markdown
    .replace(/^\uFEFF/, "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n/g, "\n");

  const blocks: ContentBlock[] = [];
  let para: string[] = [];
  let code: string[] | null = null;
  let table: string[] = [];

  const flushPara = () => {
    const text = inline(para.join(" "));
    if (text) blocks.push({ type: "p", text });
    para = [];
  };
  const flushTable = () => {
    const rows = table.filter((r) => !/^\|?\s*:?-{2,}/.test(r.trim()));
    if (rows.length) {
      blocks.push({
        type: "pre",
        text: rows
          .map((r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c)).join("  |  "))
          .join("\n"),
      });
    }
    table = [];
  };

  for (const line of src.split("\n")) {
    if (code) {
      if (/^\s*```/.test(line)) {
        if (code.length) blocks.push({ type: "pre", text: code.join("\n").replace(/\s+$/, "") });
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushPara();
      flushTable();
      code = [];
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flushPara();
      table.push(line);
      continue;
    }
    if (table.length) flushTable();

    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      continue;
    }
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flushPara();
      const text = inline(heading[1]);
      if (text) blocks.push({ type: "h", text });
      continue;
    }
    const item = trimmed.match(/^([-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      flushPara();
      const text = inline(item[2]);
      if (text) blocks.push({ type: "li", text });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushPara();
      const text = inline(trimmed.replace(/^>+\s?/, ""));
      if (text) blocks.push({ type: "quote", text });
      continue;
    }
    para.push(trimmed);
  }
  if (code?.length) blocks.push({ type: "pre", text: code.join("\n") });
  flushPara();
  flushTable();
  return blocks;
}
