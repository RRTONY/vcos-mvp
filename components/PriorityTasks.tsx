"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "urgent", label: "Urgent" },
  { id: "high", label: "High" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];
const PREVIEW = 8;

/** Urgent + high ClickUp tasks, filterable by priority. */
export default function PriorityTasks({
  urgent,
  high,
}: {
  urgent: Task[];
  high: Task[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);
  const counts: Record<Filter, number> = {
    all: urgent.length + high.length,
    urgent: urgent.length,
    high: high.length,
  };
  const matching =
    filter === "urgent" ? urgent : filter === "high" ? high : [...urgent, ...high];
  const shown = expanded ? matching : matching.slice(0, PREVIEW);

  return (
    <section className="panel mb-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="panel-title mr-auto">
          Priority tasks
          <span className="count-pill red">{counts.all}</span>
        </h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by priority">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                setExpanded(false);
              }}
              className="fchip"
            >
              {f.label}
              <span className="text-xs opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-ink3">No {filter === "all" ? "" : filter + " "}tasks right now.</p>
      ) : (
        shown.map((t) => (
          <a
            key={t.id}
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            className="row-btn"
          >
            <span className="t">{t.name}</span>
            <span className={`pill ${t.priority === "urgent" ? "red" : "amber"}`}>
              {t.priority === "urgent" ? "Urgent" : "High"}
            </span>
            <span className="s">
              {t.list}
              {t.dueDate ? ` · Due ${t.dueDate}` : ""}
              {t.assignees.length ? ` · ${t.assignees.join(", ")}` : ""}
            </span>
          </a>
        ))
      )}
      {matching.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="btn-secondary justify-self-start"
        >
          {expanded ? "Show fewer" : `Show all ${matching.length}`}
        </button>
      )}
    </section>
  );
}
