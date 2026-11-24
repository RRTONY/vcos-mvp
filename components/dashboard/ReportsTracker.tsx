"use client";

// Weekly reports tracker (admin dashboard). One row per person who owes a
// report for the selected week, with the existing report statuses, a Slack
// nudge bell and "Mark done" on every row not yet submitted.
//   - Nudges: /api/weekly-reports/nudge (logged, one per person per day).
//   - Mark done / Undo: /api/weekly-reports/mark (saved as a weekly_reports
//     row with marked_submitted_by, so it counts everywhere).
import { useCallback, useEffect, useState } from "react";
import { FiBell, FiCheck } from "react-icons/fi";
import Avatar from "@/components/Avatar";
import Spinner from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { reportState } from "@/lib/report-status";
import { isReportFrom } from "@/lib/report-match";
import { fmtWeekRange, weekStartISO } from "@/lib/week-utils";
import type { ClickUpData } from "@/lib/types";
import { avatarFor, type DashMember, type DashReport } from "./types";

export type TrackerStatus = "submitted" | "late" | "pending" | "missing";

export interface TrackerRow {
  member: DashMember;
  status: TrackerStatus;
  report: DashReport | null;
  /** Filed only as a hand-written post in #weeklyreports (no VCoS record). */
  slackOnly: boolean;
}

/** Status of every person who owes a report for the week. Shared with the stat tile. */
export function trackerRows(
  members: DashMember[],
  reports: DashReport[],
  slackFiled: string[],
  monday: Date,
): TrackerRow[] {
  return members
    .filter((m) => m.filesReport)
    .map((member) => {
      const report = reports.find((r) => isReportFrom(r.submitted_by, member.name)) ?? null;
      const st = reportState(monday, report?.created_at ?? null);
      const slackOnly = !report && slackFiled.includes(member.name);
      const status: TrackerStatus = slackOnly
        ? "submitted"
        : st === "on-time"
          ? "submitted"
          : st === "weekend" || st === "late"
            ? "late"
            : st;
      return { member, status, report, slackOnly };
    });
}

const PILL: Record<TrackerStatus, { label: string; cls: string }> = {
  submitted: { label: "Submitted", cls: "green" },
  late: { label: "Submitted late", cls: "amber" },
  pending: { label: "Not submitted yet", cls: "gray" },
  missing: { label: "Not submitted", cls: "red" },
};

type Filter = "all" | "missing" | "done";

