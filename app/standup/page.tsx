"use client";

import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/hooks/useMe";
import Spinner from "@/components/Spinner";
import { FiRefreshCw } from "react-icons/fi";

interface DailyRow {
  report_date: string;
  reports_filed: string[];
  reports_missing: string[];
  overdue_count: number;
  urgent_count: number;
  total_tasks: number;
  team_hours: Record<string, number>;
}

const sumHours = (h: Record<string, number> | null | undefined) =>
  Math.round(Object.values(h ?? {}).reduce((s, n) => s + (n || 0), 0));

function fmtDay(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function StandupPage() {
  const { isAdmin } = useMe();
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/reports/daily")
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    await fetch("/api/reports/daily", { method: "POST" }).catch(() => {});
    setRunning(false);
    load();
  };

  // Trend: overdue over time (oldest → newest), normalized to a max for mini bars.
  const trend = [...rows].reverse();
  const maxOverdue = Math.max(1, ...trend.map((r) => r.overdue_count));

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-xl tracking-widest">
          DAILY STANDUP LOG
        </h1>
        {isAdmin && (
          <button
            onClick={runNow}
            disabled={running}
            className="btn-secondary flex items-center gap-1.5 !py-1.5 disabled:opacity-50"
          >
            <FiRefreshCw size={14} className={running ? "animate-spin" : ""} />{" "}
            {running ? "Running…" : "Run today's brief"}
          </button>
        )}
      </div>
      <p className="text-xs text-ink4 mb-4">
        Daily snapshot of reports filed, task load, and hours - captured
        automatically each morning.
      </p>

      {loading ? (
        <div className="py-6">
          <Spinner label="Loading history…" className="text-ink4 text-sm" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink4">
          No daily snapshots yet. They&apos;re captured by the morning cron - or
          click &ldquo;Run today&apos;s brief&rdquo;.
        </div>
      ) : (
        <>
          {/* Overdue trend */}
          <div className="card p-4 mb-4">
            <div className="slbl !mt-0 !mb-2">Overdue tasks - trend</div>
            <div className="flex items-end gap-1 h-20">
              {trend.map((r) => (
                <div
                  key={r.report_date}
                  className="flex-1 flex flex-col items-center gap-1 group"
                  title={`${fmtDay(r.report_date)}: ${r.overdue_count} overdue`}
                >
                  <div
                    className="w-full bg-danger/70 group-hover:bg-danger rounded-t transition-colors"
                    style={{
                      height: `${Math.max(4, Math.round((r.overdue_count / maxOverdue) * 64))}px`,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Daily entries */}
          <div className="card divide-y divide-sand3">
            {rows.map((r) => {
              const total = r.reports_filed.length + r.reports_missing.length;
              return (
                <div key={r.report_date} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-sm font-semibold">
                      {fmtDay(r.report_date)}
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`badge ${r.reports_missing.length === 0 ? "badge-green" : "badge-amber"}`}
                      >
                        {r.reports_filed.length}/{total} filed
                      </span>
                      {r.overdue_count > 0 && (
                        <span className="badge-red">
                          {r.overdue_count} overdue
                        </span>
                      )}
                      {r.urgent_count > 0 && (
                        <span className="badge-amber">
                          {r.urgent_count} urgent
                        </span>
                      )}
                      <span className="text-ink4">
                        {r.total_tasks} tasks · {sumHours(r.team_hours)}h
                      </span>
                    </div>
                  </div>
                  {r.reports_missing.length > 0 && (
                    <div className="text-[11px] text-ink4 mt-1">
                      Missing:{" "}
                      {r.reports_missing.map((n) => n.split(" ")[0]).join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
