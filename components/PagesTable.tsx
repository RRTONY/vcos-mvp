"use client";

import { useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiChevronUp,
  FiChevronDown,
  FiInfo,
} from "react-icons/fi";
import type { PageRow } from "@/lib/google-analytics";

type PageSortKey = "pageviews" | "sessions" | "eventCount" | "activeUsers";

// Plain-language labels + a hover explanation for each - "Sessions",
// "Event count" etc. are analytics jargon that reads as noise to a
// non-technical viewer, so this trades a little precision for clarity.
const PAGE_COLUMNS: { key: PageSortKey; label: string; hint: string }[] = [
  { key: "pageviews", label: "Views", hint: "How many times this page was opened" },
  { key: "sessions", label: "Visits", hint: "How many separate visits included this page" },
  { key: "eventCount", label: "Clicks", hint: "Clicks, scrolls, and other actions people took on this page" },
  { key: "activeUsers", label: "People", hint: "How many different people visited this page" },
];

// Windowed page-number list with ellipses, e.g. [1, "…", 6, 7, 8, "…", 14] -
// always shows the first/last page and a window around the current one so
// the control stays compact even at 100+ pages.
function pageNumbers(current: number, total: number): (number | "…")[] {
  const middle: number[] = [];
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    middle.push(i);
  }
  const result: (number | "…")[] = [1];
  if (middle[0] > 2) result.push("…");
  result.push(...middle);
  if (middle[middle.length - 1] < total - 1) result.push("…");
  if (total > 1) result.push(total);
  return result;
}

// A single up/down chevron in accent color for the active sort column
// (matching its direction), or both chevrons faded to hint the column is
// sortable - the shadcn/ui data-table convention.
function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (active) {
    return dir === "asc" ? (
      <FiChevronUp className="w-3.5 h-3.5 text-accent flex-shrink-0" />
    ) : (
      <FiChevronDown className="w-3.5 h-3.5 text-accent flex-shrink-0" />
    );
  }
  return (
    <span className="flex flex-col -space-y-1.5 text-ink4/40 flex-shrink-0">
      <FiChevronUp className="w-3 h-3" />
      <FiChevronDown className="w-3 h-3" />
    </span>
  );
}

