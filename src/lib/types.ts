export type SourceKind = "rss" | "atom" | "api" | "sitemap" | "listing";

export type ItemFact = { label: string; value: string; href?: string };

export type RelatedRef = {
  id: string;
  sourceName: string;
  title: string;
  excerpt: string;
};

export type SourceCategory =
  | "papers"
  | "models"
  | "labs"
  | "newsletter"
  | "news"
  | "cn-media"
  | "engineering"
  | "robotics";

export type ContentBlock = {
  type: "p" | "h" | "li" | "pre" | "quote";
  text: string;
};

export type ChannelHealth =
  | "active"
  | "slow"
  | "dormant"
  | "error"
  | "blocked_policy";

export type FeedItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  category: SourceCategory;
  title: string;
  /** Chinese display title (translated when original is English). */
  titleZh: string;
  url: string;
  /** Short excerpt from feed/API (may be English). */
  summary: string;
  /** Chinese paragraph shown in UI. */
  summaryZh: string;
  publishedAt: string | null;
  fetchedAt: string;
  /** True when the publisher's own feed carried the full article body. */
  fullText: boolean;
  /** Body as published in the feed. Stripped from /api/feed; served by /api/item. */
  content?: ContentBlock[];
  /** Structured details from the source's own fields (authors, likes, licence…). */
  facts?: ItemFact[];
  /** Label for `content` when it is not an article, e.g. a model card. */
  contentLabel?: string;
  /** Coverage of the same story by other sources, computed at sync time. */
  related?: RelatedRef[];
  /**
   * Publisher page the reader shows in an iframe, so the user's browser loads it
   * directly from the publisher. Set only where the page's headers allow framing.
   */
  embedUrl?: string;
};

export type SourceDef = {
  id: string;
  name: string;
  kind: SourceKind;
  category: SourceCategory;
  /** Only allowlisted absolute HTTPS URLs may be fetched. */
  endpoint: string;
  homepage: string;
  /** Why this endpoint is considered compliant to poll. */
  legalBasis: string;
  /** Max items retained per sync. */
  maxItems: number;
  enabled: boolean;
  /** General-tech sites: keep only items whose title or summary mention AI. */
  aiOnly?: boolean;
  /** Added by the user from the 来源状态 page rather than shipped in code. */
  custom?: boolean;
  /** Article pages send no X-Frame-Options / frame-ancestors, so the reader may frame them. */
  embed?: boolean;
  /**
   * For sitemap / listing kinds: keep only absolute URLs matching this regex.
   * Listing pages only extract matching links (title + URL), never article HTML bodies.
   */
  urlPattern?: string;
};

export type SourceSyncResult = {
  sourceId: string;
  sourceName: string;
  category: SourceCategory;
  ok: boolean;
  health: ChannelHealth;
  itemCount: number;
  latestPublishedAt: string | null;
  error?: string;
  fetchedAt: string;
};

export type QueueItem = {
  id: string;
  title: string;
  titleZh: string;
  url: string;
  sourceName: string;
  summaryZh: string;
  savedAt: string;
  summary?: string;
  category?: SourceCategory;
  publishedAt?: string | null;
  fullText?: boolean;
  content?: ContentBlock[];
  facts?: ItemFact[];
  embedUrl?: string;
  contentLabel?: string;
};
