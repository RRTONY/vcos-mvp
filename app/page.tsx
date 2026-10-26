"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRefresh } from "@/components/RefreshContext";
import { ShareSlackButton } from "@/components/ShareButtons";
import type { Task, ClickUpData, WebWorkMember } from "@/lib/types";
import StaleBadge from "@/components/StaleBadge";
import { useMe } from "@/hooks/useMe";
import {
  CLICKUP_WORKSPACE_URL,
  SLACK_WORKSPACE_URL,
  SLACK_CHANNEL_WEEKLY_REPORTS,
  OVERDUE_ALERT_THRESHOLD,
} from "@/lib/constants";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import PriorityTasks from "@/components/PriorityTasks";
import OkrProgress, { type OKR } from "@/components/OkrProgress";
import {
  reportState,
  type ReportState,
} from "@/lib/report-status";
import { isReportFrom } from "@/lib/report-match";
import TaskBuckets from "@/components/TaskBuckets";
import Avatar from "@/components/Avatar";
import Sparkline from "@/components/Sparkline";

interface TeamMember {
  name: string;
  cuKey: string;
  role: string;
  filesReport: boolean;
}
interface WeeklyReportEntry {
  id: string;
  submitted_by: string;
  created_at: string;
}

import {
  getMondayOfWeekPT,
  shiftWeeks,
  fmtWeekRange,
  weekStartISO,
} from "@/lib/week-utils";
const getMostRecentMonday = getMondayOfWeekPT;
const fmtWeekLabel = fmtWeekRange;
import dynamic from "next/dynamic";
import Skeleton, { SkeletonRows } from "@/components/Skeleton";
const CrmDonut = dynamic(() => import("@/components/charts/CrmDonut"), {
  ssr: false,
});
const MemberSparkline = dynamic(
  () => import("@/components/charts/MemberSparkline"),
  { ssr: false },
);

function findStats(
  assigneeStats:
    | Record<string, { total: number; overdue: number; urgent: number }>
    | undefined,
  cuKey: string,
) {
  if (!assigneeStats) return null;
  const key = Object.keys(assigneeStats).find((k) => k.includes(cuKey));
  return key ? assigneeStats[key] : null;
}

function findAvatar(
  avatars:
    | Record<
        string,
        { image: string | null; initials: string | null; color: string | null }
      >
    | undefined,
  cuKey: string,
) {
  if (!avatars) return null;
  const key = Object.keys(avatars).find((k) => k.includes(cuKey));
  return key ? avatars[key] : null;
}

function findTasks(
  tasksByAssignee: Record<string, Task[]> | undefined,
  cuKey: string,
): Task[] {
  if (!tasksByAssignee) return [];
  const key = Object.keys(tasksByAssignee).find((k) => k.includes(cuKey));
  return key ? tasksByAssignee[key] : [];
}

