// Shapes shared by the admin dashboard sections (components/dashboard/*).
import type { ClickUpData } from "@/lib/types";

export interface DashMember {
  name: string;
  cuKey: string;
  role: string;
  filesReport: boolean;
}

export interface DashReport {
  id: string;
  submitted_by: string;
  created_at: string;
  /** Set when an admin marked the report done because it was handed in outside VCoS. */
  marked_submitted_by?: string | null;
}

export type Stats = { total: number; overdue: number; urgent: number };
export type Avatar = { image: string | null; initials: string | null; color: string | null };

/** Snapshot maps are keyed by list owner; a person is found by `key.includes(cuKey)`. */
function lookup<T>(map: Record<string, T> | undefined, cuKey: string): T | null {
  if (!map || !cuKey) return null;
  const key = Object.keys(map).find((k) => k.includes(cuKey.toLowerCase()));
  return key ? map[key] : null;
}
export const statsFor = (cu: ClickUpData | null, cuKey: string) =>
  lookup<Stats>(cu?.assigneeStats, cuKey);
export const avatarFor = (cu: ClickUpData | null, cuKey: string) =>
  lookup<Avatar>((cu as { assigneeAvatars?: Record<string, Avatar> } | null)?.assigneeAvatars, cuKey);

/** On time % = (open - overdue) / open; null when there are no open tasks. */
export function onTimePct(s: Stats | null): number | null {
  return s && s.total > 0 ? Math.round(((s.total - s.overdue) / s.total) * 100) : null;
}
/** Bar colour: 80%+ green, 65-79% amber, below 65% red. */
export function onTimeColor(pct: number): string {
  return pct >= 80 ? "bg-[#067647]" : pct >= 65 ? "bg-[#B54708]" : "bg-[#B42318]";
}
