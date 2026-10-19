"use client";

// Briefing Room - CEO Command Centre for the Monday/Thursday team meetings.
// Data: /api/briefing (lib/briefing.ts). Team edits; Tony views and answers
// questions; Edit data / Present are admin-only.
import { useCallback, useEffect, useMemo, useState } from "react";
import TabBar from "@/components/TabBar";
import Skeleton from "@/components/Skeleton";
import { useBriefing } from "@/hooks/useBriefing";
import { TEAM, computeDiff, fmtDay, fmtPT } from "@/lib/briefing-view";
import CommandCentre from "@/components/briefing/CommandCentre";
import EntrySheet from "@/components/briefing/EntrySheet";
import { AuditTab, ChangesTab, DecisionsTab, LogTab } from "@/components/briefing/RecordTabs";
import { HistoryTab, QuestionsTab } from "@/components/briefing/PeopleTabs";

const TAB_IDS = ["overview", "audit", "decisions", "log", "changes", "questions", "history"] as const;
type TabId = (typeof TAB_IDS)[number];
const isTab = (v: string | null): v is TabId => TAB_IDS.includes(v as TabId);

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export default function BriefingRoomPage() {
  const data = useBriefing();
  const { meeting, meetings, access, entries, audit, waiting, log, questions } = data;
  const isAdmin = !!access?.isAdmin;
  const [tab, setTab] = useState<TabId>("overview");
  const [edit, setEdit] = useState(false);
  const [present, setPresent] = useState(false);
  const [sheet, setSheet] = useState<{ id: string; visible: string[] } | null>(null);
  const [focusAudit, setFocusAudit] = useState<string | null>(null);
  const [who, setWhoState] = useState("Josh");
  const now = useNow(60_000);

  // Tab from ?tab= on load
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (isTab(t)) setTab(t);
  }, []);
  const goTab = useCallback((t: string, focusId?: string) => {
    if (!isTab(t)) return;
    setTab(t);
    setFocusAudit(focusId ?? null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
    if (!focusId) window.scrollTo({ top: 0 });
  }, []);

  // "Asked by" / "Updated by" default: last choice, else the signed-in person
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("br.who");
    } catch {
      /* private mode */
    }
    const first = (access?.name ?? "").split(" ")[0];
    setWhoState(saved ?? (TEAM.includes(first) ? first : "Josh"));
  }, [access?.name]);
  const setWho = (n: string) => {
    setWhoState(n);
    try {
      localStorage.setItem("br.who", n);
    } catch {
      /* private mode */
    }
  };

  // Present mode shortcut: P (admins, not while typing or in the detail panel)
  useEffect(() => {
    if (!isAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || sheet || e.metaKey || e.ctrlKey) return;
      if (e.key === "p" || e.key === "P") {
        setPresent((p) => !p);
        setEdit(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isAdmin, sheet]);

  const diff = useMemo(
    () => computeDiff(data.prev, data.recordLoaded, entries, data.prevEntries, waiting, data.prevWaiting),
    [data.prev, data.recordLoaded, entries, data.prevEntries, waiting, data.prevWaiting],
  );

  const openEntry = useCallback((id: string, visible?: string[]) => setSheet({ id, visible: visible ?? [id] }), []);
  const step = useCallback(
    (dir: -1 | 1) =>
      setSheet((s) => {
        if (!s) return s;
        const i = s.visible.indexOf(s.id) + dir;
        return s.visible[i] ? { ...s, id: s.visible[i] } : s;
      }),
    [],
  );
  const closeSheet = useCallback(() => setSheet(null), []);
  const sheetEntry = sheet ? entries.find((e) => e.id === sheet.id) : undefined;

  const openHit = (mid: string, t: string, entryId?: string) => {
    data.setMid(mid);
    goTab(t);
    if (entryId) setSheet({ id: entryId, visible: [entryId] });
  };

  const qCount = meeting ? questions.filter((q) => q.meetingId === meeting.id).length : 0;
  const noReply = audit.filter((a) => a.status === "noreply").length;
  const changed = diff.state === "ok" ? diff.added.length + diff.updated.length : null;
  const tabs = [
    { id: "overview" as const, label: "Command Centre" },
    { id: "audit" as const, label: "Email audit", count: audit.length ? noReply : null, alert: true },
    { id: "decisions" as const, label: "Decisions", count: waiting.length },
    { id: "log" as const, label: "Meeting log", count: log.length },
    { id: "changes" as const, label: "What changed", count: changed },
    { id: "questions" as const, label: "Questions for Tony", count: qCount },
    { id: "history" as const, label: "History", count: meetings?.length ?? 0 },
  ];

  const due = meeting?.questionsDue ? new Date(meeting.questionsDue).getTime() : 0;
  const left = due - now;
  const countdown = !due
    ? null
    : left > 0
      ? (() => {
          const h = Math.floor(left / 36e5), d = Math.floor(h / 24);
          return { warn: true, text: `Questions close in ${d >= 1 ? `${d} d ${h % 24} h` : `${h} h ${Math.floor((left % 36e5) / 6e4)} min`}` };
        })()
      : { warn: false, text: "Questions closed" };

  return (
    <div className={present ? "text-[18px]" : ""}>
      {/* Header */}
      <section className="hero-band">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {!meetings ? (
              <>
                <Skeleton className="h-3 w-48 !bg-white/20" />
                <Skeleton className="h-9 w-80 mt-4 !bg-white/20" />
                <Skeleton className="h-3.5 w-96 max-w-full mt-4 !bg-white/20" />
              </>
            ) : !meeting ? (
              <>
                <div className="eyebrow">CEO Command Centre</div>
                <h1 className="mt-2">No meeting record yet</h1>
                <p className="hero-meta mt-3">The next record appears here on Wednesday and Friday.</p>
              </>
            ) : (
              <>
                <div className="eyebrow">CEO Command Centre · {meeting.kind || "Team meeting"} record</div>
                <h1 className="mt-2">
                  {meeting.title || fmtDay(meeting.date)}
                  <small className="text-[0.5em] font-semibold text-on-navy-dim ml-3 whitespace-nowrap">{fmtDay(meeting.date)}</small>
                </h1>
                <div className="hero-meta mt-3">
                  <span>
                    Covers <b>{fmtDay(meeting.periodStart)} to {fmtDay(meeting.periodEnd)}</b>
                  </span>
                  {meeting.dataThrough ? (
                    <span>Data through <b>{fmtPT(meeting.dataThrough)}</b></span>
                  ) : (
                    <span>Prepared <b>{fmtDay(meeting.preparedAt)}</b></span>
                  )}
                  {meeting.questionsDue && <span>Questions due <b>{fmtPT(meeting.questionsDue)}</b></span>}
                  {countdown && <span className={`hero-chip ${countdown.warn ? "warn" : ""}`}>{countdown.text}</span>}
                </div>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {meetings && meetings.length > 0 && (
              <select
                value={data.mid ?? ""}
                onChange={(e) => {
                  data.setMid(e.target.value);
                  setSheet(null);
                }}
                aria-label="Meeting record"
                className="hero-select"
              >
                {meetings.map((m) => (
                  <option key={m.id} value={m.id} className="text-ink">
                    {fmtDay(m.date)}: {m.title || "Team meeting"}
                  </option>
                ))}
              </select>
            )}
            {isAdmin && access?.canWrite && !present && (
              <button type="button" className={`hero-btn ${edit ? "on" : ""}`} onClick={() => setEdit((v) => !v)}>
                {edit ? "Done editing" : "Edit data"}
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                title="Shortcut: P"
                className={`hero-btn ${present ? "on" : ""}`}
                onClick={() => {
                  setPresent((p) => !p);
                  setEdit(false);
                }}
              >
                {present ? "Exit present" : "Present"}
              </button>
            )}
          </div>
        </div>
      </section>

      {data.error && <div className="alert alert-red">Could not load the Briefing Room: {data.error}</div>}

      <TabBar tabs={tabs} active={tab} onChange={(t) => goTab(t)} />
      <div className="pt-6">
        {tab === "overview" && <CommandCentre data={data} diff={diff} edit={edit} onOpenEntry={openEntry} goTab={goTab} />}
        {tab === "audit" && <AuditTab data={data} edit={edit} focusId={focusAudit} onOpenEntry={(id) => openEntry(id)} />}
        {tab === "decisions" && <DecisionsTab data={data} edit={edit} />}
        {tab === "log" && <LogTab data={data} edit={edit} />}
        {tab === "changes" && <ChangesTab data={data} diff={diff} />}
        {tab === "questions" && <QuestionsTab data={data} present={present} who={who} setWho={setWho} />}
        {tab === "history" && <HistoryTab data={data} openHit={openHit} />}
      </div>

      {sheetEntry && sheet && (
        <EntrySheet
          data={data}
          entry={sheetEntry}
          diff={diff}
          edit={edit}
          present={present}
          position={{ index: sheet.visible.indexOf(sheet.id), total: sheet.visible.length }}
          onStep={step}
          onClose={closeSheet}
          who={who}
          setWho={setWho}
        />
      )}
    </div>
  );
}
