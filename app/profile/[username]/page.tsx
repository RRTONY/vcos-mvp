"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMe } from "@/hooks/useMe";
import Avatar from "@/components/Avatar";
import Spinner from "@/components/Spinner";
import FormattedNotes from "@/components/FormattedNotes";
import {
  classifySubmission,
  SUBMIT_STATUS_META,
  type SubmitStatus,
} from "@/lib/report-status";
import { bucketFor } from "@/lib/due-buckets";
import { isReportFrom } from "@/lib/report-match";
import type { ClickUpData, WebWorkMember, Task } from "@/lib/types";

interface TeamRow {
  full_name: string;
  vcos_username: string | null;
  clickup_key: string | null;
  role_description: string | null;
  hourly_rate: number;
  files_report: boolean;
  active: boolean;
}
interface ReportRow {
  submitted_by: string;
  created_at: string;
  win?: string | null;
  accomplishments?: string | null;
  priorities?: string | null;
  blockers?: string | null;
}

const WEEKS = 8;
import { getMondayOfWeekPT, shiftWeeks, weekStartISO } from "@/lib/week-utils";
const mostRecentMonday = getMondayOfWeekPT;
function fmtWeek(mon: Date): string {
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
    });
  return `${f(mon)}–${f(fri)}`;
}
function lookup<T>(
  map: Record<string, T> | undefined,
  cuKey: string,
): T | null {
  if (!map || !cuKey) return null;
  const k = Object.keys(map).find((x) => x.includes(cuKey));
  return k ? map[k] : null;
}