// Searchable, sortable, paginated page-level table - the GA4-style breakdown
// (search box + table) rather than just a top-N ranked list, so any page can
// be found, not only the biggest ones.
export function PagesTable({ rows }: { rows: PageRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<PageSortKey>("pageviews");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageIdx, setPageIdx] = useState(0);
  const [openHint, setOpenHint] = useState<PageSortKey | null>(null);
  const pageSize = 10;

  // Clicking the active column flips its direction; clicking a different
  // column switches to it, starting high-to-low (the more useful default).
  function handleSort(key: PageSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPageIdx(0);
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
        <p className="text-xs text-ink4">No page data yet.</p>
      </div>
    );
  }

  // Snapshots cached before eventCount/activeUsers were added won't have
  // them - default every metric to 0 rather than crashing on
  // undefined.toLocaleString().
  const normalized = rows.map((r) => ({
    ...r,
    pageviews: r.pageviews ?? 0,
    sessions: r.sessions ?? 0,
    eventCount: r.eventCount ?? 0,
    activeUsers: r.activeUsers ?? 0,
  }));

  const q = query.trim().toLowerCase();
  const filtered = q
    ? normalized.filter((r) => `${r.title} ${r.path}`.toLowerCase().includes(q))
    : normalized;
  const sorted = [...filtered].sort((a, b) =>
    sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clamped = Math.min(pageIdx, totalPages - 1);
  const visible = sorted.slice(clamped * pageSize, clamped * pageSize + pageSize);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 py-2">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPageIdx(0);
          }}
          placeholder="Search pages..."
          className="field-input !py-1.5 !px-3 text-sm max-w-xs"
        />
        <span className="text-xs text-ink4 whitespace-nowrap">
          {sorted.length.toLocaleString()} page{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
          <p className="text-xs text-ink4">No pages match "{query}".</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand3">
                  <th className="text-left py-2 pr-3 text-xs font-bold uppercase tracking-widest text-ink3">
                    Page
                  </th>
                  {PAGE_COLUMNS.map((c) => (
                    <th key={c.key} className="relative text-right px-2">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <button
                          onClick={() => handleSort(c.key)}
                          className={`flex items-center gap-0.5 text-xs font-bold uppercase tracking-widest whitespace-nowrap ${
                            sortKey === c.key ? "text-accent" : "text-ink3"
                          }`}
                        >
                          {c.label}
                          <SortIcon active={sortKey === c.key} dir={sortDir} />
                        </button>
                        <button
                          type="button"
                          aria-label={`What does "${c.label}" mean?`}
                          onClick={() =>
                            setOpenHint(openHint === c.key ? null : c.key)
                          }
                          className="w-4 h-4 flex items-center justify-center rounded-full text-ink4 hover:text-accent hover:bg-sand2 flex-shrink-0"
                        >
                          <FiInfo className="w-3 h-3" />
                        </button>
                      </div>

                      {openHint === c.key && (
                        <>
                          {/* Click anywhere outside to close */}
                          <button
                            aria-label="Close"
                            onClick={() => setOpenHint(null)}
                            className="fixed inset-0 z-10 cursor-default"
                          />
                          <div className="absolute right-0 top-full mt-1.5 z-20 w-52 rounded-lg border border-sand4 bg-sand shadow-card p-3 text-left">
                            <p className="text-xs font-bold text-ink mb-1">
                              {c.label}
                            </p>
                            <p className="text-xs text-ink3 leading-snug normal-case tracking-normal">
                              {c.hint}
                            </p>
                          </div>
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sand3">
                {visible.map((r) => (
                  <tr key={r.path}>
                    <td className="py-2.5 pr-3 min-w-0 max-w-xs">
                      <div
                        className="text-sm font-semibold truncate"
                        title={r.title || r.path}
                      >
                        {r.title || r.path}
                      </div>
                      <div className="text-xs text-ink4 truncate">{r.path}</div>
                    </td>
                    <td className="text-right px-2 tabular-nums whitespace-nowrap">
                      {r.pageviews.toLocaleString()}
                    </td>
                    <td className="text-right px-2 tabular-nums whitespace-nowrap">
                      {r.sessions.toLocaleString()}
                    </td>
                    <td className="text-right px-2 tabular-nums whitespace-nowrap">
                      {r.eventCount.toLocaleString()}
                    </td>
                    <td className="text-right px-2 tabular-nums whitespace-nowrap">
                      {r.activeUsers.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-sand3">
            <span className="text-xs text-ink4 whitespace-nowrap">
              Page {clamped + 1} of {totalPages}
            </span>

            <div className="flex items-center gap-1">
              <button
                disabled={clamped === 0}
                onClick={() => setPageIdx(clamped - 1)}
                aria-label="Previous page"
                className="w-7 h-7 flex items-center justify-center rounded-md border border-sand4 text-ink3 hover:bg-sand2 hover:border-accent/40 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-sand4 transition-colors"
              >
                <FiChevronLeft className="w-4 h-4" />
              </button>

              {pageNumbers(clamped + 1, totalPages).map((p, i) =>
                p === "…" ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="w-7 h-7 flex items-center justify-center text-xs text-ink4"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPageIdx(p - 1)}
                    aria-current={p === clamped + 1 ? "page" : undefined}
                    className={`w-7 h-7 flex items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors ${
                      p === clamped + 1
                        ? "bg-accent border-accent text-white shadow-sm"
                        : "border-sand4 text-ink3 hover:bg-sand2 hover:border-accent/40"
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}

              <button
                disabled={clamped >= totalPages - 1}
                onClick={() => setPageIdx(clamped + 1)}
                aria-label="Next page"
                className="w-7 h-7 flex items-center justify-center rounded-md border border-sand4 text-ink3 hover:bg-sand2 hover:border-accent/40 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-sand4 transition-colors"
              >
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
