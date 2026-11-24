"use client";

// Admin dashboard (Nov 2026 redesign). Shown to admin/owner logins only;
// everyone else keeps the original dashboard in app/page.tsx. Page order:
// banner → Organisation & team (tiles, weekly reports + company goals, team
// workload + task split, priority tasks) → My work. Every figure is live:
// ClickUp snapshot, weekly_reports (+ Slack for hand-posted reports), WebWork.
import Spinner from "@/components/Spinner";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FiArrowRight, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { ShareSlackButton } from "@/components/ShareButtons";
import StaleBadge from "@/components/StaleBadge";
import OkrProgress, { type OKR } from "@/components/OkrProgress";
import { CLICKUP_PERSONAL_TASK_LISTS, CLICKUP_WORKSPACE_URL } from "@/lib/constants";
import { reportDeadlinePassed } from "@/lib/report-status";
import { fmtWeekRange } from "@/lib/week-utils";
import type { ClickUpData, WebWorkMember } from "@/lib/types";
import ReportsTracker, { trackerRows } from "./ReportsTracker";
import TeamWorkload from "./TeamWorkload";
import TaskSplit from "./TaskSplit";
import UrgentTasks from "./UrgentTasks";
import { onTimePct, statsFor, type DashMember, type DashReport } from "./types";

const QUICK_ACTIONS = [
  { href: "/submit", title: "Submit my weekly report", sub: "Due end of day Friday" },
  { href: "/briefing", title: "Open the Briefing Room", sub: "Monday and Thursday team meeting" },
  { href: "/chatbot", title: "Ask VCoS-AI", sub: "Find anything or build a report from live data" },
  { href: "/team", title: "Team overview", sub: "Reports, hours, people and decisions" },
];

