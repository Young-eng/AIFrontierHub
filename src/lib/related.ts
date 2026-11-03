import type { FeedItem, RelatedRef } from "./types";

/** Words too generic to tie two stories together. */
const STOP = new Set(
  (
    "the a an and or of to in on for with by from at as is are was be this that these those how what why when " +
    "new now our your you we it its into over more most about using use via vs not can will just than also " +
    "ai llm llms model models open source update updates release released launch launches introducing announcing " +
    "part day week news weekly issue blog post report guide data research paper study learning based towards " +
    "large language agent agents system systems tool tools first one two three year years google microsoft " +
    "openai nvidia meta apple amazon aws hugging face github python"
  ).split(" "),
);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Latin tokens survive translation, so "Gemini 4 Argon" links an English blog post
 * to a Chinese news story. Digits join their neighbour ("gpt-6", "v4.1").
 */
function tokens(item: FeedItem): Set<string> {
  const text = `${item.title} ${item.titleZh} ${item.summary.slice(0, 240)}`;
  const out = new Set<string>();
  for (const raw of text.match(/[A-Za-z][A-Za-z0-9.+-]*[A-Za-z0-9]|[A-Za-z]/g) ?? []) {
    const t = raw.toLowerCase().replace(/[.-]+$/, "");
    if (t.length < 3 || STOP.has(t)) continue;
    out.add(t);
  }
  return out;
}

function excerpt(item: FeedItem): string {
  const s = item.summaryZh || item.summary || "";
  return s.length > 120 ? `${s.slice(0, 119)}…` : s;
}

export function attachRelated(items: FeedItem[], maxPerItem = 4): FeedItem[] {
  const toks = items.map(tokens);
  const df = new Map<string, number>();
  for (const set of toks) for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
  const n = items.length;
  const idf = (t: string) => Math.log(n / (df.get(t) ?? 1));
  const time = items.map((i) => (i.publishedAt ? new Date(i.publishedAt).getTime() : null));

  return items.map((item, i) => {
    if (item.category === "papers" || item.category === "models") return item;
    const scored: { j: number; score: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const other = items[j];
      if (other.sourceId === item.sourceId) continue;
      const ti = time[i];
      const tj = time[j];
      if (ti && tj && Math.abs(ti - tj) > 10 * DAY_MS) continue;

      let score = 0;
      let shared = 0;
      for (const t of toks[i]) {
        if (!toks[j].has(t)) continue;
        // Ignore tokens that appear across a big slice of the feed.
        if ((df.get(t) ?? 0) > n * 0.04) continue;
        score += idf(t);
        shared += 1;
      }
      if (shared >= 2 && score >= 8) scored.push({ j, score });
    }
    if (scored.length === 0) return item;
    scored.sort((a, b) => b.score - a.score);
    const related: RelatedRef[] = scored.slice(0, maxPerItem).map(({ j }) => ({
      id: items[j].id,
      sourceName: items[j].sourceName,
      title: items[j].titleZh || items[j].title,
      excerpt: excerpt(items[j]),
    }));
    return { ...item, related };
  });
}
