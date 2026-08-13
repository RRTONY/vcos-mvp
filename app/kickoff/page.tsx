"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/hooks/useMe";
import Avatar from "@/components/Avatar";
import Spinner from "@/components/Spinner";
import FormattedNotes from "@/components/FormattedNotes";
import TaskBuckets from "@/components/TaskBuckets";
import PeopleAuditTable from "@/components/PeopleAuditTable";
import TabBar from "@/components/TabBar";
import {
  useMemberAudit,
  type MemberAudit,
  type AuditReportRow,
} from "@/hooks/useMemberAudit";
import { isReportFrom } from "@/lib/report-match";
import { bucketFor } from "@/lib/due-buckets";
import { lookupByAssignee } from "@/lib/assignee-lookup";
import type { ClickUpData } from "@/lib/types";

function fmtWeek(mon: Date): string {
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(mon)}–${f(fri)}`;
}

const TABS = [
  { id: "agenda", label: "Meeting Agenda" },
  { id: "audit", label: "People Audit" },
  { id: "completed", label: "Completed Tasks" },
  { id: "loops", label: "Open Loops" },
  { id: "clickup", label: "ClickUp Status" },
  { id: "recs", label: "Recommendations" },
] as const;
type TabId = (typeof TABS)[number]["id"];

interface Brief {
  weekLabel?: string;
  summary?: string;
  agenda?: {
    title: string;
    detail: string;
    urgency: "fire" | "high" | "normal";
    owner?: string;
  }[];
  recommendations?: {
    critical?: { title: string; body: string; action?: string }[];
    high?: { title: string; body: string; action?: string }[];
    positive?: { title: string; body: string }[];
  };
}

export default function KickoffPage() {
  const { isAdmin } = useMe();
  const [tab, setTab] = useState<TabId>("agenda");
  const [recentReports, setRecentReports] = useState<AuditReportRow[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefAt, setBriefAt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const {
    audit,
    reportingAudit,
    clickup,
    loading: auditLoading,
    weekMon,
  } = useMemberAudit(isAdmin);
  const loading = auditLoading || recentLoading;

  // Recent reports (no week filter) so Completed Tasks shows each person's
  // latest report even if they haven't filed for the current week yet.
  useEffect(() => {
    if (!isAdmin) return;
    setRecentLoading(true);
    fetch("/api/weekly-reports", { cache: "no-store" })
      .then((r) => r.json())
      .then((recent) => setRecentReports(Array.isArray(recent) ? recent : []))
      .catch(() => setRecentReports([]))
      .finally(() => setRecentLoading(false));
  }, [isAdmin]);

  // Load the last AI-generated brief (cheap, cached server-side).
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/kickoff-brief", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setBrief(d.brief ?? null);
        setBriefAt(d.generatedAt ?? null);
      })
      .catch(() => {});
  }, [isAdmin]);

  async function generateBrief() {
    setGenerating(true);
    try {
      const res = await fetch("/api/kickoff-brief", { method: "POST" });
      const d = await res.json();
      if (res.ok) {
        setBrief(d.brief);
        setBriefAt(d.generatedAt);
      } else alert(`Brief generation failed: ${d.error ?? "error"}`);
    } catch {
      alert("Network error generating brief");
    } finally {
      setGenerating(false);
    }
  }

  const submittedCount = reportingAudit.filter((a) => a.status !== null).length;

  if (!isAdmin) {
    return (
      <div className="card p-6 text-center text-ink4 text-sm mt-8">
        The Kickoff brief is available to admins and owners only.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mt-6 mb-1 gap-3">
        <h1 className="font-display text-2xl tracking-widest">
          TEAM PERFORMANCE
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink4 hidden sm:inline">
            Week of {fmtWeek(weekMon)}
          </span>
          <button
            onClick={generateBrief}
            disabled={generating}
            className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
          >
            {generating
              ? "Generating…"
              : brief
                ? "Regenerate brief"
                : "Generate brief"}
          </button>
        </div>
      </div>
      <p className="text-xs text-ink4 mb-4">
        Team performance &amp; exception brief - {submittedCount}/
        {reportingAudit.length} reports filed.
        {briefAt && (
          <span>
            {" "}
            · Brief generated{" "}
            {new Date(briefAt).toLocaleString("en-US", {
              timeZone: "America/Los_Angeles",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            PT
          </span>
        )}
      </p>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {loading ? (
        <div className="py-6">
          <Spinner label="Building the brief…" className="text-ink4 text-sm" />
        </div>
      ) : tab === "agenda" ? (
        <AgendaTab
          brief={brief}
          generating={generating}
          onGenerate={generateBrief}
        />
      ) : tab === "recs" ? (
        <RecommendationsTab
          brief={brief}
          generating={generating}
          onGenerate={generateBrief}
        />
      ) : tab === "audit" ? (
        <PeopleAuditTable rows={reportingAudit} />
      ) : tab === "completed" ? (
        <CompletedTasks rows={reportingAudit} recentReports={recentReports} />
      ) : tab === "loops" ? (
        <OpenLoopsByPerson rows={audit} clickup={clickup} />
      ) : (
        <ClickUpStatus rows={audit} />
      )}
    </div>
  );
}

// ── Empty state shown when no brief has been generated ──────────────────────────
function NeedsBrief({
  generating,
  onGenerate,
}: {
  generating: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="card p-8 text-center">
      <p className="text-sm text-ink3 mb-3">
        No brief generated yet for this week.
      </p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="btn-primary text-sm disabled:opacity-50"
      >
        {generating ? "Generating…" : "Generate brief"}
      </button>
      <p className="text-[11px] text-ink4 mt-3">
        AI synthesizes this week’s reports + ClickUp load into an agenda and
        recommendations.
      </p>
    </div>
  );
}

const URG_META: Record<string, { label: string; cls: string; dot: string }> = {
  fire: { label: "FIRE", cls: "text-danger", dot: "bg-danger" },
  high: { label: "HIGH", cls: "text-warning", dot: "bg-warning" },
  normal: { label: "NORMAL", cls: "text-ink3", dot: "bg-ink4" },
};

// ── Meeting Agenda tab ──────────────────────────────────────────────────────────
function AgendaTab({
  brief,
  generating,
  onGenerate,
}: {
  brief: Brief | null;
  generating: boolean;
  onGenerate: () => void;
}) {
  if (!brief?.agenda?.length)
    return <NeedsBrief generating={generating} onGenerate={onGenerate} />;
  return (
    <div className="space-y-4">
      {brief.summary && (
        <div className="alert alert-blue">
          <span>{brief.summary}</span>
        </div>
      )}
      <div className="card divide-y divide-sand3">
        {brief.agenda.map((a, i) => {
          const m = URG_META[a.urgency] ?? URG_META.normal;
          return (
            <div key={i} className="flex items-start gap-3 px-5 py-3">
              <span
                className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${m.dot}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{a.title}</span>
                  <span
                    className={`text-[9px] font-bold tracking-widest ${m.cls}`}
                  >
                    {m.label}
                  </span>
                </div>
                <p className="text-xs text-ink2 mt-0.5 leading-relaxed">
                  {a.detail}
                </p>
                {a.owner && (
                  <p className="text-[10px] text-ink4 mt-1">Owner: {a.owner}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Recommendations tab ─────────────────────────────────────────────────────────
function RecommendationsTab({
  brief,
  generating,
  onGenerate,
}: {
  brief: Brief | null;
  generating: boolean;
  onGenerate: () => void;
}) {
  const r = brief?.recommendations;
  if (!r || (!r.critical?.length && !r.high?.length && !r.positive?.length))
    return <NeedsBrief generating={generating} onGenerate={onGenerate} />;
  const Section = ({
    title,
    items,
    accent,
    kind,
  }: {
    title: string;
    items?: { title: string; body: string; action?: string }[];
    accent: string;
    kind: "crit" | "high" | "pos";
  }) => {
    if (!items?.length) return null;
    const border =
      kind === "crit"
        ? "border-l-danger"
        : kind === "high"
          ? "border-l-warning"
          : "border-l-success";
    return (
      <div className="mb-5">
        <div
          className={`text-xs font-bold uppercase tracking-widest mb-2 ${accent}`}
        >
          {title}
        </div>
        <div className="space-y-2">
          {items.map((c, i) => (
            <div key={i} className={`card border-l-4 ${border} p-4`}>
              <div className="text-sm font-semibold mb-1">{c.title}</div>
              <p className="text-xs text-ink2 leading-relaxed">{c.body}</p>
              {c.action && (
                <p className="text-[11px] text-ink mt-2 bg-sand2 rounded px-2 py-1 inline-block">
                  → {c.action}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div>
      <Section
        title="Critical - act today"
        items={r.critical}
        accent="text-danger"
        kind="crit"
      />
      <Section
        title="High priority - this week"
        items={r.high}
        accent="text-warning"
        kind="high"
      />
      <Section
        title="Recognize publicly"
        items={r.positive}
        accent="text-success"
        kind="pos"
      />
    </div>
  );
}

// ── Completed Tasks tab ─────────────────────────────────────────────────────────
function CompletedTasks({
  rows,
  recentReports,
}: {
  rows: MemberAudit[];
  recentReports: AuditReportRow[];
}) {
  // Each reporting member's most recent report (any week), so this isn't empty
  // just because no one has filed for the current week yet.
  const people = rows
    .map((a) => {
      const mine = recentReports
        .filter((r) => isReportFrom(r.submitted_by, a.name))
        .sort(
          (x, y) =>
            new Date(y.created_at).getTime() - new Date(x.created_at).getTime(),
        );
      return { ...a, latest: mine[0] ?? null };
    })
    .filter((p) => p.latest);

  if (people.length === 0)
    return (
      <div className="card p-6 text-center text-ink4 text-sm">
        No weekly reports on record yet. Once team members submit, their
        accomplishments appear here.
      </div>
    );

  return (
    <div className="space-y-3">
      {people.map((a, i) => {
        const r = a.latest!;
        const when = new Date(r.created_at).toLocaleDateString("en-US", {
          timeZone: "America/Los_Angeles",
          month: "short",
          day: "numeric",
        });
        return (
          <details key={a.name} className="card" open={i < 4}>
            <summary className="card-hd cursor-pointer list-none flex items-center gap-2">
              <Avatar
                name={a.name}
                image={a.avatar?.image}
                initials={a.avatar?.initials}
                color={a.avatar?.color}
                className="w-7 h-7 text-[11px]"
              />
              <span className="card-ti">{a.name}</span>
              <span className="text-[11px] text-ink4 ml-auto">
                Report of {when}
              </span>
            </summary>
            <div className="card-body space-y-3 text-sm">
              {r.win && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-ink4 mb-1">
                    Top accomplishment
                  </div>
                  <FormattedNotes text={r.win} className="text-ink2" />
                </div>
              )}
              {r.accomplishments && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-ink4 mb-1">
                    Accomplishments
                  </div>
                  <FormattedNotes
                    text={r.accomplishments}
                    className="text-ink2"
                  />
                </div>
              )}
              {r.goals_met && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-ink4 mb-1">
                    Last week - done vs. not
                  </div>
                  <FormattedNotes text={r.goals_met} className="text-ink2" />
                </div>
              )}
              {!r.win && !r.accomplishments && !r.goals_met && (
                <p className="text-ink4 text-xs">
                  No accomplishments captured in this report.
                </p>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

// ── Open Loops tab (per person, same TaskBuckets as the dashboard) ───────────────
function OpenLoopsByPerson({
  rows,
  clickup,
}: {
  rows: MemberAudit[];
  clickup: ClickUpData | null;
}) {
  const now = new Date();
  const people = rows
    .map((a) => {
      const tasks = lookupByAssignee(clickup?.tasksByAssignee, a.cuKey) ?? [];
      return {
        ...a,
        tasks,
        overdue: tasks.filter((t) => bucketFor(t.dueTs, now) === "overdue")
          .length,
      };
    })
    .filter((p) => p.tasks.length > 0)
    .sort((a, b) => b.overdue - a.overdue || b.tasks.length - a.tasks.length);

  if (people.length === 0)
    return (
      <div className="card p-6 text-center text-ink4 text-sm">
        No open tasks across the team.
      </div>
    );

  return (
    <div className="space-y-2">
      {people.map((p, i) => (
        <details key={p.name} className="card" open={i === 0}>
          <summary className="card-hd cursor-pointer list-none flex items-center gap-2">
            <Avatar
              name={p.name}
              image={p.avatar?.image}
              initials={p.avatar?.initials}
              color={p.avatar?.color}
              className="w-7 h-7 text-[11px]"
            />
            <span className="card-ti">{p.name}</span>
            <span className="text-[11px] text-ink4">{p.role}</span>
            {p.overdue > 0 && (
              <span className="badge-red ml-auto">{p.overdue} overdue</span>
            )}
            <span
              className={`text-[11px] text-ink4 ${p.overdue > 0 ? "" : "ml-auto"}`}
            >
              {p.tasks.length} tasks
            </span>
          </summary>
          <div className="px-5 py-1">
            <TaskBuckets tasks={p.tasks} />
          </div>
        </details>
      ))}
    </div>
  );
}

// ── ClickUp Status tab ──────────────────────────────────────────────────────────
function ClickUpStatus({ rows }: { rows: MemberAudit[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[600px]">
        <thead>
          <tr className="border-b border-sand3">
            {[
              "Member",
              "Hours",
              "Open tasks",
              "Overdue",
              "Urgent",
              "Action",
            ].map((h) => (
              <th
                key={h}
                className="text-left py-2 px-3 font-extrabold text-[10px] uppercase tracking-widest text-ink3"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const action =
              a.overdue > 10
                ? "Triage overdue backlog with PM"
                : a.urgent > 0
                  ? "Clear urgent tasks"
                  : a.total === 0
                    ? "No ClickUp tasks assigned"
                    : "On track";
            return (
              <tr key={a.name} className="border-b border-sand3 last:border-0">
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={a.name}
                      image={a.avatar?.image}
                      initials={a.avatar?.initials}
                      color={a.avatar?.color}
                      className="w-7 h-7 text-[11px]"
                    />
                    <span className="font-semibold text-[13px]">{a.name}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 tabular-nums">
                  {a.hours != null ? `${a.hours}h` : "-"}
                </td>
                <td className="py-2.5 px-3 tabular-nums">{a.total}</td>
                <td className="py-2.5 px-3 tabular-nums">
                  {a.overdue > 0 ? (
                    <span className="text-danger font-semibold">
                      {a.overdue}
                    </span>
                  ) : (
                    "0"
                  )}
                </td>
                <td className="py-2.5 px-3 tabular-nums">
                  {a.urgent > 0 ? (
                    <span className="text-warning font-semibold">
                      {a.urgent}
                    </span>
                  ) : (
                    "0"
                  )}
                </td>
                <td className="py-2.5 px-3 text-xs text-ink3">{action}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
