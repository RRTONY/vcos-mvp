"use client";

import { useEffect, useState } from "react";
import type { WebWorkMember } from "@/lib/types";
import { useMe } from "@/hooks/useMe";
import WeekCalendar from "@/components/WeekCalendar";
import {
  FiCheck,
  FiAlertTriangle,
} from "react-icons/fi";
import Spinner from "@/components/Spinner";
import {
  classifySubmission,
  SUBMIT_STATUS_META,
  reportDeadlinePassed,
  type SubmitStatus,
} from "@/lib/report-status";
import dynamic from "next/dynamic";
const HoursBar = dynamic(() => import("@/components/charts/HoursBar"), {
  ssr: false,
});
const TrendCards = dynamic(() => import("@/components/charts/TrendCards"), {
  ssr: false,
});

// ─── Types ──────────────────────────────────────────────────────────────────

interface WeeklyReportFull {
  id: string;
  submitted_by: string;
  week_label: string;
  blockers: string | null;
  escalations: string | null;
  priorities: string | null;
  goals_met: string | null;
  win: string | null;
  accomplishments: string | null;
  friction: string | null;
  went_well: string | null;
  support_needed: string | null;
  whats_new: string | null;
  created_at: string;
  ai_analysis: {
    summary: string;
    insights: string[];
    actions: string[];
  } | null;
}

import {
  getMondayOfWeekPT,
  shiftWeeks,
  fmtWeekRange,
  weekStartISO,
} from "@/lib/week-utils";
const getMostRecentMonday = getMondayOfWeekPT;
const fmtWeekLabel = fmtWeekRange;

function ReportField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-1">
        {label}
      </div>
      <p className="text-sm text-ink2 whitespace-pre-line leading-relaxed">
        {value}
      </p>
    </div>
  );
}

