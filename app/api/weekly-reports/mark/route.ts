// POST   /api/weekly-reports/mark  { name, week_start, shared_on? }
// DELETE /api/weekly-reports/mark  { name, week_start }
//
// Admin/owner only. Marks a member's weekly report as submitted when it was
// shared outside VCoS, so it counts as filed everywhere and the daily Slack
// reminder stops. Stored as a content-less weekly_reports row with
// marked_submitted_by set (see scripts/weekly-reports-marked-submitted.sql).
// DELETE only ever removes a mark - never a report filed through VCoS.
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getTeamMembers } from "@/lib/team-db";
import { isManager } from "@/lib/roles";
import {
  fmtWeekRange,
  getMondayOfWeekPT,
  parseWeekStart,
  todayPT,
  weekLabelVariants,
  weekStartISO,
} from "@/lib/week-utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface MarkBody {
  name?: string;
  week_start?: string;
  shared_on?: string;
}

async function parse(
  req: NextRequest,
): Promise<
  | { error: NextResponse }
  | { name: string; monday: Date; sharedOn: string | null }
> {
  if (!isManager(req.headers.get("x-role")))
    return {
      error: NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      ),
    };

  let body: MarkBody;
  try {
    body = await req.json();
  } catch {
    return {
      error: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
  const { name, week_start, shared_on } = body;
  if (!name || !week_start || !ISO_DATE.test(week_start))
    return {
      error: NextResponse.json(
        { error: "name and week_start (YYYY-MM-DD) are required" },
        { status: 400 },
      ),
    };

  const monday = getMondayOfWeekPT(parseWeekStart(week_start));
  if (monday.getTime() > getMondayOfWeekPT().getTime())
    return {
      error: NextResponse.json(
        { error: "You can't mark a report for a future week." },
        { status: 400 },
      ),
    };

  const members = await getTeamMembers();
  if (!members.some((m) => m.full_name === name))
    return {
      error: NextResponse.json(
        { error: `${name} is not a team member` },
        { status: 400 },
      ),
    };

  if (shared_on !== undefined && !ISO_DATE.test(shared_on))
    return {
      error: NextResponse.json(
        { error: "shared_on must be YYYY-MM-DD" },
        { status: 400 },
      ),
    };

  return { name, monday, sharedOn: shared_on ?? null };
}

export async function POST(req: NextRequest) {
  const p = await parse(req);
  if ("error" in p) return p.error;
  const { name, monday, sharedOn } = p;

  // The day the report was shared drives its on-time/weekend/late badge.
  // Clamp to [week Monday, today] - it can't predate the week or be in the future.
  const minDay = weekStartISO(monday);
  const maxDay = todayPT();
  let day = sharedOn ?? maxDay;
  if (day < minDay) day = minDay;
  if (day > maxDay) day = maxDay;
  // 19:00 UTC is 11 AM / noon PT - always the same calendar day in PT.
  const createdAt = new Date(`${day}T19:00:00Z`).toISOString();

  const sb = getSupabase();
  const { data: existing, error: findErr } = await sb
    .from("weekly_reports")
    .select("id, marked_submitted_by")
    .eq("submitted_by", name)
    .in("week_label", weekLabelVariants(monday))
    .limit(1)
    .maybeSingle();
  if (findErr)
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (existing && !existing.marked_submitted_by)
    return NextResponse.json(
      { error: `${name} already filed a report for this week in VCoS.` },
      { status: 409 },
    );

  const fields = {
    submitted_by: name,
    week_label: fmtWeekRange(monday),
    marked_submitted_by: req.headers.get("x-user") ?? "admin",
    created_at: createdAt,
  };
  const { data, error } = existing
    ? await sb
        .from("weekly_reports")
        .update(fields)
        .eq("id", existing.id)
        .select("id")
        .single()
    : await sb.from("weekly_reports").insert(fields).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const p = await parse(req);
  if ("error" in p) return p.error;
  const { name, monday } = p;

  const { data, error } = await getSupabase()
    .from("weekly_reports")
    .delete()
    .eq("submitted_by", name)
    .in("week_label", weekLabelVariants(monday))
    .not("marked_submitted_by", "is", null)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length)
    return NextResponse.json(
      { error: "No manual mark found for that week." },
      { status: 404 },
    );
  return NextResponse.json({ ok: true });
}
