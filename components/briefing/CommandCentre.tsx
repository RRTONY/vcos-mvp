"use client";

import { useMemo, useState } from "react";
import { FiChevronDown, FiSearch } from "react-icons/fi";
import {
  HEALTH,
  HEALTH_ORDER,
  ageText,
  byEntryRank,
  byOrder,
  headlineOf,
  healthOf,
  meetingItems,
  norm,
  ownerNames,
  urgencyOf,
  type BEntry,
  type Diff,
  type Health,
} from "@/lib/briefing-view";
import type { BriefingData } from "@/hooks/useBriefing";
import { SkeletonCards, SkeletonKpis } from "@/components/Skeleton";
import { EditField, Empty, Label, PersonDot, PersonStack, SourceLinks } from "./parts";

type StatusFilter = "all" | Health;

function Tile({ e, diff, openAudit, onOpen }: { e: BEntry; diff: Diff; openAudit: number; onOpen: () => void }) {
  const h = healthOf(e);
  const ch = diff.state === "ok" ? diff.by[e.id] : undefined;
  const note = String(e.teamNote ?? "").trim();
  const mc = meetingItems(e).length;
  return (
    <button type="button" onClick={onOpen} className={`tile ${HEALTH[h].color} text-left`} aria-label={`Open details for ${e.name}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`pill ${HEALTH[h].color}`}>{HEALTH[h].label}</span>
        {urgencyOf(e) === "high" && <span className="tag urg">Urgent</span>}
        {ch?.state === "new" && <span className="tag">New</span>}
        {ch?.state === "upd" && <span className="pill blue">Updated</span>}
        <PersonStack names={ownerNames(e.owner)} />
      </div>
      <h3 className="text-xl font-extrabold">{e.name}</h3>
      <p className="text-ink font-medium leading-snug">{headlineOf(e)}</p>
      {(e.done || e.stuck) && (
        <dl className="grid gap-2 text-sm">
          {e.done && (
            <div className="grid grid-cols-[54px_1fr] gap-2.5">
              <dt className="text-[11px] font-bold uppercase text-ink3 pt-0.5">Done</dt>
              <dd className="line-clamp-2">{e.done}</dd>
            </div>
          )}
          {e.stuck && (
            <div className="grid grid-cols-[54px_1fr] gap-2.5">
              <dt className="text-[11px] font-bold uppercase text-warning-dark pt-0.5">Stuck</dt>
              <dd className="line-clamp-2">{e.stuck}</dd>
            </div>
          )}
        </dl>
      )}
      {note && (
        <div className="bg-accent-light text-accent-dark rounded-xl px-3 py-2 text-sm line-clamp-3">
          <b className="mr-1">Team update:</b>
          {note}
        </div>
      )}
      <div className="mt-auto pt-2 border-t border-sand4 flex gap-3.5 text-sm font-semibold text-ink3 items-center">
        {openAudit > 0 && (
          <span className="pill red">
            {openAudit} email{openAudit === 1 ? "" : "s"} open
          </span>
        )}
        <span>
          {mc} meeting{mc === 1 ? "" : "s"}
        </span>
        <span className="ml-auto text-accent-dark">Open →</span>
      </div>
    </button>
  );
}

export default function CommandCentre({
  data,
  diff,
  edit,
  onOpenEntry,
  goTab,
}: {
  data: BriefingData;
  diff: Diff;
  edit: boolean;
  onOpenEntry: (id: string, visible: string[]) => void;
  goTab: (tab: string, focusId?: string) => void;
}) {
  const { meeting, entries, audit, waiting, recordLoaded } = data;
  const [status, setStatus] = useState<StatusFilter>("all");
  const [owner, setOwner] = useState("All");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<Health, number> = { noresponse: 0, stuck: 0, decision: 0, moving: 0, quiet: 0 };
    entries.forEach((e) => c[healthOf(e)]++);
    return c;
  }, [entries]);
  const noReply = audit.filter((a) => a.status === "noreply");
  const names = [...new Set(entries.flatMap((e) => ownerNames(e.owner)))];
  const ownerSel = owner !== "All" && !names.includes(owner) ? "All" : owner;
  const q = norm(search);
  const matches = (e: BEntry) =>
    (status === "all" || healthOf(e) === status) &&
    (ownerSel === "All" || ownerNames(e.owner).includes(ownerSel)) &&
    (!q ||
      norm([e.name, e.owner, e.headline, e.brief, e.done, e.stuck, e.slack, e.next, e.meetings, e.emails, e.teamNote].join(" ")).includes(q));
  const clients = entries.filter((e) => e.kind === "client" && matches(e)).sort(byEntryRank);
  const relationships = entries.filter((e) => e.kind === "relationship" && matches(e)).sort(byEntryRank);
  const visible = [...clients, ...relationships].map((e) => e.id);
  const openAuditFor = (id: string) =>
    audit.filter((a) => a.entryId === id && (a.status === "noreply" || a.status === "late")).length;
  const needs = entries.filter((e) => healthOf(e) === "decision").sort(byOrder);
  const topNoReply = [...noReply].sort((a, b) => (Number(b.ageDays) || 0) - (Number(a.ageDays) || 0)).slice(0, 5);
  const byOwner = [...new Set(audit.map((a) => a.ownerKey).filter(Boolean) as string[])]
    .map((k) => [k, audit.filter((a) => a.ownerKey === k && (a.status === "noreply" || a.status === "late")).length] as const)
    .filter(([, n]) => n)
    .sort((a, b) => b[1] - a[1]);

  if (!recordLoaded)
    return (
      <>
        <SkeletonKpis count={6} />
        <SkeletonCards count={6} />
      </>
    );
  if (!meeting) return <Empty title="No record yet.">The next one is added on Wednesday and Friday.</Empty>;

  const kpi = (cls: string, n: number, label: string, st?: StatusFilter, tab?: string) => {
    const pressed = st && status === st;
    const inner = (
      <>
        <span className="kpi-value">{n}</span>
        <span className="kpi-label">{label}</span>
      </>
    );
    if (!st && !tab) return <div className={`kpi ${cls}`}>{inner}</div>;
    return (
      <button
        type="button"
        aria-pressed={!!pressed}
        onClick={() => (tab ? goTab(tab) : setStatus(pressed ? "all" : st!))}
        className={`kpi ${cls} ${pressed ? "outline outline-2 outline-ink outline-offset-2" : ""}`}
      >
        {inner}
      </button>
    );
  };
  const section = (key: "client" | "relationship", title: string, list: BEntry[]) => {
    const open = !collapsed.has(key);
    const breakdown = HEALTH_ORDER.map((h) => [h, list.filter((e) => healthOf(e) === h).length] as const).filter(([, n]) => n);
    return (
      <section className="mb-5 rounded-2xl border border-sand4 bg-sand shadow-card overflow-hidden">
        <h2>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`sec-${key}`}
            onClick={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
            className="w-full flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 text-left hover:bg-soft transition-colors"
          >
            <span className="text-2xl font-extrabold text-ink">{title}</span>
            <span className="count-pill">{list.length}</span>
            <span className="flex flex-wrap gap-1.5 font-sans">
              {breakdown.map(([h, n]) => (
                <span key={h} className={`pill ${HEALTH[h].color}`}>
                  {n} {HEALTH[h].label}
                </span>
              ))}
            </span>
            <FiChevronDown aria-hidden className={`ml-auto w-6 h-6 text-ink3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </h2>
        {open && (
          <div id={`sec-${key}`} className="border-t border-sand4 bg-sand2 p-4">
            {list.length ? (
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(310px, 100%), 1fr))" }}>
                {list.map((e) => (
                  <Tile key={e.id} e={e} diff={diff} openAudit={openAuditFor(e.id)} onOpen={() => onOpenEntry(e.id, visible)} />
                ))}
              </div>
            ) : (
              <p className="text-ink3 px-1 py-2">Nothing matches the filters.</p>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <div className="kpi-grid">
        {kpi("navy", entries.length, "Clients and relationships")}
        {kpi("green", counts.moving, "Moving", "moving")}
        {kpi("amber", counts.stuck, "Stuck or not moving", "stuck")}
        {kpi("red", counts.noresponse, "Not responded", "noresponse")}
        {kpi("blue", counts.decision, "Need Tony", "decision")}
        {audit.length > 0 && kpi("red", noReply.length, "Client emails with no real reply", undefined, "audit")}
      </div>

      <div className="grid gap-5 lg:grid-cols-2 items-start mb-8">
        <section className="panel">
          <h2 className="panel-title">
            Needs Tony&apos;s decision <span className="count-pill blue">{needs.length}</span>
          </h2>
          {needs.length ? (
            needs.slice(0, 6).map((e) => (
              <button key={e.id} type="button" className="row-btn" onClick={() => onOpenEntry(e.id, visible)}>
                <span className="t">{e.name}</span>
                <span className="pill blue self-start">{e.kind === "client" ? "Client" : "Relationship"}</span>
                <span className="s">{e.next || headlineOf(e)}</span>
              </button>
            ))
          ) : (
            <p className="text-sm text-ink3">Nothing flagged for Tony on this record.</p>
          )}
          {waiting.length > 0 && (
            <button type="button" className="btn-secondary justify-self-start" onClick={() => goTab("decisions")}>
              {waiting.length} item{waiting.length === 1 ? "" : "s"} waiting on Tony, see Decisions
            </button>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">
            Not responded: email audit <span className="count-pill red">{noReply.length}</span>
          </h2>
          {audit.length ? (
            <>
              {topNoReply.map((a) => (
                <button key={a.id} type="button" className="row-btn" onClick={() => goTab("audit", a.id)}>
                  <span className="t">{a.party}</span>
                  {ageText(a) && <span className="age">{ageText(a)}</span>}
                  <span className="s">
                    {a.owner} · {a.subject}
                  </span>
                </button>
              ))}
              {byOwner.length > 0 && (
                <>
                  <Label className="mt-1">Open items by owner (no reply or late)</Label>
                  <div className="flex flex-wrap gap-2">
                    {byOwner.map(([k, n]) => (
                      <span key={k} className="inline-flex items-center gap-2 text-sm font-semibold bg-sand3 rounded-full pl-1 pr-1 py-1 text-ink">
                        <PersonDot name={k} />
                        {k}
                        <b className="inline-grid place-items-center min-w-6 h-6 px-1.5 rounded-full bg-danger text-white text-xs">{n}</b>
                      </span>
                    ))}
                  </div>
                </>
              )}
              <button type="button" className="btn-secondary justify-self-start" onClick={() => goTab("audit")}>
                Open the full email audit ({audit.length})
              </button>
            </>
          ) : (
            <p className="text-sm text-ink3">The email audit for this record has not been loaded yet.</p>
          )}
        </section>
      </div>

      {/* Filters */}
      <section className="flex flex-wrap items-end gap-3 mb-8" aria-label="Filter clients and relationships">
        <label className="grid gap-1.5 flex-[1_1_320px] min-w-0">
          <Label>Search</Label>
          <span className="relative">
            <FiSearch aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink4" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Clients, relationships, owners or notes"
              className="field-input !pl-10 h-11 shadow-card"
            />
          </span>
        </label>
        <label className="grid gap-1.5 flex-[0_1_220px] min-w-[170px]">
          <Label>Status</Label>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="field-input h-11 !py-0 shadow-card">
            <option value="all">All statuses ({entries.length})</option>
            {HEALTH_ORDER.map((h) => (
              <option key={h} value={h}>
                {HEALTH[h].label} ({counts[h]})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 flex-[0_1_200px] min-w-[150px]">
          <Label>Owner</Label>
          <select value={ownerSel} onChange={(e) => setOwner(e.target.value)} className="field-input h-11 !py-0 shadow-card">
            <option value="All">Everyone</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {(status !== "all" || ownerSel !== "All" || search) && (
          <button
            type="button"
            className="btn-ghost h-11"
            onClick={() => {
              setStatus("all");
              setOwner("All");
              setSearch("");
            }}
          >
            Clear filters
          </button>
        )}
      </section>

      {entries.length ? (
        <>
          {section("client", "Clients", clients)}
          {section("relationship", "Relationships", relationships)}
        </>
      ) : (
        <Empty title="This record has no entries yet." />
      )}

      <details className="card px-5 py-4">
        <summary className="cursor-pointer font-bold text-ink">About this record: sources and limits</summary>
        <div className="mt-3 grid gap-3">
          {edit ? (
            <EditField rows={6} value={meeting.notes} onSave={(v) => data.update("meetings", meeting.id, { notes: v })} />
          ) : (
            <p className="text-ink3 max-w-[75ch]">{meeting.notes || "No notes for this record."}</p>
          )}
          <SourceLinks links={meeting.sourceLinks} />
        </div>
      </details>
    </>
  );
}
