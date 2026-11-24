"use client";

// "All N open tasks" stacked bar (admin dashboard). The three parts don't
// overlap: Overdue = every overdue task; Urgent = urgent tasks not yet
// overdue; On track = the rest.
import Spinner from "@/components/Spinner";
import type { ClickUpData } from "@/lib/types";

export default function TaskSplit({ clickup, loading }: { clickup: ClickUpData | null; loading: boolean }) {
  const total = clickup?.totalTasks ?? 0;
  const overdue = clickup?.overdue ?? 0;
  const now = Date.now();
  const urgent = (clickup?.urgentDetails ?? []).filter((t) => !t.dueTs || t.dueTs >= now).length;
  const onTrack = Math.max(total - overdue - urgent, 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const parts = [
    { label: "On track", n: onTrack, bar: "bg-[#1D4ED8]" },
    { label: "Overdue", n: overdue, bar: "bg-[#B42318]" },
    { label: "Urgent, not yet overdue", n: urgent, bar: "bg-[#B54708]" },
  ];

  return (
    <section className="ad-card flex-[1_1_300px] px-5 sm:px-6 py-5">
      <h2 className="m-0 mb-1 text-lg font-extrabold">
        {loading && !clickup ? "All open tasks" : `All ${total} open tasks`}
      </h2>
      <p className="m-0 mb-4 text-[13px] text-[#475467]">From the nine personal task lists in ClickUp</p>
      {total > 0 ? (
        <>
          <div
            role="img"
            aria-label={parts.map((p) => `${pct(p.n)} percent ${p.label.toLowerCase()}`).join(", ")}
            className="flex h-4 rounded-full overflow-hidden gap-0.5"
          >
            {parts.filter((p) => p.n > 0).map((p) => (
              <div key={p.label} className={p.bar} style={{ flexGrow: p.n }} />
            ))}
          </div>
          <div className="flex flex-col gap-3 mt-5">
            {parts.map((p) => (
              <div key={p.label} className="flex justify-between items-center text-sm gap-3">
                <span className="flex items-center gap-2 font-semibold">
                  <span aria-hidden="true" className={`w-3 h-3 rounded-[3px] ${p.bar}`} />
                  {p.label}
                </span>
                <span>
                  <b className="tabular-nums">{p.n}</b> <span className="text-[#475467]">· {pct(p.n)}%</span>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-sm text-[#475467]">{loading ? <Spinner label="Loading tasks" /> : "No open tasks"}</div>
      )}
    </section>
  );
}
