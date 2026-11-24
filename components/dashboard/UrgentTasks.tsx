"use client";

// Priority tasks across the team (admin dashboard): every open Urgent task in
// the nine personal lists, due today first, then most overdue. Owner = the
// person whose list it is. Project tag = text before the first " - ".
import Spinner from "@/components/Spinner";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import { CLICKUP_PERSONAL_TASK_LISTS } from "@/lib/constants";
import { daysOverdue, dueLabel } from "@/lib/due-buckets";
import type { Task } from "@/lib/types";

type Filter = "all" | "overdue" | "today";
const PREVIEW = 8;

function splitTag(name: string): { tag: string; title: string } {
  const i = name.indexOf(" - ");
  if (i > 0 && i <= 30) return { tag: name.slice(0, i).trim(), title: name.slice(i + 3).trim() };
  return { tag: "", title: name };
}

// Due today, then most overdue, then upcoming (soonest first), then no due date.
function rank(days: number | null): number {
  if (days === null) return 1e9;
  if (days === 0) return -1e9;
  return days > 0 ? -days : 1e6 - days;
}

export default function UrgentTasks({ tasks, loading }: { tasks: Task[]; loading: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);
  const now = new Date();
  const rows = tasks
    .map((t) => ({
      t,
      days: daysOverdue(t.dueTs, now),
      owner: CLICKUP_PERSONAL_TASK_LISTS.find((l) => l.id === t.listId)?.owner ?? t.list,
      ...splitTag(t.name),
    }))
    .sort((a, b) => rank(a.days) - rank(b.days));
  const counts: Record<Filter, number> = {
    all: rows.length,
    overdue: rows.filter((r) => (r.days ?? -1) > 0).length,
    today: rows.filter((r) => r.days === 0).length,
  };
  const matching =
    filter === "overdue" ? rows.filter((r) => (r.days ?? -1) > 0) : filter === "today" ? rows.filter((r) => r.days === 0) : rows;
  const shown = expanded ? matching : matching.slice(0, PREVIEW);

  return (
    <section id="priority" className="ad-card">
      <div className="ad-card-head">
        <div>
          <h2>Priority tasks across the team</h2>
          <p>Urgent tasks, due today and most overdue first · {rows.length} in total</p>
        </div>
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filter tasks">
          {(
            [
              ["all", "All"],
              ["overdue", "Overdue"],
              ["today", "Due today"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="ad-filter"
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setExpanded(false);
              }}
            >
              {label} <span className="opacity-70">{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>
      {loading && tasks.length === 0 ? (
        <div className="ad-row px-6 py-4 text-sm text-[#475467]"><Spinner label="Loading tasks" /></div>
      ) : shown.length === 0 ? (
        <p className="ad-row px-6 py-4 text-sm text-[#475467]">No urgent tasks in this view.</p>
      ) : (
        shown.map(({ t, days, owner, tag, title }) => (
          <a
            key={t.id}
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ad-row px-5 sm:px-6 py-3.5 flex flex-wrap gap-3 items-center justify-between hover:bg-[#F9FAFB] transition-colors"
          >
            <div className="flex-[1_1_320px] min-w-0">
              <div className="text-[15px] font-semibold leading-snug">
                {tag && <span className="ad-tag">{tag}</span>}
                {title}
              </div>
              <div className="flex items-center gap-2 mt-2 text-[13px] text-[#475467]">
                <Avatar name={owner} className="w-6 h-6 text-[10px]" />
                {owner}
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <span className="ad-pill red">Urgent</span>
              {days !== null && (
                <span
                  className={`text-[13px] font-bold min-w-[104px] text-right ${
                    days > 0 ? "text-[#B42318]" : days === 0 ? "text-[#93370D]" : "text-[#475467]"
                  }`}
                >
                  {dueLabel(t.dueTs, now)}
                </span>
              )}
            </div>
          </a>
        ))
      )}
      {matching.length > PREVIEW && (
        <div className="ad-row px-5 sm:px-6 py-4">
          <button type="button" className="ad-btn text-sm px-4" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show fewer" : `Show all ${matching.length} tasks`}
          </button>
        </div>
      )}
    </section>
  );
}
