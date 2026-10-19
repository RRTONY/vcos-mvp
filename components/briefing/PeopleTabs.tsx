"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TEAM,
  fmtDay,
  fmtPT,
  norm,
  type BAudit,
  type BEntry,
  type BLog,
  type BQuestion,
  type BWaiting,
} from "@/lib/briefing-view";
import { FiChevronDown } from "react-icons/fi";
import type { BriefingData } from "@/hooks/useBriefing";
import { SkeletonRows } from "@/components/Skeleton";
import { ConfirmDelete, EditField, Empty, Label, PersonDot, SourceLinks } from "./parts";

// ── Questions for Tony ──────────────────────────────────────────────────────
export function QuestionsTab({
  data,
  present,
  who,
  setWho,
}: {
  data: BriefingData;
  present: boolean;
  who: string;
  setWho: (n: string) => void;
}) {
  const { meeting, questions, entries, access } = data;
  const canWrite = !!access?.canWrite;
  const canAnswer = canWrite || !!access?.canAnswer;
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // Accordion: null = default (first person + anyone with open questions)
  const [openSet, setOpenSet] = useState<Set<string> | null>(null);
  useEffect(() => setOpenSet(null), [meeting?.id]);
  const mine = meeting ? questions.filter((q) => q.meetingId === meeting.id) : [];
  const late = !!(meeting?.questionsDue && Date.now() > new Date(meeting.questionsDue).getTime());

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    if (!meeting) return;
    if (!text.trim()) return setMsg("Type a question first.");
    setBusy(true);
    try {
      await data.add("questions", { meetingId: meeting.id, who, topic: topic.trim(), text: text.trim(), answer: "", status: "open", createdAt: Date.now(), late });
      setText("");
      setMsg("Added. You can add another.");
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  }

  const groups = [...TEAM, "Other"]
    .map((n) => ({ n, qs: mine.filter((q) => (q.who || "Other") === n || (n === "Other" && !TEAM.includes(q.who ?? ""))).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)) }))
    .filter((g) => g.qs.length);

  const defaultOpen = (n: string, i: number) =>
    i === 0 || !!groups.find((g) => g.n === n)?.qs.some((q) => q.status !== "answered");
  const isOpen = (n: string, i: number) => (openSet ? openSet.has(n) : defaultOpen(n, i));
  const toggle = (n: string) =>
    setOpenSet((prev) => {
      const next = new Set(prev ?? groups.filter((g, i) => defaultOpen(g.n, i)).map((g) => g.n));
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const card = (q: BQuestion) => (
    <div key={q.id} className="card !mb-2.5 p-4 grid gap-2.5">
      <div className="flex gap-2 items-center flex-wrap">
        {q.topic && <span className="text-sm font-bold text-accent-dark">{q.topic}</span>}
        <span className={`pill ${q.status === "answered" ? "green" : "amber"}`}>{q.status === "answered" ? "Answered" : "Open"}</span>
        {q.late && <span className="pill red">Late</span>}
      </div>
      <p className="text-[16.5px] text-ink">{q.text}</p>
      {present ? (
        q.answer && (
          <div className="bg-accent-light rounded-xl px-3.5 py-3">
            <Label className="!text-accent-dark">Tony</Label>
            <p className="mt-1">{q.answer}</p>
          </div>
        )
      ) : (
        <>
          <div className="grid gap-1">
            <Label>Tony&apos;s answer</Label>
            <EditField
              rows={2}
              value={q.answer}
              readOnly={!canAnswer}
              placeholder={canAnswer ? "Type the answer here" : ""}
              onSave={(v) => data.update("questions", q.id, { answer: v, status: v.trim() ? "answered" : "open" })}
            />
          </div>
          {canWrite && (
            <div>
              <ConfirmDelete onDelete={() => data.remove("questions", q.id)} />
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className={`grid gap-7 items-start ${present ? "" : "lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]"}`}>
      {!present && (
        <form onSubmit={add} className="panel lg:sticky lg:top-32 !shadow-card-md">
          <Label>Add a question for Tony</Label>
          <label className="grid gap-1 text-sm font-semibold text-ink3">
            Asked by
            <select value={who} onChange={(e) => setWho(e.target.value)} disabled={!canWrite || !meeting} className="field-input !py-2">
              {[...TEAM, "Other"].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink3">
            Client or topic
            <input list="br-topics" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Sequencing" disabled={!canWrite || !meeting} className="field-input !py-2" />
            <datalist id="br-topics">
              {entries.map((e) => <option key={e.id} value={e.name} />)}
            </datalist>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink3">
            Question
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="One question per entry. Add as many as you need." disabled={!canWrite || !meeting} className="field-input" />
          </label>
          <button type="submit" disabled={busy || !canWrite || !meeting} className="btn-primary">
            {busy ? "Adding" : "Add question"}
          </button>
          <p className="text-sm text-ink3" aria-live="polite">
            {!canWrite ? (canAnswer ? "You have view-only access. You can answer the questions on the right." : "You have view-only access.") : msg}
          </p>
          <p className="text-sm text-ink3">A notice goes to #rr-internal when questions open and when they close.</p>
        </form>
      )}
      <div>
        {!data.meetings ? (
          <SkeletonRows rows={4} />
        ) : !groups.length ? (
          <Empty title="No questions yet.">
            Everyone can add one or several. Tony answers them here before the meeting
            {meeting?.questionsDue ? `; the list closes ${fmtPT(meeting.questionsDue)}` : ""}.
          </Empty>
        ) : (
          <>
            {groups.map((g, i) => {
              const open = isOpen(g.n, i);
              const answered = g.qs.filter((q) => q.status === "answered").length;
              const pending = g.qs.length - answered;
              return (
                <section key={g.n} className="mb-3 rounded-2xl border border-sand4 bg-sand shadow-card overflow-hidden">
                  <h3>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`q-${g.n}`}
                      onClick={() => toggle(g.n)}
                      className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-soft transition-colors"
                    >
                      {TEAM.includes(g.n) ? <PersonDot name={g.n} /> : <span className="w-[26px]" />}
                      <span className="text-lg font-extrabold text-ink">{g.n}</span>
                      <span className="text-sm text-ink3 font-sans font-semibold">
                        {g.qs.length} question{g.qs.length > 1 ? "s" : ""}
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        {answered > 0 && <span className="pill green">{answered} answered</span>}
                        {pending > 0 && <span className="pill amber">{pending} open</span>}
                        <FiChevronDown
                          aria-hidden
                          className={`w-5 h-5 text-ink3 transition-transform ${open ? "rotate-180" : ""}`}
                        />
                      </span>
                    </button>
                  </h3>
                  {open && (
                    <div id={`q-${g.n}`} className="border-t border-sand4 bg-soft px-3 sm:px-4 pt-3 pb-1">
                      {g.qs.map(card)}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── History + search across every record ────────────────────────────────────
interface Hit {
  mid: string;
  kind: string;
  tab: string;
  entryId?: string;
  title: string;
  text: string;
}
function Snippet({ text, terms }: { text: string; terms: string[] }) {
  const t = String(text ?? "");
  const lower = t.toLowerCase();
  const term = terms.find((x) => lower.includes(x)) ?? "";
  const i = term ? lower.indexOf(term) : -1;
  if (i < 0) return <>{t.slice(0, 150)}{t.length > 150 ? "…" : ""}</>;
  const a = Math.max(0, i - 60), b = Math.min(t.length, i + term.length + 110);
  return (
    <>
      {a > 0 && "…"}
      {t.slice(a, i)}
      <mark className="bg-warning-light text-ink rounded px-0.5">{t.slice(i, i + term.length)}</mark>
      {t.slice(i + term.length, b)}
      {b < t.length && "…"}
    </>
  );
}

export function HistoryTab({
  data,
  openHit,
}: {
  data: BriefingData;
  openHit: (mid: string, tab: string, entryId?: string) => void;
}) {
  const { meetings, questions, mid } = data;
  const [q, setQ] = useState("");
  const [all, setAll] = useState<{ entries: BEntry[]; log: BLog[]; waiting: BWaiting[]; audit: BAudit[] } | null>(null);
  const searching = norm(q).length >= 2;

  useEffect(() => {
    if (!searching || all) return;
    Promise.all([data.listAll<BEntry>("entries"), data.listAll<BLog>("log"), data.listAll<BWaiting>("waiting"), data.listAll<BAudit>("audit")])
      .then(([entries, log, waiting, audit]) => setAll({ entries, log, waiting, audit }))
      .catch(() => setAll({ entries: [], log: [], waiting: [], audit: [] }));
  }, [searching, all, data]);

  const hits = useMemo<Hit[]>(() => {
    if (!searching || !all) return [];
    const terms = norm(q).split(" ").filter(Boolean);
    const test = (txt: string) => terms.every((t) => norm(txt).includes(t));
    const out: Hit[] = [];
    all.entries.forEach((e) => {
      if (test([e.name, e.owner, e.headline, e.done, e.stuck, e.slack, e.next, e.brief, e.meetings, e.emails, e.urgentReason, e.teamNote].join(" ")))
        out.push({ mid: e.meetingId, kind: e.kind === "client" ? "Client" : "Relationship", tab: "overview", entryId: e.id, title: e.name, text: [e.teamNote, e.stuck, e.done, e.brief].find((x) => x && terms.some((t) => norm(x).includes(t))) ?? e.brief ?? "" });
    });
    all.audit.forEach((a) => test([a.party, a.subject, a.owner, a.inbound, a.done, a.next].join(" ")) && out.push({ mid: a.meetingId, kind: "Email audit", tab: "audit", title: a.party, text: `${a.subject ?? ""} · ${a.done ?? ""}` }));
    all.log.forEach((r) => test([r.when, r.meeting, r.attendees, r.outcome].join(" ")) && out.push({ mid: r.meetingId, kind: "Meeting", tab: "log", title: r.meeting ?? "", text: `${r.when ?? ""} · ${r.attendees ?? ""} · ${r.outcome ?? ""}` }));
    questions.forEach((x) => test([x.who, x.topic, x.text, x.answer].join(" ")) && out.push({ mid: x.meetingId, kind: "Question", tab: "questions", title: `${x.who ?? ""}${x.topic ? ` on ${x.topic}` : ""}`, text: x.text + (x.answer ? ` → ${x.answer}` : "") }));
    all.waiting.forEach((w) => test([w.item, w.who, w.source].join(" ")) && out.push({ mid: w.meetingId, kind: "For Tony", tab: "decisions", title: w.item ?? "", text: `${w.who ?? ""} · ${w.source ?? ""}` }));
    const dateOf = (m: string) => meetings?.find((x) => x.id === m)?.date ?? m;
    return out.sort((a, b) => dateOf(b.mid).localeCompare(dateOf(a.mid)));
  }, [searching, all, q, questions, meetings]);

  if (!meetings) return <SkeletonRows rows={3} />;
  if (!meetings.length) return <Empty title="No history yet.">Each Monday and Thursday record stays here after the meeting.</Empty>;
  const terms = norm(q).split(" ").filter(Boolean);
  const records = new Set(hits.map((h) => h.mid)).size;

  return (
    <>
      <div className="grid gap-2 mb-6">
        <Label>Search every past record</Label>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client, person, topic, email subject" aria-label="Search history" className="field-input !py-3 !text-[16.5px] shadow-card" />
      </div>
      {searching &&
        (!all ? (
          <SkeletonRows rows={3} className="mb-6" />
        ) : hits.length ? (
          <div className="mb-6">
            <p className="text-sm text-ink3 mb-2.5">
              {hits.length} match{hits.length === 1 ? "" : "es"} across {records} record{records === 1 ? "" : "s"}, newest first.
            </p>
            {hits.slice(0, 80).map((h, i) => (
              <div key={i} className="card !mb-2 px-4 py-3.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-[110px_minmax(0,1fr)_auto] items-start">
                <div className="text-xs font-bold uppercase text-ink3 tracking-wide">
                  {fmtDay(meetings.find((m) => m.id === h.mid)?.date)}
                  <br />
                  {h.kind}
                </div>
                <div>
                  <div className="font-bold text-ink">{h.title}</div>
                  <div className="text-sm text-ink3 mt-0.5"><Snippet text={h.text} terms={terms} /></div>
                </div>
                <button type="button" className="btn-secondary !py-1.5" onClick={() => openHit(h.mid, h.tab, h.entryId)}>Open</button>
              </div>
            ))}
            {hits.length > 80 && <p className="text-sm text-ink3">Showing the first 80. Narrow the search.</p>}
          </div>
        ) : (
          <Empty title="No matches.">Try fewer or different words.</Empty>
        ))}
      <h2 className="text-2xl font-extrabold mt-5 mb-3.5">All records</h2>
      {meetings.map((m) => {
        const qs = questions.filter((x) => x.meetingId === m.id);
        return (
          <div key={m.id} className="card !mb-2.5 p-4 sm:p-5 grid gap-x-5 gap-y-1.5 sm:grid-cols-[130px_minmax(0,1fr)_auto] items-start">
            <div className="font-display text-lg font-extrabold text-ink">{fmtDay(m.date)}</div>
            <div>
              <h3 className="text-lg font-extrabold">
                {m.title || "Team meeting"} {m.id === mid && <span className="tag align-middle ml-1">Open now</span>}
              </h3>
              <p className="text-sm text-ink3 mt-1">
                Covered {fmtDay(m.periodStart)} to {fmtDay(m.periodEnd)} · prepared {fmtDay(m.preparedAt)} ·{" "}
                {m.entryCount != null ? `${m.entryCount} entries · ` : ""}
                {qs.length} question{qs.length === 1 ? "" : "s"}
                {qs.length ? ` (${qs.filter((x) => x.status === "answered").length} answered)` : ""}
              </p>
              {m.summary && <p className="text-sm text-ink3 mt-1">{m.summary}</p>}
              <div className="mt-2"><SourceLinks links={m.sourceLinks} /></div>
            </div>
            <button type="button" className="btn-secondary !py-1.5" onClick={() => openHit(m.id, "overview")}>Open record</button>
          </div>
        );
      })}
    </>
  );
}
