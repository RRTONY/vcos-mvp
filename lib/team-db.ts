import { getSupabase } from "./supabase";

export interface TeamMemberRow {
  id: string;
  full_name: string;
  vcos_username: string | null;
  email: string | null;
  slack_aliases: string[];
  slack_user_id: string | null;
  clickup_key: string | null;
  clickup_user_id: string | null;
  braintrust_name: string | null;
  webwork_username: string | null;
  webwork_user_id: string | null;
  webwork_contract_id: string | null;
  fireflies_email: string | null;
  role_description: string | null;
  hourly_rate: number;
  bills_hours: boolean;
  files_report: boolean;
  active: boolean;
}

// In-process cache - avoids a DB round-trip on every request, flushes every 5 min
let _cache: TeamMemberRow[] | null = null;
let _cacheTime = 0;
const TTL_MS = 5 * 60 * 1000;

export async function getTeamMembers(
  activeOnly = true,
): Promise<TeamMemberRow[]> {
  if (_cache && Date.now() - _cacheTime < TTL_MS) {
    return activeOnly ? _cache.filter((m) => m.active) : _cache;
  }
  const sb = getSupabase();
  const { data } = await sb.from("team_members").select("*").order("full_name");
  _cache = (data ?? []) as TeamMemberRow[];
  _cacheTime = Date.now();
  return activeOnly ? _cache.filter((m) => m.active) : _cache;
}

export function invalidateTeamCache() {
  _cache = null;
  _cacheTime = 0;
}

/**
 * Map an auth username (e.g. "darryl") to its team-member row.
 * Used to bridge auth identity ↔ weekly_reports.submitted_by (full name).
 */
export async function getTeamMemberByUsername(
  username: string,
): Promise<TeamMemberRow | null> {
  if (!username) return null;
  const all = await getTeamMembers(false);
  const uname = username.toLowerCase();
  return (
    all.find((m) => (m.vcos_username ?? "").toLowerCase() === uname) ?? null
  );
}
