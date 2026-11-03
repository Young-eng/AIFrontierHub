import type { SourceCategory } from "./types";

/** Daily scan order; minutes add up to the 30-minute discovery budget. */
export const LANES: { id: SourceCategory; label: string; minutes: number }[] = [
  { id: "papers", label: "论文", minutes: 6 },
  { id: "models", label: "模型", minutes: 3 },
  { id: "labs", label: "实验室", minutes: 4 },
  { id: "robotics", label: "具身", minutes: 4 },
  { id: "engineering", label: "工程", minutes: 3 },
  { id: "newsletter", label: "通讯", minutes: 3 },
  { id: "news", label: "外媒", minutes: 3 },
  { id: "cn-media", label: "中文", minutes: 4 },
];

export function laneLabel(id: SourceCategory): string {
  return LANES.find((l) => l.id === id)?.label ?? id;
}
