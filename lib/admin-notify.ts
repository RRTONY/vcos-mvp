// Slack notifications for VCoS admins (access requests, approvals).
//
// Posts to the admin channel first. If that fails - e.g. the bot was never
// invited to the private admin channel - each active admin gets the same
// message as a direct message instead, so alerts are never silently lost.
// Owners are not DMed by the fallback; they see the channel once it works.
import { getSupabase } from "@/lib/supabase";
import { getTeamMembers, type TeamMemberRow } from "@/lib/team-db";
import { usersList, postMessage } from "@/lib/slack";
import { SLACK_ADMIN_CHANNEL } from "@/lib/constants";

export interface SlackUser {
  id: string;
  deleted?: boolean;
  is_bot?: boolean;
  real_name?: string;
  profile?: { email?: string; real_name?: string; display_name?: string };
}

/** Lookup maps over the live workspace's people (bots/deleted skipped). */
export function slackUserIndex(users: SlackUser[]) {
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const u of users) {
    if (u.deleted || u.is_bot) continue;
    const email = u.profile?.email?.toLowerCase();
    if (email) byEmail.set(email, u.id);
    const real = (u.profile?.real_name ?? u.real_name ?? "").toLowerCase();
    if (real) byName.set(real, u.id);
  }
  return { byEmail, byName };
}

/**
 * A team member's Slack user ID: (1) team_members.slack_user_id, (2) email
 * match against the workspace, (3) exact real-name match. Null if none.
 */
export function resolveSlackUserId(
  member: Pick<TeamMemberRow, "slack_user_id" | "email"> | null | undefined,
  fullName: string,
  index: ReturnType<typeof slackUserIndex>,
  extraEmail?: string | null,
): string | null {
  if (member?.slack_user_id) return member.slack_user_id;
  for (const e of [member?.email, extraEmail]) {
    const id = e ? index.byEmail.get(e.toLowerCase()) : undefined;
    if (id) return id;
  }
  return fullName ? (index.byName.get(fullName.toLowerCase()) ?? null) : null;
}

export async function notifyAdmins(
  text: string,
): Promise<{ channel: boolean; dmed: string[]; unreachable: string[] }> {
  const channel = process.env.SLACK_ADMIN_CHANNEL ?? SLACK_ADMIN_CHANNEL;
  try {
    await postMessage(channel, text);
    return { channel: true, dmed: [], unreachable: [] };
  } catch (e) {
    console.error("[admin-notify] admin channel post failed:", e);
  }

  const [{ data: admins }, members, slackUsers] = await Promise.all([
    getSupabase()
      .from("vcos_users")
      .select("username, email")
      .eq("role", "admin")
      .eq("status", "active"),
    getTeamMembers(false),
    usersList()
      .then((r: { members?: SlackUser[] }) => r.members ?? [])
      .catch(() => [] as SlackUser[]),
  ]);
  const index = slackUserIndex(slackUsers);

  const dmed: string[] = [];
  const unreachable: string[] = [];
  for (const a of (admins ?? []) as { username: string; email: string }[]) {
    const m = members.find(
      (x) => (x.vcos_username ?? "").toLowerCase() === a.username.toLowerCase(),
    );
    const uid = resolveSlackUserId(m, m?.full_name ?? "", index, a.email);
    if (!uid) {
      unreachable.push(a.username);
      continue;
    }
    try {
      await postMessage(uid, text);
      dmed.push(a.username);
    } catch (e) {
      console.error(`[admin-notify] DM to ${a.username} failed:`, e);
      unreachable.push(a.username);
    }
  }
  if (unreachable.length)
    console.error("[admin-notify] admins not reached:", unreachable);
  return { channel: false, dmed, unreachable };
}