function MemberCard({
  member,
  stats,
  tasks,
  filed,
  loading,
  sparkline,
  reportStatus,
  avatar,
}: {
  member: TeamMember;
  stats: { total: number; overdue: number; urgent: number } | null;
  tasks: Task[];
  filed: boolean;
  loading: boolean;
  sparkline?: { date: string; hours: number }[];
  reportStatus?: ReportState;
  avatar?: {
    image: string | null;
    initials: string | null;
    color: string | null;
  } | null;
}) {
  const [open, setOpen] = useState(false);
  const flow =
    stats && stats.total > 0
      ? Math.max(5, Math.round(100 - (stats.overdue / stats.total) * 100))
      : null;
  // Only a 'missing' report (Friday passed, still not filed) counts as an issue;
  // 'pending' (before Friday) is neutral.
  const reportMissing = reportStatus === "missing";
  const hasIssues =
    (stats?.overdue ?? 0) > 0 || (stats?.urgent ?? 0) > 0 || reportMissing;

  const flowColor =
    flow === null
      ? ""
      : flow >= 80
        ? "bg-success"
        : flow >= 50
          ? "bg-warning"
          : "bg-danger";

  return (
    <div className={`card mb-2 ${hasIssues ? "border-danger/30" : ""}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 sm:px-5 py-3 sm:py-4 text-left hover:bg-sand2 transition-colors rounded-lg"
      >
        {/* Avatar - ClickUp profile photo, else two-letter initials */}
        <Avatar
          name={member.name}
          image={avatar?.image}
          initials={avatar?.initials}
          color={avatar?.color}
          className="w-9 h-9 sm:w-10 sm:h-10 text-sm sm:text-base"
        />

        {/* Middle - name, role, progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm sm:text-base font-semibold">
              {member.name}
            </span>
            <span className="hidden sm:inline text-sm text-ink4">
              {member.role}
            </span>
          </div>
          {loading ? (
            <div className="h-2 w-20 bg-sand3 rounded mt-1.5 animate-pulse" />
          ) : stats && flow !== null ? (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <div className="progress-track w-20 sm:w-24">
                <div
                  className={`progress-fill ${flowColor}`}
                  style={{ width: `${flow}%` }}
                />
              </div>
              <span className="text-xs sm:text-sm text-ink3">{flow}%</span>
              {/* Badges inline on mobile, shown here */}
              {stats.overdue > 0 && (
                <span className="badge-red">{stats.overdue} overdue</span>
              )}
              {stats.urgent > 0 && (
                <span className="badge-amber">{stats.urgent} urgent</span>
              )}
            </div>
          ) : (
            <span className="text-xs text-ink4 mt-1 block">No tasks</span>
          )}
        </div>

        {/* Right - sparkline + filed badge + count + chevron */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {sparkline && sparkline.length > 0 && (
            <span className="hidden sm:block">
              <MemberSparkline
                byDay={sparkline}
                color={flow !== null && flow < 50 ? "#B8322B" : "#2747C9"}
              />
            </span>
          )}
          {member.filesReport &&
            (reportStatus === "on-time" ? (
              <span className="badge-green">Filed ✓</span>
            ) : reportStatus === "weekend" ? (
              <span className="badge-amber">Filed (wknd)</span>
            ) : reportStatus === "late" ? (
              <span className="badge-amber">Filed (late)</span>
            ) : reportStatus === "pending" ? (
              <span className="badge">Pending</span>
            ) : reportStatus === "missing" ? (
              <span className="badge-red">Not Submitted</span>
            ) : (
              <span className={filed ? "badge-green" : "badge"}>
                {filed ? "Filed" : "Pending"}
              </span>
            ))}
          {stats && (
            <span className="hidden sm:inline text-sm text-ink4">
              {stats.total} tasks
            </span>
          )}
          <span className="text-ink4 text-xs ml-0.5">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-sand3 px-5 py-1">
          <TaskBuckets tasks={tasks} />
          {tasks.length > 0 && (
            <a
              href={`${CLICKUP_WORKSPACE_URL}/home`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-accent hover:underline py-3"
            >
              Open all in ClickUp ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [clickup, setClickUp] = useState<ClickUpData | null>(null);
  const [webwork, setWebwork] = useState<{ members: WebWorkMember[] } | null>(
    null,
  );
  const [screenshots, setScreenshots] = useState<Record<
    string,
    { url: string; filename: string; capturedAt: string | null }[]
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamMember[]>([]);
  // "Good morning" etc. in Pacific time; set after mount to avoid a hydration mismatch.
  const [greeting, setGreeting] = useState("Welcome");
  useEffect(() => {
    const h = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "numeric",
        hourCycle: "h23",
      }).format(new Date()),
    );
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);
  const [daily, setDaily] = useState<
    { overdue_count: number; urgent_count: number; reports_filed: string[] }[]
  >([]);
  const [okrs, setOkrs] = useState<OKR[]>([]);
  const { refreshKey, freshClickUp, liveClickUp } = useRefresh();
  const prevKey = useRef(refreshKey);
  const { isOwner, isAdmin, me } = useMe();
  const [selectedMonday, setSelectedMonday] = useState<Date>(() =>
    getMostRecentMonday(new Date()),
  );
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReportEntry[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Daily history → KPI trend sparklines (admin only; team-wide series).
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/reports/daily", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setDaily(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [isAdmin]);
  const trendSeries = [...daily].reverse(); // oldest → newest
  const filedTrend = trendSeries.map((d) => d.reports_filed?.length ?? 0);
  const overdueTrend = trendSeries.map((d) => d.overdue_count ?? 0);
  const urgentTrend = trendSeries.map((d) => d.urgent_count ?? 0);

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
          setTeam(
            (data ?? [])
              .filter((m) => m.active)
              .map((m) => ({
                name: m.full_name,
                cuKey: m.clickup_key ?? m.full_name.split(" ")[0].toLowerCase(),
                role: m.role_description ?? "",
                filesReport: m.files_report,
              })),
          );
        },
      )
      .catch(() => {});
    fetch("/api/okrs", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: OKR[]) => {
        if (Array.isArray(data)) setOkrs(data);
      })
      .catch(() => {});
  }, []);

  async function saveOkr(id: string, pct: number, note: string) {
    const res = await fetch("/api/okrs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, pct, note }),
    });
    if (!res.ok) return false;
    const updated = await res.json();
    setOkrs((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    return true;
  }


  const load = useCallback(
    async (
      cancelled: { v: boolean },
      cachedClickUp?: Record<string, unknown> | null,
    ) => {
      setLoading(true);
      const [c, w, sc] = await Promise.all([
        cachedClickUp
          ? Promise.resolve(cachedClickUp)
          : fetch("/api/clickup-tasks", { cache: "no-store" })
              .then((r) => r.json())
              .catch(() => null),
        fetch("/api/webwork", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/screenshots", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      if (!cancelled.v) {
        setClickUp(c);
        setWebwork(w);
        setScreenshots(sc?.screenshots ?? null);
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const cancelled = { v: false };
    load(cancelled);
    return () => {
      cancelled.v = true;
    };
  }, [load]);

  // ClickUp changed (webhook) - swap in the new data quietly, no reload.
  useEffect(() => {
    if (liveClickUp) setClickUp(liveClickUp as unknown as ClickUpData);
  }, [liveClickUp]);

  useEffect(() => {
    if (refreshKey === prevKey.current) return;
    prevKey.current = refreshKey;
    const cancelled = { v: false };
    load(cancelled, freshClickUp);
    return () => {
      cancelled.v = true;
    };
  }, [refreshKey, freshClickUp, load]);

  useEffect(() => {
    setReportsLoading(true);
    const weekStart = weekStartISO(selectedMonday);
    fetch(`/api/weekly-reports?week_start=${weekStart}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: WeeklyReportEntry[]) => {
        setWeeklyReports(Array.isArray(data) ? data : []);
        setReportsLoading(false);
      })
      .catch(() => setReportsLoading(false));
  }, [selectedMonday]);

  const currentMonday = getMostRecentMonday(new Date());
  const isCurrentWeek = selectedMonday.getTime() === currentMonday.getTime();
  const selectedWeekLabel = fmtWeekLabel(selectedMonday);

  function getMemberReportEntry(memberName: string): WeeklyReportEntry | null {
    // Shared matcher (exact, then first-name fuzzy) - keeps the dashboard and the
    // compliance scorecard in agreement about who filed.
    return (
      weeklyReports.find((r) => isReportFrom(r.submitted_by, memberName)) ??
      null
    );
  }

  // A report is DUE end of Friday. Before Friday a non-filed report is 'pending'
  // (not flagged); only after Friday does it become 'missing' / Not Submitted.
  function getMemberReportStatus(memberName: string): ReportState {
    const report = getMemberReportEntry(memberName);
    return reportState(selectedMonday, report?.created_at ?? null, new Date());
  }

  const reportingMembers = team.filter((m) => m.filesReport);
  // Authoritative source = actual submissions in the weekly_reports table.
  const FILED_STATES: ReportState[] = ["on-time", "weekend", "late"];
  const filedMembers = reportingMembers.filter((m) =>
    FILED_STATES.includes(getMemberReportStatus(m.name)),
  );
  const pendingMembers = reportingMembers.filter(
    (m) => getMemberReportStatus(m.name) === "pending",
  );
  const missingMembers = reportingMembers.filter(
    (m) => getMemberReportStatus(m.name) === "missing",
  );
  const displayFiled = filedMembers.length;
  const displayMissing = missingMembers.length;
  const displayPending = pendingMembers.length;
  const displayTotal = reportingMembers.length;

  // Non-admins see only their OWN ClickUp task numbers; admins see the whole team.
  const myCuKey = me?.fullName
    ? (team.find((m) => m.name === me.fullName)?.cuKey ?? null)
    : null;
  const scopedClickUp: ClickUpData | null = (() => {
    if (isAdmin || !clickup) return clickup;
    const stats = clickup.assigneeStats
      ? Object.entries(clickup.assigneeStats).find(
          ([k]) => myCuKey && k.includes(myCuKey),
        )?.[1]
      : null;
    const total = stats?.total ?? 0;
    const overdue = stats?.overdue ?? 0;
    const urgent = stats?.urgent ?? 0;
    return {
      ...clickup,
      totalTasks: total,
      overdue,
      urgent,
      overduePercent: total > 0 ? Math.round((overdue / total) * 100) : 0,
      completed: 0,
    };
  })();

  // Items needing CEO attention
  const actions: { level: "red" | "amber" | "blue"; text: React.ReactNode }[] =
    [];
  if (!loading) {
    if (isCurrentWeek && !reportsLoading && missingMembers.length > 0)
      actions.push({
        level: "red",
        text: (
          <span className="flex items-center justify-between gap-2 w-full">
            <span>
              <strong>Not submitted:</strong>{" "}
              {missingMembers.map((m) => m.name).join(", ")} missed the Friday
              deadline.
            </span>
            <a
              href={`${SLACK_WORKSPACE_URL}/${SLACK_CHANNEL_WEEKLY_REPORTS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline whitespace-nowrap text-xs"
            >
              Slack channel ↗
            </a>
          </span>
        ),
      });
    if ((scopedClickUp?.urgent ?? 0) > 0)
      actions.push({
        level: "red",
        text: (
          <span className="flex items-center justify-between gap-2 w-full">
            <span>
              <strong>{scopedClickUp?.urgent} urgent tasks</strong>{" "}
              {isAdmin ? "across the team" : "assigned to you"} need immediate
              resolution.
            </span>
            <a
              href={`${CLICKUP_WORKSPACE_URL}/home`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline whitespace-nowrap text-xs"
            >
              ClickUp ↗
            </a>
          </span>
        ),
      });
    if ((scopedClickUp?.overduePercent ?? 0) > OVERDUE_ALERT_THRESHOLD)
      actions.push({
        level: "red",
        text: (
          <span className="flex items-center justify-between gap-2 w-full">
            <span>
              <strong>
                {isAdmin ? "CRM" : "Your"} overdue at{" "}
                {scopedClickUp?.overduePercent}%
              </strong>{" "}
              - {scopedClickUp?.overdue} of {scopedClickUp?.totalTasks} tasks
              past due. Needs triage.
            </span>
            <a
              href={`${CLICKUP_WORKSPACE_URL}/home`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline whitespace-nowrap text-xs"
            >
              ClickUp ↗
            </a>
          </span>
        ),
      });
  }

  const weeklyReportTemplate = [
    `#myweeklyreport`,
    ``,
    `1. What is blocked, stuck, or at risk right now?`,
    `   Format: Blocker → Impact if unresolved → What's needed → From whom`,
    ``,
    `2. Is anything broken, behind, or needs to be escalated?`,
    `   Format: Issue → Current status → Recommended action`,
    ``,
    `3. Top 3–5 priorities for next week (in order)`,
    `   Format: Priority → Definition of done → Owner if team`,
    ``,
    `4. Which of last week's priorities did you complete - and what didn't get done, and why?`,
    `   Format: Priority → Done / Not done → Reason if not done`,
    ``,
    `5. Most important accomplishment this week & business impact`,
    ``,
    `6. Full list of accomplishments by area`,
    `   Sales: / Client delivery: / Internal operations: / Other:`,
    ``,
    `7. What didn't go well - and what should change because of it?`,
    ``,
    `8. What went well that's worth repeating or recognizing?`,
    ``,
    `9. What you need from others to support you`,
    ``,
    `10. (Optional) Personal notes`,
  ].join("\n");

  const shareMsg = [
    `📊 *CEO Status Brief - Week of ${selectedWeekLabel}*`,
    `Reports: ${displayFiled}/${displayTotal} filed${displayMissing > 0 ? ` · Missing: ${missingMembers.map((m) => m.name.split(" ")[0]).join(", ")}` : " ✅"}`,
    clickup
      ? `CRM: ${clickup.overduePercent}% overdue (${clickup.overdue}/${clickup.totalTasks}) · ${clickup.urgent} urgent`
      : "",
    `_From Visual Chief of Staff_`,
    missingMembers.length
      ? [
          ``,
          `📋 *${missingMembers.map((m) => m.name.split(" ")[0]).join(", ")}* - please post your weekly report using the template below. Include *#myweeklyreport* at the top.`,
          `\`\`\``,
          weeklyReportTemplate,
          `\`\`\``,
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const firstName = (me?.fullName ?? me?.username ?? "").split(" ")[0];
  const myWw = myCuKey
    ? webwork?.members?.find((m) => {
        const u = m.username.toLowerCase();
        const k = myCuKey.toLowerCase();
        return u.includes(k) || k.includes(u);
      })
    : undefined;
  const hoursThisWeek = isAdmin
    ? Math.round(
        (webwork?.members ?? []).reduce((sum, m) => sum + m.totalHours, 0),
      )
    : Math.round(myWw?.totalHours ?? 0);
  const urgentCount = scopedClickUp?.urgent ?? 0;
  const overduePct = scopedClickUp?.overduePercent ?? 0;
  const busy = loading || reportsLoading;

  const kpis: {
    cls: string;
    value: string | number;
    label: string;
    sub: string;
    href: string;
  }[] = [
    {
      cls: displayMissing > 0 ? "red" : "green",
      value: busy ? "-" : `${displayFiled}/${displayTotal}`,
      label: "Weekly reports filed",
      sub: busy
        ? ""
        : displayMissing > 0
          ? `${displayMissing} not submitted`
          : displayPending > 0
            ? `${displayPending} due Friday`
            : "All in",
      href: "/team?tab=filing",
    },
    {
      cls: urgentCount > 0 ? "red" : "green",
      value: loading ? "-" : urgentCount,
      label: isAdmin ? "Urgent tasks" : "My urgent tasks",
      sub: urgentCount > 0 ? "Need action today" : "Nothing urgent",
      href: isAdmin ? "#priority" : "#tasks",
    },
    {
      cls: overduePct > 50 ? "red" : overduePct > 20 ? "amber" : "green",
      value: loading ? "-" : `${overduePct}%`,
      label: isAdmin ? "Tasks overdue" : "My tasks overdue",
      sub: loading
        ? ""
        : `${scopedClickUp?.overdue ?? 0} of ${scopedClickUp?.totalTasks ?? 0} tasks`,
      href: "#tasks",
    },
    {
      cls: "blue",
      value: loading ? "-" : `${hoursThisWeek}h`,
      label: isAdmin ? "Team hours this week" : "My hours this week",
      sub: "From WebWork",
      href: "/team?tab=hours",
    },
  ];

  const quickLinks = [
    { href: "/submit", t: "Submit my weekly report", s: "Due end of day Friday" },
    { href: "/briefing", t: "Open the Briefing Room", s: "Monday and Thursday team meeting" },
    { href: "/chatbot", t: "Ask VCoS-AI", s: "Find anything or build a report from live data" },
    { href: "/team", t: "Team overview", s: "Reports, hours, people and decisions" },
  ];

  return (
    <div>
      {/* Greeting */}
      <section className="hero-band">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow">
              {isAdmin ? "Command centre" : "My week"} · Week of{" "}
              {selectedWeekLabel}
            </div>
            <h1 className="mt-2">
              {greeting}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <div className="hero-meta mt-3">
              <span>
                Reports filed{" "}
                <b>{busy ? "-" : `${displayFiled} of ${displayTotal}`}</b>
              </span>
              <span>
                Urgent tasks <b>{loading ? "-" : urgentCount}</b>
              </span>
              <StaleBadge
                ageMinutes={(clickup as { _ageMinutes?: number })?._ageMinutes}
                circuitOpen={
                  (clickup as { _circuitOpen?: boolean })?._circuitOpen
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedMonday((d) => shiftWeeks(d, -1))}
              className="hero-btn"
              aria-label="Previous week"
            >
              <FiChevronLeft />
            </button>
            {!isCurrentWeek && (
              <button
                onClick={() =>
                  setSelectedMonday(getMostRecentMonday(new Date()))
                }
                className="hero-btn"
              >
                This week
              </button>
            )}
            <button
              onClick={() => setSelectedMonday((d) => shiftWeeks(d, 1))}
              disabled={isCurrentWeek}
              className="hero-btn"
              aria-label="Next week"
            >
              <FiChevronRight />
            </button>
            {isAdmin && !loading && (
              <ShareSlackButton label="Post brief to Slack" message={shareMsg} />
            )}
          </div>
        </div>
      </section>

      {/* The four numbers that matter - each opens the detail */}
      <div className="kpi-grid">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className={`kpi ${k.cls}`}>
            <span className={`kpi-value ${busy ? "animate-pulse" : ""}`}>
              {k.value}
            </span>
            <span className="kpi-label">{k.label}</span>
            {k.sub && <span className="kpi-sub">{k.sub}</span>}
          </Link>
        ))}
      </div>

      {/* Needs attention + quick actions */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start mb-8">
        <section className="panel">
          <h2 className="panel-title">
            Needs attention
            {!loading && (
              <span className={`count-pill ${actions.length ? "red" : "green"}`}>
                {actions.length}
              </span>
            )}
          </h2>
          {loading ? (
            <SkeletonRows rows={2} />
          ) : actions.length === 0 ? (
            <p className="text-sm text-success-dark font-semibold">
              All clear - nothing needs attention right now.
            </p>
          ) : (
            actions.map((a, i) => (
              <div key={i} className={`alert alert-${a.level} mb-0`}>
                {a.text}
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <h2 className="panel-title">Quick actions</h2>
          {quickLinks.map((q) => (
            <Link key={q.href} href={q.href} className="row-btn">
              <span className="t">{q.t}</span>
              <span className="text-accent font-bold">→</span>
              <span className="s">{q.s}</span>
            </Link>
          ))}
        </section>
      </div>

      {/* Priority tasks (admins) */}
      {isAdmin && !loading && (
        <div id="priority">
          <PriorityTasks
            urgent={clickup?.urgentDetails ?? []}
            high={clickup?.highDetails ?? []}
          />
        </div>
      )}

      {/* Tasks */}
      <div id="tasks" className="sechead">
        <h2>{isAdmin ? "Team tasks" : "My tasks"}</h2>
        <span className="count">
          {isAdmin ? "Click a person to see their ClickUp tasks" : "From ClickUp"}
        </span>
      </div>
      {!isAdmin && me && !myCuKey && (
        <div className="empty mb-8">
          Your login isn't linked to a team member yet, so there's nothing to show here. Ask an admin to link it in Team &amp; Users → Team Members.
        </div>
      )}
        <div className="space-y-2 mb-8">
          {(isAdmin
            ? team
            : team.filter((m) => me?.fullName && m.name === me.fullName)
          ).map((member) => {
            const wwMember = webwork?.members?.find((m) => {
              const u = m.username.toLowerCase();
              const k = member.cuKey.toLowerCase();
              return u.includes(k) || k.includes(u);
            });
            return (
              <MemberCard
                key={member.name}
                member={member}
                stats={findStats(clickup?.assigneeStats, member.cuKey)}
                tasks={findTasks(clickup?.tasksByAssignee, member.cuKey)}
                filed={getMemberReportEntry(member.name) !== null}
                loading={loading}
                sparkline={wwMember?.byDay}
                reportStatus={
                  member.filesReport
                    ? getMemberReportStatus(member.name)
                    : undefined
                }
                avatar={findAvatar(clickup?.assigneeAvatars, member.cuKey)}
              />
            );
          })}
        </div>

      {/* Task breakdown + OKRs */}
      <div className="grid gap-5 lg:grid-cols-2 items-start mb-8">
        <section className="panel">
          <h2 className="panel-title">
            {isAdmin ? "Task breakdown" : "My task breakdown"}
          </h2>
          {loading ? (
            <Skeleton className="h-28 w-full rounded-xl" />
          ) : scopedClickUp && scopedClickUp.totalTasks ? (
            <CrmDonut
              total={scopedClickUp.totalTasks}
              overdue={scopedClickUp.overdue ?? 0}
              urgent={scopedClickUp.urgent ?? 0}
              completed={scopedClickUp.completed ?? 0}
            />
          ) : (
            <p className="text-sm text-ink3">No task data</p>
          )}
          {isAdmin && (filedTrend.length > 1 || overdueTrend.length > 1) && (
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-sand4">
              {[
                { l: "Reports filed", v: filedTrend, c: "#1C7C54" },
                { l: "Urgent", v: urgentTrend, c: "#B8322B" },
                { l: "Overdue", v: overdueTrend, c: "#B7791F" },
              ].map((t) => (
                <div key={t.l}>
                  <div className="text-xs font-semibold text-ink3 mb-1">
                    {t.l} trend
                  </div>
                  <Sparkline values={t.v} color={t.c} height={22} />
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <h2 className="panel-title">OKR progress</h2>
          <OkrProgress okrs={okrs} canEdit={isOwner} onSave={saveOkr} />
        </section>
      </div>

      {/* Screenshots */}
      {screenshots &&
        Object.values(screenshots).some((arr) => arr.length > 0) && (
        <div className="mb-6">
          <div className="slbl">Team Screenshots - Today</div>
          <div className="card divide-y divide-sand3">
            {team
              .filter((m) => screenshots[m.cuKey]?.length > 0)
              .map((member) => {
                const shots = screenshots[member.cuKey] ?? [];
                return (
                  <div key={member.cuKey} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold">
                        {member.name}
                      </span>
                      <span className="text-xs text-ink4">
                        {shots.length} screenshot
                        {shots.length !== 1 ? "s" : ""}
                      </span>
                      {shots[0]?.capturedAt &&
                        shots[shots.length - 1]?.capturedAt && (
                          <span className="text-xs text-ink4 hidden sm:inline">
                            · {shots[0].capturedAt} –{" "}
                            {shots[shots.length - 1].capturedAt}
                          </span>
                        )}
                    </div>
                    {/* Thumbnail strip - scrollable on mobile */}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {shots.map((shot, i) => (
                        <a
                          key={i}
                          href={shot.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 group relative"
                          title={shot.capturedAt ?? shot.filename}
                        >
                          <img
                            src={shot.url}
                            alt={shot.capturedAt ?? `Screenshot ${i + 1}`}
                            className="w-20 h-14 sm:w-24 sm:h-16 object-cover rounded border border-sand3 group-hover:border-accent transition-colors"
                            loading="lazy"
                          />
                          {shot.capturedAt && (
                            <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] bg-black/50 text-white rounded-b px-1 py-0.5">
                              {shot.capturedAt}
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
        )}
    </div>
  );
}