export default function ReportsTracker({
  rows,
  monday,
  clickup,
  loading,
  onChanged,
}: {
  rows: TrackerRow[];
  monday: Date;
  clickup: ClickUpData | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [nudged, setNudged] = useState<Record<string, string>>({}); // name → sent_at
  const [busy, setBusy] = useState<string | null>(null); // row name, or "__all"
  const weekStart = weekStartISO(monday);
  const weekLabel = fmtWeekRange(monday);

  const loadNudges = useCallback(() => {
    fetch(`/api/weekly-reports/nudge?week_start=${weekStart}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { nudges?: { member_name: string; sent_at: string }[] }) => {
        const map: Record<string, string> = {};
        for (const n of d.nudges ?? []) if (!map[n.member_name]) map[n.member_name] = n.sent_at;
        setNudged(map);
      })
      .catch(() => {});
  }, [weekStart]);
  useEffect(loadNudges, [loadNudges]);

  const open = (r: TrackerRow) => r.status === "pending" || r.status === "missing";
  const notIn = rows.filter(open);
  const shown = filter === "all" ? rows : rows.filter((r) => (filter === "missing" ? open(r) : !open(r)));
  const count = (s: TrackerStatus[]) => rows.filter((r) => s.includes(r.status)).length;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const nudgedToday = (name: string) =>
    !!nudged[name] &&
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(nudged[name])) === today;
  const toNudge = notIn.filter((r) => !nudgedToday(r.member.name));

  async function nudge(names: string[], key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/weekly-reports/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names, week_start: weekStart }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Nudge failed");
      const parts: string[] = [];
      if (d.sent?.length) parts.push(`Nudged ${d.sent.map((n: string) => n.split(" ")[0]).join(", ")} on Slack`);
      for (const s of [...(d.skipped ?? []), ...(d.failed ?? [])])
        parts.push(`${s.name.split(" ")[0]}: ${s.reason}`);
      toast(parts.join(". ") || "Nothing to send");
      loadNudges();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Nudge failed");
    } finally {
      setBusy(null);
    }
  }

  async function mark(name: string, undo: boolean) {
    setBusy(name);
    try {
      const res = await fetch("/api/weekly-reports/mark", {
        method: undo ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, week_start: weekStart }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't save");
      toast(
        undo
          ? `${name.split(" ")[0]}'s report is back to not submitted`
          : `${name.split(" ")[0]}'s report marked done`,
      );
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  }

  const friday = new Date(monday.getTime() + 4 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <section id="reports" className="ad-card flex-[999_1_560px]">
      <div className="ad-card-head">
        <div>
          <h2>Weekly reports</h2>
          <p>
            Due end of day {friday} · who has filed for {weekLabel}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="ad-count ad-pill green">{count(["submitted"])} Submitted</span>
          <span className="ad-count ad-pill amber">{count(["late"])} Late</span>
          <span className="ad-count ad-pill red">{count(["pending", "missing"])} Not submitted</span>
        </div>
      </div>

      <div className="px-5 sm:px-6 pb-2 flex gap-1.5 flex-wrap" role="group" aria-label="Filter reports">
        {(
          [
            ["all", `All ${rows.length}`],
            ["missing", "Not submitted"],
            ["done", "Submitted"],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" className="ad-filter" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
        <button
          type="button"
          className="ad-btn outline-navy sm:ml-auto"
          disabled={!toNudge.length || busy !== null}
          onClick={() => nudge(toNudge.map((r) => r.member.name), "__all")}
        >
          {busy === "__all" && <Spinner label="Sending" />}
          {notIn.length === 0
            ? "Everyone has submitted"
            : toNudge.length === 0
              ? "Everyone missing was nudged today"
              : `Nudge all ${toNudge.length} on Slack`}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 px-5 sm:px-6 pb-4">
        {loading && rows.length === 0 ? (
          <div className="text-sm text-[#475467] py-3"><Spinner label="Loading reports" /></div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-[#475467] py-3">Nobody in this view.</p>
        ) : (
          shown.map((r) => {
            const name = r.member.name;
            const manual = !!r.report?.marked_submitted_by;
            const sent = nudgedToday(name);
            const av = avatarFor(clickup, r.member.cuKey);
            const note = manual
              ? "Marked done manually"
              : r.slackOnly
                ? "Posted in Slack"
                : nudged[name]
                  ? `Nudged ${new Date(nudged[name]).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" })}`
                  : r.member.role;
            const pill = PILL[r.status];
            return (
              <div key={name} className="ad-row flex items-center justify-between gap-2.5 py-2 min-w-0 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0 flex-[1_1_170px]">
                  <Avatar name={name} image={av?.image} initials={av?.initials} color={av?.color} className="w-8 h-8 text-[11px] flex-none" />
                  <span className="min-w-0">
                    <span className="block font-bold text-sm truncate">{name}</span>
                    <span className="block text-xs text-[#475467] truncate">{note}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-none">
                  {open(r) && (
                    <>
                      <button
                        type="button"
                        className={`ad-icon-btn ${sent ? "nudged" : ""}`}
                        aria-label={sent ? `${name} was nudged on Slack today` : `Nudge ${name} on Slack`}
                        title={sent ? "Nudged on Slack today (one nudge per person per day)" : `Nudge ${name} on Slack`}
                        disabled={busy !== null || sent}
                        onClick={() => nudge([name], name)}
                      >
                        {busy === name ? <Spinner /> : <FiBell aria-hidden="true" size={18} />}
                      </button>
                      <button
                        type="button"
                        className="ad-btn"
                        title="Handed in outside VCoS? Mark it as submitted"
                        disabled={busy !== null}
                        onClick={() => mark(name, false)}
                      >
                        <FiCheck aria-hidden="true" size={14} strokeWidth={3} />
                        Mark done
                      </button>
                    </>
                  )}
                  {manual && (
                    <button
                      type="button"
                      className="min-h-[44px] px-2.5 text-xs font-bold text-[#3730A3] underline disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={() => mark(name, true)}
                    >
                      Undo
                    </button>
                  )}
                  <span className={`ad-pill ${pill.cls} ${manual ? "manual" : ""}`}>{pill.label}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
