"use client";

// Team workload table (admin dashboard): one row per active team member,
// sorted by most overdue. Figures come from the ClickUp snapshot, which counts
// only open tasks in each person's own list (docs/ai/project_clickup_figures.md).
import Spinner from "@/components/Spinner";
import Avatar from "@/components/Avatar";
import type { ClickUpData } from "@/lib/types";
import {
  avatarFor,
  onTimeColor,
  onTimePct,
  statsFor,
  type DashMember,
} from "./types";

const COLS = "grid grid-cols-[minmax(170px,2.2fr)_repeat(3,minmax(56px,0.7fr))_minmax(150px,1.8fr)] gap-3 items-center px-5 sm:px-6";

export default function TeamWorkload({
  members,
  clickup,
  loading,
}: {
  members: DashMember[];
  clickup: ClickUpData | null;
  loading: boolean;
}) {
  const rows = members
    .map((m) => ({ m, s: statsFor(clickup, m.cuKey) ?? { total: 0, overdue: 0, urgent: 0 } }))
    .sort((a, b) => b.s.overdue - a.s.overdue || b.s.total - a.s.total || a.m.name.localeCompare(b.m.name));

  return (
    <section id="workload" className="ad-card flex-[999_1_600px]">
      <div className="ad-card-head">
        <div>
          <h2>Team workload</h2>
          <p>Sorted by most overdue. &ldquo;On time&rdquo; is the share of a person&rsquo;s open tasks that are not overdue.</p>
        </div>
      </div>
      <div className="overflow-x-auto relative">
        <div className="min-w-[640px]" role="table" aria-label="Team workload">
          <div role="row" className={`${COLS} ad-row bg-[#F9FAFB] py-2.5 text-xs font-bold text-[#475467]`}>
            <span role="columnheader">Person</span>
            <span role="columnheader">Open</span>
            <span role="columnheader">Overdue</span>
            <span role="columnheader">Urgent</span>
            <span role="columnheader">On time</span>
          </div>
          {loading && !clickup ? (
            <div className="px-6 py-4 text-sm text-[#475467]"><Spinner label="Loading tasks" /></div>
          ) : (
            rows.map(({ m, s }) => {
              const pct = onTimePct(s);
              const av = avatarFor(clickup, m.cuKey);
              return (
                <div key={m.name} role="row" className={`${COLS} ad-row py-3`}>
                  <div role="cell" className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={m.name} image={av?.image} initials={av?.initials} color={av?.color} className="w-8 h-8 text-[11px] flex-none" />
                    <span className="min-w-0">
                      <span className="block font-bold text-sm truncate">{m.name}</span>
                      <span className="block text-xs text-[#475467] truncate">{m.role}</span>
                    </span>
                  </div>
                  <span role="cell" className="text-sm font-semibold tabular-nums">{s.total}</span>
                  <span role="cell" className={`text-sm font-extrabold tabular-nums ${s.overdue > 0 ? "text-[#B42318]" : "text-[#475467]"}`}>
                    {s.overdue}
                  </span>
                  <span role="cell" className="text-sm font-semibold tabular-nums">{s.urgent}</span>
                  <div role="cell" className="flex items-center gap-2.5">
                    <div className="ad-bar" aria-hidden="true">
                      {pct !== null && <span className={onTimeColor(pct)} style={{ width: `${Math.max(pct, 3)}%` }} />}
                    </div>
                    <span className="text-[13px] font-extrabold min-w-[56px] text-right tabular-nums">
                      {pct === null ? (
                        <>
                          <span aria-hidden="true">–</span>
                          <span className="sr-only">No open tasks</span>
                        </>
                      ) : (
                        `${pct}%`
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