export default function ProfilePage() {
  const params = useParams();
  const username = (
    Array.isArray(params.username)
      ? params.username[0]
      : (params.username ?? "")
  ).toLowerCase();
  const { isAdmin, me } = useMe();

  const [member, setMember] = useState<TeamRow | null | undefined>(undefined);
  const [clickup, setClickUp] = useState<ClickUpData | null>(null);
  const [webwork, setWebwork] = useState<WebWorkMember[]>([]);
  const [weeks, setWeeks] = useState<
    { mon: Date; status: SubmitStatus | null; report: ReportRow | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Access: admins see anyone; a normal user only their own profile.
  const allowed = isAdmin || me?.username?.toLowerCase() === username;

  useEffect(() => {
    if (!username || me === null) return;
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const cur = mostRecentMonday(new Date());
    const mondays = Array.from({ length: WEEKS }, (_, i) =>
      shiftWeeks(cur, -(WEEKS - 1 - i)),
    );
    Promise.all([
      fetch("/api/team", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/clickup-tasks", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/webwork", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
      ...mondays.map((m) =>
        fetch(`/api/weekly-reports?week_start=${weekStartISO(m)}`, {
          cache: "no-store",
        })
          .then((r) => r.json())
          .catch(() => []),
      ),
    ]).then((results) => {
      const team: TeamRow[] = Array.isArray(results[0]) ? results[0] : [];
      const m =
        team.find((t) => (t.vcos_username ?? "").toLowerCase() === username) ??
        null;
      setMember(m);
      setClickUp(results[1]);
      setWebwork(results[2]?.members ?? []);
      const weekData = mondays.map((mon, i) => {
        const rows: ReportRow[] = Array.isArray(results[3 + i])
          ? results[3 + i]
          : [];
        const report = m
          ? (rows.find((r) => isReportFrom(r.submitted_by, m.full_name)) ??
            null)
          : null;
        return {
          mon,
          report,
          status: report ? classifySubmission(report.created_at, mon) : null,
        };
      });
      setWeeks(weekData);
      setLoading(false);
    });
  }, [username, allowed, me]);

  const cuKey = member
    ? (member.clickup_key ?? member.full_name.split(" ")[0]).toLowerCase()
    : "";
  const stats = lookup(clickup?.assigneeStats, cuKey);
  const avatar = lookup(clickup?.assigneeAvatars, cuKey);
  const hours = useMemo(() => {
    const w = webwork.find(
      (x) =>
        cuKey &&
        (x.username.toLowerCase().includes(cuKey) ||
          cuKey.includes(x.username.toLowerCase())),
    );
    return w?.totalHours ?? null;
  }, [webwork, cuKey]);
  const loops = useMemo(() => {
    const tasks = lookup(clickup?.tasksByAssignee, cuKey) ?? [];
    return tasks
      .filter(
        (t: Task) =>
          bucketFor(t.dueTs) === "overdue" ||
          t.priority === "urgent" ||
          t.priority === "high",
      )
      .sort(
        (a: Task, b: Task) =>
          (a.priority === "urgent" ? 0 : 1) - (b.priority === "urgent" ? 0 : 1),
      );
  }, [clickup, cuKey]);
  const latest =
    weeks
      .slice()
      .reverse()
      .find((w) => w.report)?.report ?? null;
  const filedCount = weeks.filter((w) => w.status !== null).length;

  if (!allowed)
    return (
      <div className="card p-6 text-center text-ink4 text-sm mt-8">
        You can only view your own profile.
      </div>
    );
  if (loading)
    return (
      <div className="py-8">
        <Spinner label="Loading profile…" className="text-ink4 text-sm" />
      </div>
    );
  if (!member)
    return (
      <div className="card p-6 text-center text-ink4 text-sm mt-8">
        No team member found for “{username}”.
      </div>
    );

  return (
    <div className="mt-6">
      <Link href="/kickoff" className="text-xs text-accent hover:underline">
        ← Back to Team Performance
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mt-3 mb-5">
        <Avatar
          name={member.full_name}
          image={avatar?.image}
          initials={avatar?.initials}
          color={avatar?.color}
          className="w-14 h-14 text-lg"
        />
        <div>
          <h1 className="font-display text-2xl tracking-wide">
            {member.full_name}
          </h1>
          <div className="text-sm text-ink3">
            {member.role_description}
            {member.files_report ? "" : " · exempt from reports"}
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="stat-tile">
          <div className="stat-value">
            {filedCount}/{WEEKS}
          </div>
          <div className="stat-label">Reports filed ({WEEKS}wk)</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{hours != null ? `${hours}h` : "-"}</div>
          <div className="stat-label">Hours this week</div>
        </div>
        <div className="stat-tile">
          <div
            className={`stat-value ${(stats?.overdue ?? 0) > 0 ? "text-danger" : ""}`}
          >
            {stats?.overdue ?? 0}
          </div>
          <div className="stat-label">Overdue tasks</div>
        </div>
        <div className="stat-tile">
          <div
            className={`stat-value ${(stats?.urgent ?? 0) > 0 ? "text-warning" : ""}`}
          >
            {stats?.urgent ?? 0}
          </div>
          <div className="stat-label">Urgent tasks</div>
        </div>
      </div>

      {/* Filing history */}
      <div className="slbl">Filing History - last {WEEKS} weeks</div>
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {weeks.map((w) => {
            const meta = w.status ? SUBMIT_STATUS_META[w.status] : null;
            return (
              <div
                key={w.mon.toISOString()}
                title={w.status ? meta!.long : "Not filed"}
                className={`text-[11px] font-semibold px-2 py-1 rounded border ${
                  w.status === null
                    ? "border-sand3 text-ink4 bg-sand2"
                    : w.status === "on-time"
                      ? "border-success/50 text-success bg-success-light"
                      : w.status === "weekend"
                        ? "border-warning/50 text-warning bg-warning-light"
                        : "border-danger/50 text-danger bg-danger-light"
                }`}
              >
                {fmtWeek(w.mon)} · {w.status ? meta!.label : "✗"}
              </div>
            );
          })}
        </div>
      </div>

      {/* Open loops */}
      <div className="slbl">Open Loops ({loops.length})</div>
      <div className="card mb-6 divide-y divide-sand3">
        {loops.length === 0 ? (
          <div className="p-4 text-sm text-ink4">
            No overdue, urgent, or high-priority tasks. ✓
          </div>
        ) : (
          loops.slice(0, 25).map((t: Task) => (
            <a
              key={t.id}
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 px-4 py-2.5 hover:bg-sand2 transition-colors group"
            >
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${t.priority === "urgent" ? "bg-danger-light text-danger" : t.priority === "high" ? "bg-warning-light text-warning" : "bg-sand3 text-ink3"}`}
              >
                {t.priority === "urgent"
                  ? "Urgent"
                  : t.priority === "high"
                    ? "High"
                    : "Due"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium group-hover:text-accent leading-snug">
                  {t.name}
                </div>
                <div className="text-[11px] text-ink4 mt-0.5">
                  {t.list}
                  {t.dueDate ? ` · Due ${t.dueDate}` : ""}
                </div>
              </div>
              <span className="text-ink4 text-sm group-hover:text-accent">
                ↗
              </span>
            </a>
          ))
        )}
        {loops.length > 25 && (
          <div className="px-4 py-2 text-xs text-ink4">
            +{loops.length - 25} more
          </div>
        )}
      </div>

      {/* Latest report */}
      {latest && (
        <>
          <div className="slbl">Latest Report</div>
          <div className="card p-5 space-y-3 text-sm">
            {latest.win && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-ink4 mb-1">
                  Top accomplishment
                </div>
                <FormattedNotes text={latest.win} className="text-ink2" />
              </div>
            )}
            {latest.accomplishments && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-ink4 mb-1">
                  Accomplishments
                </div>
                <FormattedNotes
                  text={latest.accomplishments}
                  className="text-ink2"
                />
              </div>
            )}
            {latest.priorities && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-ink4 mb-1">
                  Priorities
                </div>
                <FormattedNotes
                  text={latest.priorities}
                  className="text-ink2"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