function WeeklyReportCard({
  r,
  weekMonday,
  isMine,
}: {
  r: WeeklyReportFull;
  weekMonday: Date;
  isMine: boolean;
}) {
  const [open, setOpen] = useState(false);
  const submittedAt = new Date(r.created_at);
  const status = classifySubmission(r.created_at, weekMonday);
  const meta = SUBMIT_STATUS_META[status];
  const dateStr = submittedAt.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={`border ${isMine ? "border-accent/50" : status === "on-time" ? "border-sand3" : meta.border}`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sand3/40 transition-colors"
      >
        <div
          className={`w-7 h-7 flex items-center justify-center text-xs font-bold flex-shrink-0 ${isMine ? "bg-accent text-white" : "bg-sand2 text-ink"}`}
        >
          {r.submitted_by[0]}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold">{r.submitted_by}</span>
          {isMine && (
            <span className="text-[10px] font-bold text-accent ml-2">YOU</span>
          )}
          <span
            className={`text-[10px] font-bold ml-2 ${meta.text}`}
            title={meta.long}
          >
            {meta.label}
          </span>
        </div>
        {r.win && (
          <span className="text-xs text-ink3 truncate hidden sm:block max-w-xs italic">
            "{r.win}"
          </span>
        )}
        {r.ai_analysis && (
          <span className="text-[10px] font-bold text-accent border border-accent px-1.5 py-0.5 flex-shrink-0">
            AI
          </span>
        )}
        <span className="text-xs text-ink4 flex-shrink-0">{dateStr}</span>
        <span className="text-ink4 text-xs ml-1">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-sand3 px-4 py-4 space-y-4">
          {r.ai_analysis && (
            <div className="bg-sand2 p-3 space-y-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                AI Summary
              </div>
              <p className="text-sm text-ink2 leading-relaxed">
                {r.ai_analysis.summary}
              </p>
              {r.ai_analysis.insights?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-ink3 mb-1">
                    Key Insights
                  </div>
                  <ul className="space-y-1">
                    {r.ai_analysis.insights.map((ins, i) => (
                      <li key={i} className="text-xs text-ink2 flex gap-2">
                        <span className="text-ink4 shrink-0">◆</span>
                        <span>{ins}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {r.ai_analysis.actions?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-ink3 mb-1">
                    Recommended Actions
                  </div>
                  <ul className="space-y-1">
                    {r.ai_analysis.actions.map((act, i) => (
                      <li key={i} className="text-xs text-ink2 flex gap-2">
                        <span className="text-amber-500 shrink-0">→</span>
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <ReportField label="1. Blockers / At Risk" value={r.blockers} />
          <ReportField label="2. Escalations" value={r.escalations} />
          <ReportField label="3. Next Week Priorities" value={r.priorities} />
          <ReportField
            label="4. Last Week - Done vs. Not Done"
            value={r.goals_met}
          />
          <ReportField
            label="5. Top Accomplishment & Business Impact"
            value={r.win}
          />
          <ReportField
            label="6. Full Accomplishments by Area"
            value={r.accomplishments}
          />
          <ReportField label="7. What Didn't Go Well" value={r.friction} />
          <ReportField label="8. What Went Well" value={r.went_well} />
          <ReportField
            label="9. Support Needed from Others"
            value={r.support_needed}
          />
          <ReportField label="10. Personal Notes" value={r.whats_new} />
        </div>
      )}
    </div>
  );
}

/** Team → "Weekly reports" (view="submitted") or "Hours" (view="hours"). */
export default function ReportsPanel({
  view: tab,
}: {
  view: "submitted" | "hours";
}) {
  const [reportMembers, setReportMembers] = useState<string[]>([]);
  const { isAdmin, me } = useMe();
  const [weekMon, setWeekMon] = useState<Date>(() =>
    getMostRecentMonday(new Date()),
  );
  const [weekReports, setWeekReports] = useState<WeeklyReportFull[]>([]);
  const [weekReportsLoading, setWeekReportsLoading] = useState(false);
  const [filterMember, setFilterMember] = useState("");
  const [webworkData, setWebworkData] = useState<{
    week: string[];
    lastWeek?: string[];
    members: WebWorkMember[];
    error?: string;
    incomplete?: boolean;
  } | null>(null);
  const [webworkLoading, setWebworkLoading] = useState(false);
  const [hoursWeekMon, setHoursWeekMon] = useState<Date>(() =>
    getMostRecentMonday(new Date()),
  );

  useEffect(() => {
    fetch("/api/team", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (
          data: Array<{
            full_name: string;
            clickup_key: string | null;
            role_description: string | null;
            files_report: boolean;
            active: boolean;
          }>,
        ) => {
          const active = (data ?? []).filter((m) => m.active);
          setReportMembers(
            active.filter((m) => m.files_report).map((m) => m.full_name),
          );
        },
      )
      .catch(() => {});
  }, []);

  async function fetchWebwork(monday: Date) {
    setWebworkLoading(true);
    // Only the current week is cached server-side; any other week is fetched live.
    const isCurrent =
      monday.getTime() === getMostRecentMonday(new Date()).getTime();
    const url = isCurrent
      ? "/api/webwork"
      : `/api/webwork?week_start=${weekStartISO(monday)}`;
    const res = await fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    setWebworkData(res);
    setWebworkLoading(false);
  }

  // "Retry" needs to actually re-pull from WebWork, not just re-read the same
  // stale cache - for the current week, GET only reads Supabase's cache, so a
  // failed/incomplete snapshot would come back unchanged. POST forces a live
  // fetch and refreshes that cache; other weeks already fetch live on GET.
  async function retryWebwork(monday: Date) {
    setWebworkLoading(true);
    const isCurrent =
      monday.getTime() === getMostRecentMonday(new Date()).getTime();
    const res = isCurrent
      ? await fetch("/api/webwork", { method: "POST" })
          .then((r) => r.json())
          .catch(() => null)
      : await fetch(`/api/webwork?week_start=${weekStartISO(monday)}`, {
          cache: "no-store",
        })
          .then((r) => r.json())
          .catch(() => null);
    setWebworkData(res);
    setWebworkLoading(false);
  }

  async function fetchSubmittedForWeek(mon: Date) {
    setWeekReportsLoading(true);
    const weekStart = weekStartISO(mon);
    const res = await fetch(`/api/weekly-reports?week_start=${weekStart}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .catch(() => []);
    setWeekReports(Array.isArray(res) ? res : []);
    setWeekReportsLoading(false);
  }

  useEffect(() => {
    if (tab === "hours") fetchWebwork(hoursWeekMon);
    if (tab === "submitted") fetchSubmittedForWeek(weekMon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab === "submitted") fetchSubmittedForWeek(weekMon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekMon]);

  useEffect(() => {
    if (tab === "hours") fetchWebwork(hoursWeekMon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoursWeekMon]);

  return (
    <div>

      {/* ── SUBMITTED REPORTS TAB ───────────────────────────── */}
      {tab === "submitted" &&
        (() => {
          const currentMonday = getMostRecentMonday(new Date());
          const isCurrentWeek = weekMon.getTime() === currentMonday.getTime();
          const myName = me?.fullName ?? null;
          // The API already restricts non-managers to their own reports; the UI
          // mirrors that by hiding the team roster/filter for them.

          const filtered = weekReports.filter(
            (r) => !filterMember || r.submitted_by === filterMember,
          );
          const statusOf = (r: WeeklyReportFull): SubmitStatus =>
            classifySubmission(r.created_at, weekMon);
          // On-time → weekend → late
          const orderRank: Record<SubmitStatus, number> = {
            "on-time": 0,
            weekend: 1,
            late: 2,
          };
          const sorted = [...filtered].sort(
            (a, b) => orderRank[statusOf(a)] - orderRank[statusOf(b)],
          );

          const submittedNames = new Set(
            weekReports.map((r) => r.submitted_by),
          );
          const onTimeCount = weekReports.filter(
            (r) => statusOf(r) === "on-time",
          ).length;
          const weekendCount = weekReports.filter(
            (r) => statusOf(r) === "weekend",
          ).length;
          const lateCount = weekReports.filter(
            (r) => statusOf(r) === "late",
          ).length;
          // Not-filed counts as "missing" only after Friday; before then it's pending.
          const deadlinePassed = reportDeadlinePassed(weekMon);
          const notFiled = reportMembers.filter((n) => !submittedNames.has(n));
          const missingCount = deadlinePassed ? notFiled.length : 0;
          const pendingCount = deadlinePassed ? 0 : notFiled.length;

          return (
            <div className="space-y-4">
              {/* Week navigation */}
              <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
                <button
                  onClick={() => setWeekMon((d) => shiftWeeks(d, -1))}
                  className="text-ink4 hover:text-ink text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-sand3 transition-colors"
                  title="Previous week"
                >
                  ‹
                </button>
                <span className="text-sm font-semibold tabular-nums">
                  {fmtWeekLabel(weekMon)}
                </span>
                <button
                  onClick={() => setWeekMon((d) => shiftWeeks(d, 1))}
                  disabled={isCurrentWeek}
                  className="text-ink4 hover:text-ink text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-sand3 transition-colors disabled:opacity-30"
                  title="Next week"
                >
                  ›
                </button>
                {!isCurrentWeek && (
                  <button
                    onClick={() => setWeekMon(getMostRecentMonday(new Date()))}
                    className="text-xs text-accent hover:underline"
                  >
                    Current week
                  </button>
                )}
                <WeekCalendar
                  selectedMonday={weekMon}
                  onSelectWeek={setWeekMon}
                  compact
                />
                {isAdmin && (
                  <div className="flex gap-3 text-xs text-ink4 ml-auto">
                    {onTimeCount > 0 && (
                      <span className="text-success font-semibold">
                        {onTimeCount} on time
                      </span>
                    )}
                    {weekendCount > 0 && (
                      <span className="text-warning font-semibold">
                        {weekendCount} weekend
                      </span>
                    )}
                    {lateCount > 0 && (
                      <span className="text-danger font-semibold">
                        {lateCount} late
                      </span>
                    )}
                    {missingCount > 0 && (
                      <span className="text-danger font-semibold">
                        {missingCount} not submitted
                      </span>
                    )}
                    {pendingCount > 0 && (
                      <span className="text-ink4 font-semibold">
                        {pendingCount} pending
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Personal status (non-managers) */}
              {!isAdmin && !myName && (
                <div className="empty mt-3">
                  Your login isn't linked to a team member yet, so there's nothing to show here. Ask an admin to link it in Team &amp; Users → Team Members.
                </div>
              )}
              {!isAdmin &&
                myName &&
                (() => {
                  const mine = weekReports.find(
                    (r) => r.submitted_by === myName,
                  );
                  if (mine) {
                    const st = classifySubmission(mine.created_at, weekMon);
                    const alertClass =
                      st === "on-time"
                        ? "alert-green"
                        : st === "weekend"
                          ? "alert-amber"
                          : "alert-red";
                    const when =
                      new Date(mine.created_at).toLocaleString("en-US", {
                        timeZone: "America/Los_Angeles",
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }) + " PT";
                    return (
                      <div className={`alert ${alertClass}`}>
                        <FiCheck className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          You filed your report for {fmtWeekLabel(weekMon)} -
                          submitted {when}
                          {st !== "on-time"
                            ? ` (${SUBMIT_STATUS_META[st].label.toLowerCase()})`
                            : ""}
                          .
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div
                      className={`alert ${deadlinePassed ? "alert-red" : "alert-amber"} items-center justify-between`}
                    >
                      <span className="flex items-center gap-2">
                        <FiAlertTriangle className="w-4 h-4 shrink-0" />
                        {deadlinePassed
                          ? `You haven’t filed your report for ${fmtWeekLabel(weekMon)} - the Friday deadline has passed.`
                          : `Your report for ${fmtWeekLabel(weekMon)} is pending - due Friday.`}
                      </span>
                      {isCurrentWeek && (
                        <a
                          href="/submit"
                          className="btn-primary text-xs py-1 px-3 whitespace-nowrap"
                        >
                          Submit now
                        </a>
                      )}
                    </div>
                  );
                })()}

              {/* Member status chips (managers only) */}
              {isAdmin && (
                <div className="card">
                  <div className="card-hd">
                    <div className="card-ti">
                      {isCurrentWeek ? "This Week" : fmtWeekLabel(weekMon)}
                    </div>
                    <div className="text-xs text-ink3">
                      {weekReportsLoading
                        ? "Loading…"
                        : `${weekReports.length} of ${reportMembers.length} submitted`}
                    </div>
                  </div>
                  <div className="card-body p-3">
                    <div className="flex flex-wrap gap-2">
                      {reportMembers.map((name) => {
                        const report = weekReports.find(
                          (r) => r.submitted_by === name,
                        );
                        const st = report
                          ? classifySubmission(report.created_at, weekMon)
                          : null;
                        const chipClass =
                          filterMember === name
                            ? "border-ink bg-ink text-white"
                            : st === null
                              ? "border-sand3 text-ink4 bg-sand2 hover:border-ink3"
                              : st === "on-time"
                                ? "border-success/50 text-success bg-success-light hover:opacity-80"
                                : st === "weekend"
                                  ? "border-warning/50 text-warning bg-warning-light hover:opacity-80"
                                  : "border-danger/50 text-danger bg-danger-light hover:opacity-80";
                        const icon =
                          st === "on-time"
                            ? "✓"
                            : st === "weekend"
                              ? "~"
                              : st === "late"
                                ? "!"
                                : null;
                        return (
                          <button
                            key={name}
                            onClick={() =>
                              setFilterMember(filterMember === name ? "" : name)
                            }
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border transition-colors ${chipClass}`}
                            title={
                              report
                                ? SUBMIT_STATUS_META[st!].long
                                : deadlinePassed
                                  ? "Not submitted"
                                  : "Pending - due Friday"
                            }
                          >
                            {icon && <span>{icon}</span>}
                            <span>{name.split(" ")[0]}</span>
                          </button>
                        );
                      })}
                    </div>
                    {notFiled.length > 0 && !weekReportsLoading && (
                      <p
                        className={`text-xs mt-2 ${deadlinePassed ? "text-red-600" : "text-ink4"}`}
                      >
                        {deadlinePassed
                          ? "Not submitted"
                          : "Pending (due Friday)"}
                        : {notFiled.map((n) => n.split(" ")[0]).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Member filter + count (managers only) */}
              {isAdmin && weekReports.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={filterMember}
                    onChange={(e) => setFilterMember(e.target.value)}
                    className="field-input text-xs py-1.5 w-full sm:w-auto"
                  >
                    <option value="">All members</option>
                    {reportMembers.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  {filterMember && (
                    <button
                      onClick={() => setFilterMember("")}
                      className="text-xs text-ink4 hover:text-ink underline"
                    >
                      Clear
                    </button>
                  )}
                  <span className="text-xs text-ink4 ml-auto">
                    {sorted.length} report{sorted.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}

              {/* Report cards */}
              {weekReportsLoading ? (
                <div className="py-4">
                  <Spinner
                    label="Loading reports…"
                    className="text-ink4 text-sm"
                  />
                </div>
              ) : sorted.length === 0 ? (
                isAdmin ? (
                  <div className="card p-6 text-center text-ink4 text-sm">
                    {filterMember
                      ? `${filterMember} has not submitted a report for this week.`
                      : `No reports submitted for the week of ${fmtWeekLabel(weekMon)}.`}
                  </div>
                ) : null
              ) : (
                <div className="space-y-2">
                  {sorted.map((r) => (
                    <WeeklyReportCard
                      key={r.id}
                      r={r}
                      weekMonday={weekMon}
                      isMine={myName === r.submitted_by}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

      {/* ── TEAM HOURS TAB ───────────────────────────────────── */}
      {tab === "hours" &&
        (() => {
          const isCurrentHoursWeek =
            hoursWeekMon.getTime() ===
            getMostRecentMonday(new Date()).getTime();
          return (
            <div className="space-y-4">
              {/* Week navigation */}
              <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
                <button
                  onClick={() => setHoursWeekMon((d) => shiftWeeks(d, -1))}
                  className="text-ink4 hover:text-ink text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-sand3 transition-colors"
                  title="Previous week"
                >
                  ‹
                </button>
                <span className="text-sm font-semibold tabular-nums">
                  {fmtWeekLabel(hoursWeekMon)}
                </span>
                <button
                  onClick={() => setHoursWeekMon((d) => shiftWeeks(d, 1))}
                  disabled={isCurrentHoursWeek}
                  className="text-ink4 hover:text-ink text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-sand3 transition-colors disabled:opacity-30"
                  title="Next week"
                >
                  ›
                </button>
                {!isCurrentHoursWeek && (
                  <button
                    onClick={() =>
                      setHoursWeekMon(getMostRecentMonday(new Date()))
                    }
                    className="text-xs text-accent hover:underline"
                  >
                    Current week
                  </button>
                )}
                <WeekCalendar
                  selectedMonday={hoursWeekMon}
                  onSelectWeek={setHoursWeekMon}
                  compact
                />
              </div>

              {webworkLoading ? (
                <div className="text-ink4 text-sm animate-pulse">
                  Loading WebWork hours…
                </div>
              ) : !webworkData || !webworkData.members ? (
                <div className="card p-6 text-center text-ink4 text-sm">
                  {webworkData?.error ??
                    "Failed to load WebWork data. Check WEBWORK_API_KEY."}
                </div>
              ) : (
                <>
                  {webworkData.incomplete && (
                    <div className="flex items-center gap-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      <span className="flex-1">
                        ⚠ Some hours could not be fetched from WebWork after
                        retrying - numbers below may be undercounted.
                      </span>
                      <button
                        onClick={() => retryWebwork(hoursWeekMon)}
                        className="font-semibold hover:underline flex-shrink-0"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  <div className="text-xs text-ink3">
                    <span className="font-semibold text-ink">
                      {Math.round(
                        webworkData.members.reduce(
                          (s, m) => s + m.totalHours,
                          0,
                        ) * 10,
                      ) / 10}
                      h total
                    </span>
                  </div>

                  {/* Trend cards */}
                  <TrendCards
                    members={webworkData.members}
                    lastWeekLabel={webworkData.lastWeek?.[0] ?? "prior week"}
                  />

                  {/* Bar chart */}
                  <div className="card px-4 pt-4 pb-2">
                    <div className="slbl mb-0 text-xs">Hours This Week</div>
                    <HoursBar members={webworkData.members} />
                  </div>

                  {/* Detail rows */}
                  <div className="card divide-y divide-sand3">
                    {[...webworkData.members]
                      .sort((a, b) => b.totalHours - a.totalHours)
                      .map((m, i) => (
                        <div
                          key={m.username}
                          className="flex items-center gap-3 px-4 py-3"
                        >
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
                            style={{
                              background:
                                i === 0
                                  ? "#4F46E5"
                                  : i === 1
                                    ? "#818CF8"
                                    : "#C7D2FE",
                              color: i < 2 ? "#fff" : "#4F46E5",
                            }}
                          >
                            {m.username[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold capitalize flex-1">
                            {m.username}
                            {m.incomplete && (
                              <span
                                className="text-amber-600 ml-1"
                                title="Some days failed to fetch - may be undercounted"
                              >
                                ⚠
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="w-20 sm:w-28 h-2 bg-sand3 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, (m.totalHours / 40) * 100)}%`,
                                  background:
                                    i === 0
                                      ? "#4F46E5"
                                      : i === 1
                                        ? "#818CF8"
                                        : "#C7D2FE",
                                }}
                              />
                            </div>
                            <span className="font-mono text-sm w-12 text-right tabular-nums">
                              {m.totalHours}h
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}
    </div>
  );
}