export default function AdminDashboard(props: {
  greeting: string;
  myName: string | null;
  members: DashMember[];
  clickup: ClickUpData | null;
  webwork: { members: WebWorkMember[] } | null;
  reports: DashReport[];
  okrs: OKR[];
  canEditOkrs: boolean;
  onSaveOkr: (id: string, pct: number, note: string) => Promise<boolean>;
  monday: Date;
  isCurrentWeek: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onReportsChanged: () => void;
  loading: boolean;
  reportsLoading: boolean;
  shareMsg: string;
}) {
  const { clickup, members, monday, loading, reportsLoading } = props;
  const weekLabel = fmtWeekRange(monday);

  // Reports posted by hand in #weeklyreports (no VCoS record) still count.
  const [slackFiled, setSlackFiled] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/slack-stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const w = d?.weeklyReports ?? {};
        setSlackFiled(
          w.week1Label === weekLabel ? (w.filedWeek1 ?? []) : w.week2Label === weekLabel ? (w.filedWeek2 ?? []) : [],
        );
      })
      .catch(() => setSlackFiled([]));
  }, [weekLabel]);

  const rows = useMemo(
    () => trackerRows(members, props.reports, slackFiled, monday),
    [members, props.reports, slackFiled, monday],
  );
  const owed = rows.length;
  const filed = rows.filter((r) => r.status === "submitted" || r.status === "late").length;
  const missing = rows.filter((r) => r.status === "missing").length;
  const deadlinePassed = reportDeadlinePassed(monday);

  const total = clickup?.totalTasks ?? 0;
  const overdue = clickup?.overdue ?? 0;
  const urgent = clickup?.urgent ?? 0;
  const overduePct = clickup?.overduePercent ?? 0;
  const hours = Math.round((props.webwork?.members ?? []).reduce((s, m) => s + m.totalHours, 0));
  const dash = (v: string | number) => (loading && !clickup ? "-" : v);

  const tiles = [
    {
      href: "#reports",
      label: "Weekly reports",
      value: reportsLoading && !rows.length ? "-" : `${filed} of ${owed}`,
      pill:
        filed === owed && owed > 0
          ? { t: "All in", c: "green" }
          : deadlinePassed
            ? { t: `${missing} missing`, c: "red" }
            : filed === 0
              ? { t: "Not started", c: "amber" }
              : { t: "In progress", c: "amber" },
      hint: filed === owed && owed > 0 ? "Everyone has filed" : "Filed so far · see who is missing below",
    },
    {
      href: "#priority",
      label: "Urgent tasks",
      value: dash(urgent),
      pill: urgent > 0 ? { t: "Act today", c: "red" } : { t: "All clear", c: "green" },
      hint: urgent > 0 ? "Open urgent tasks across the team" : "Nothing urgent right now",
    },
    {
      href: "#workload",
      label: "Overdue tasks",
      value: dash(overdue),
      pill:
        overduePct > 50 ? { t: "Too many", c: "red" } : overduePct > 20 ? { t: "Watch", c: "amber" } : { t: "OK", c: "green" },
      hint: `${overduePct}% of ${total} open tasks`,
    },
    {
      href: "/team?tab=hours",
      label: "Team hours",
      value: props.webwork ? `${hours}h` : "-",
      pill: { t: props.isCurrentWeek ? "This week" : "Current week", c: "gray" },
      hint: "Logged in WebWork",
    },
  ];

  // My work
  const me = members.find((m) => m.name === props.myName) ?? null;
  const myRow = rows.find((r) => r.member.name === props.myName) ?? null;
  const myStats = me ? statsFor(clickup, me.cuKey) : null;
  const myPct = onTimePct(myStats);
  const myList = CLICKUP_PERSONAL_TASK_LISTS.find((l) => l.owner === props.myName);
  const friday = new Date(monday.getTime() + 4 * 864e5).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const myPill = !myRow
    ? null
    : myRow.status === "submitted"
      ? { t: "Submitted", c: "green" }
      : myRow.status === "late"
        ? { t: "Submitted late", c: "amber" }
        : myRow.status === "missing"
          ? { t: "Not submitted", c: "red" }
          : { t: "Not submitted yet", c: "gray" };
  const firstName = (props.myName ?? "").split(" ")[0];

  return (
    <div className="ad">
      <section className="ad-band">
        <div className="min-w-0 flex-[1_1_420px]">
          <div className="eyebrow">Command centre · Week of {weekLabel}</div>
          <h1>
            {props.greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p>
            {loading && !clickup ? (
              <Spinner label="Loading this week's numbers" />
            ) : (
              <>
                Three things stand out:{" "}
                <b>
                  {filed} of {owed} weekly reports
                </b>{" "}
                are in ({deadlinePassed ? `${owed - filed} still missing` : "due Friday"}),{" "}
                <b>
                  {urgent} urgent task{urgent === 1 ? "" : "s"}
                </b>{" "}
                need action, and{" "}
                <b>
                  {overdue} task{overdue === 1 ? " is" : "s are"} overdue
                </b>
                .
              </>
            )}
          </p>
          <div className="mt-2">
            <StaleBadge
              ageMinutes={(clickup as { _ageMinutes?: number } | null)?._ageMinutes}
              circuitOpen={(clickup as { _circuitOpen?: boolean } | null)?._circuitOpen}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {!loading && <ShareSlackButton label="Post brief to Slack" message={props.shareMsg} />}
          <button type="button" className="ad-band-btn" aria-label="Previous week" onClick={props.onPrevWeek}>
            <FiChevronLeft aria-hidden="true" />
          </button>
          {!props.isCurrentWeek && (
            <button type="button" className="ad-band-btn" onClick={props.onThisWeek}>
              This week
            </button>
          )}
          <button
            type="button"
            className="ad-band-btn"
            aria-label="Next week"
            disabled={props.isCurrentWeek}
            onClick={props.onNextWeek}
          >
            <FiChevronRight aria-hidden="true" />
          </button>
        </div>
      </section>

      <div className="ad-divider">
        <h2>Organisation &amp; team</h2>
      </div>

      <section aria-label="Week at a glance" className="ad-tiles">
        {tiles.map((k) => (
          <Link key={k.label} href={k.href} className="ad-tile">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <span className="label">{k.label}</span>
              <span className={`ad-pill ${k.pill.c}`}>{k.pill.t}</span>
            </div>
            <div className="value">{k.value}</div>
            <div className="hint">{k.hint}</div>
          </Link>
        ))}
      </section>

      <div className="flex flex-wrap gap-6 items-start">
        <ReportsTracker
          rows={rows}
          monday={monday}
          clickup={clickup}
          loading={reportsLoading}
          onChanged={props.onReportsChanged}
        />
        <section className="ad-card flex-[1_1_320px] px-5 sm:px-6 py-5">
          <h2 className="m-0 mb-1 text-lg font-extrabold">Company goals</h2>
          <p className="m-0 mb-3 text-[13px] text-[#475467]">
            {props.okrs.filter((o) => o.pct < 70).length} of {props.okrs.length} are behind or need watching
          </p>
          <OkrProgress okrs={props.okrs} canEdit={props.canEditOkrs} onSave={props.onSaveOkr} />
        </section>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <TeamWorkload members={members} clickup={clickup} loading={loading} />
        <TaskSplit clickup={clickup} loading={loading} />
      </div>

      <UrgentTasks tasks={clickup?.urgentDetails ?? []} loading={loading} />

      <div className="ad-divider mt-2">
        <h2>My work</h2>
      </div>

      <div className="flex flex-wrap gap-6 items-stretch">
        <section className="ad-card flex-[1_1_280px] px-5 sm:px-6 py-5 flex flex-col gap-2.5">
          <h2 className="m-0 text-lg font-extrabold">My weekly report</h2>
          {myPill ? (
            <>
              <div>
                <span className={`ad-pill ${myPill.c}`}>{myPill.t}</span>
              </div>
              <p className="m-0 text-[13px] text-[#475467]">Due end of day {friday}.</p>
            </>
          ) : (
            <p className="m-0 text-[13px] text-[#475467]">You don&rsquo;t owe a weekly report.</p>
          )}
          <Link href="/submit" className="ad-btn primary mt-auto">
            Submit my weekly report
          </Link>
        </section>

        <section className="ad-card flex-[1_1_280px] px-5 sm:px-6 py-5 flex flex-col gap-2.5">
          <h2 className="m-0 text-lg font-extrabold">My tasks</h2>
          <div className="text-[38px] font-extrabold leading-tight tabular-nums">
            {loading && !clickup ? "-" : (myStats?.total ?? 0)}
          </div>
          <p className="m-0 text-[13px] text-[#475467]">
            {myStats && myStats.total > 0
              ? `Open task${myStats.total === 1 ? "" : "s"} · ${myPct}% on time · ${myStats.overdue ? `${myStats.overdue} overdue` : "none overdue"}`
              : "No open tasks"}
          </p>
          <a
            href={myList ? `${CLICKUP_WORKSPACE_URL}/v/li/${myList.id}` : `${CLICKUP_WORKSPACE_URL}/home`}
            target="_blank"
            rel="noopener noreferrer"
            className="ad-btn text-sm mt-auto"
          >
            Open my tasks in ClickUp
          </a>
        </section>

        <section className="ad-card flex-[2_1_340px] px-5 sm:px-6 py-5">
          <h2 className="m-0 mb-3 text-lg font-extrabold">Quick actions</h2>
          <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
            {QUICK_ACTIONS.map((a) => (
              <Link key={a.href} href={a.href} className="ad-action">
                <span>
                  <span className="block font-bold text-sm">{a.title}</span>
                  <span className="block text-xs text-[#475467] mt-0.5">{a.sub}</span>
                </span>
                <FiArrowRight aria-hidden="true" className="text-[#3730A3] flex-none" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
