// Server-side reads of the weekly_reports table shared by the Slack snapshot
// (daily reminder) and the compliance DM route, so "who filed" always comes
// from the same place - including reports an admin marked as submitted.
import { getSupabase } from "@/lib/supabase";
import { weekLabelVariants } from "@/lib/week-utils";
import { isReportFrom } from "@/lib/report-match";

/** submitted_by names with a weekly_reports row for the given week. */
export async function reportersForWeek(monday: Date): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("weekly_reports")
    .select("submitted_by")
    .in("week_label", weekLabelVariants(monday));
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { submitted_by: string }) => r.submitted_by);
}

/** The subset of `fullNames` that has a weekly_reports row in `reporters`. */
export function namesWhoFiled(
  fullNames: string[],
  reporters: string[],
): string[] {
  return fullNames.filter((n) => reporters.some((r) => isReportFrom(r, n)));
}
