"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import { SUBMIT_STATUS_META } from "@/lib/report-status";
import type { MemberAudit } from "@/hooks/useMemberAudit";

/** Suggested next step from a person's ClickUp load. */
function nextStep(a: MemberAudit): string {
  if (a.overdue > 10) return "Triage overdue backlog with PM";
  if (a.urgent > 0) return "Clear urgent tasks";
  if (a.total === 0) return "No ClickUp tasks assigned";
  return "On track";
}

/** Per-person table: weekly-report status, hours, ClickUp load, next step. */
export default function PeopleAuditTable({ rows }: { rows: MemberAudit[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[760px]">
        <thead>
          <tr className="border-b border-sand3">
            {[
              "Member",
              "Report",
              "Hours",
              "Tasks",
              "Overdue",
              "Urgent",
              "Top highlight",
              "Next step",
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
            const meta = a.status ? SUBMIT_STATUS_META[a.status] : null;
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
                    <div>
                      {a.username ? (
                        <Link
                          href={`/profile/${a.username}`}
                          className="font-semibold text-[13px] hover:text-accent hover:underline"
                        >
                          {a.name}
                        </Link>
                      ) : (
                        <div className="font-semibold text-[13px]">
                          {a.name}
                        </div>
                      )}
                      <div className="text-[11px] text-ink4">{a.role}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  {!a.filesReport ? (
                    <span className="text-ink4">-</span>
                  ) : meta ? (
                    <span className={meta.badge}>{meta.label}</span>
                  ) : (
                    <span className="badge-red">Missing</span>
                  )}
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
                <td className="py-2.5 px-3 text-ink3 text-xs max-w-[260px] truncate">
                  {a.report?.win || "-"}
                </td>
                <td className="py-2.5 px-3 text-xs text-ink3 whitespace-nowrap">
                  {nextStep(a)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
