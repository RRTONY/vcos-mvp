"use client";

import { useEffect, useState } from "react";
import {
  AUDIT,
  AUDIT_ORDER,
  ageText,
  byOrder,
  fmtDay,
  headlineOf,
  linksToText,
  parseLinks,
  safeUrl,
  type AuditStatus,
  type BAudit,
  type Diff,
} from "@/lib/briefing-view";
import type { Attendance, BriefingData } from "@/hooks/useBriefing";
import { SkeletonKpis, SkeletonRows } from "@/components/Skeleton";
import { ConfirmDelete, EditField, EditSelect, Empty, Label, PersonDot, SourceLinks } from "./parts";

const H2 = ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => (
  <div className="flex items-center gap-3 mt-2 mb-3.5">
    <h2 className="text-2xl font-extrabold">{children}</h2>
    {action && <span className="ml-auto">{action}</span>}
  </div>
);
const AddButton = ({ onClick, label = "Add row" }: { onClick: () => void; label?: string }) => (
  <button type="button" className="btn-secondary !py-1.5" onClick={onClick}>
    {label}
  </button>
);
const nextOrder = (rows: { order?: number }[]) => rows.reduce((m, r) => Math.max(m, r.order ?? 0), 0) + 1;

// ── Email audit ─────────────────────────────────────────────────────────────
export function AuditTab({
  data,
  edit,
  focusId,
  onOpenEntry,
}: {
  data: BriefingData;
  edit: boolean;
  focusId: string | null;
  onOpenEntry: (id: string) => void;
}) {
  const { audit: rows, meeting, entries, recordLoaded } = data;
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => document.getElementById(`audit-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    return () => clearTimeout(t);
  }, [focusId, recordLoaded]);

  if (!recordLoaded)
    return (
      <>
        <SkeletonKpis />
        <SkeletonRows rows={4} />
      </>
    );
  if (!meeting) return null;
  const by = (st: AuditStatus) => rows.filter((a) => a.status === st);
  const add = () =>
    data.add("audit", { meetingId: meeting.id, order: nextOrder(rows), party: "New item", subject: "", owner: "", ownerKey: "", status: "noreply", ageDays: 0, inbound: "", done: "", next: "", links: [] });
  const head = <H2 action={edit && <AddButton onClick={add} />}>Email response audit</H2>;
  if (!rows.length)
    return (
      <>
        {head}
        <Empty title="No audit loaded for this record.">
          It lists client, partner and prospect emails from the t@ and admin@ inboxes that still need an answer.
        </Empty>
      </>
    );

  const owners = [...new Set(rows.map((a) => a.ownerKey).filter(Boolean) as string[])]
    .map((k) => ({
      k,
      nr: rows.filter((a) => a.ownerKey === k && a.status === "noreply").length,
      late: rows.filter((a) => a.ownerKey === k && a.status === "late").length,
      rep: rows.filter((a) => a.ownerKey === k && a.status === "replied").length,
    }))
    .filter((x) => x.nr + x.late + x.rep)
    .sort((a, b) => b.nr + b.late - (a.nr + a.late));

  const card = (a: BAudit) => {
    const save = (f: keyof BAudit) => (v: string) => data.update("audit", a.id, { [f]: v });
    return (
      <article key={a.id} id={`audit-${a.id}`} className={`tile ${AUDIT[a.status].color} !gap-3 ${focusId === a.id ? "outline outline-2 outline-accent outline-offset-2" : ""}`}>
        {edit ? (
          <div className="grid gap-3">
            <EditField label="Who or what" value={a.party} onSave={save("party")} />
            <EditField label="Subject" value={a.subject} onSave={save("subject")} />
            <EditField label="Owner (as shown)" value={a.owner} onSave={save("owner")} />
            <EditField label="Owner key (one name for the count)" value={a.ownerKey} onSave={save("ownerKey")} />
            <EditSelect label="Status" value={a.status} options={AUDIT_ORDER.map((v) => ({ value: v, label: AUDIT[v].label }))} onSave={save("status")} />
            <EditField label="Days waiting" type="number" value={a.ageDays} onSave={(v) => data.update("audit", a.id, { ageDays: Number(v) || 0 })} />
            <EditField label="Who wrote and when" rows={2} value={a.inbound} onSave={save("inbound")} />
            <EditField label="What was done so far" rows={3} value={a.done} onSave={save("done")} />
            <EditField label="Next action" rows={2} value={a.next} onSave={save("next")} />
            <EditField label="Gmail links, one per line: Label | https://..." rows={3} value={linksToText(a.links)} onSave={(v) => data.update("audit", a.id, { links: parseLinks(v) })} />
            <div>
              <ConfirmDelete label="Delete row" onDelete={() => data.remove("audit", a.id)} />
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-3 items-start flex-wrap">
              <h3 className="text-xl font-extrabold flex-[1_1_260px]">
                {a.party}
                {a.subject && <span className="block text-sm text-ink3 font-medium mt-1 font-sans">{a.subject}</span>}
              </h3>
              {ageText(a) && <span className={`age ${a.status === "noreply" ? "" : "amber"}`}>{ageText(a)}</span>}
              <span className={`pill ${AUDIT[a.status].color}`}>{AUDIT[a.status].label}</span>
            </div>
            <div className="grid gap-x-6 gap-y-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {[
                ["Who wrote and when (PT)", a.inbound],
                ["Owner", a.owner],
                ["What was done so far", a.done],
                ["Next action", a.next],
              ]
                .filter(([, v]) => v)
                .map(([l, v]) => (
                  <div key={l} className="grid gap-1 content-start">
                    <Label>{l}</Label>
                    <p className="text-[15px] leading-relaxed">{v}</p>
                  </div>
                ))}
            </div>
            <div className="flex gap-2.5 flex-wrap items-center">
              <SourceLinks links={a.links} />
              {a.entryId && entries.some((x) => x.id === a.entryId) && (
                <button type="button" className="btn-secondary !py-1.5" onClick={() => onOpenEntry(a.entryId!)}>
                  Open client or relationship
                </button>
              )}
            </div>
          </>
        )}
      </article>
    );
  };
  const group = (st: AuditStatus, title: string) =>
    by(st).length > 0 && (
      <>
        <H2>
          {title} <span className="text-base text-ink3 font-bold ml-1">{by(st).length}</span>
        </H2>
        <div className="grid gap-3.5 mb-8">{[...by(st)].sort((a, b) => (Number(b.ageDays) || 0) - (Number(a.ageDays) || 0)).map(card)}</div>
      </>
    );

  return (
    <>
      {head}
      <p className="text-ink3 text-sm -mt-1.5 mb-5 max-w-[75ch]">
        Client, partner and prospect emails from the t@ and admin@ inboxes. Standard: Tony&apos;s Oct 12 rule, acknowledge the same business day and name an owner and a reply date.
      </p>
      <div className="kpi-grid">
        <div className="kpi red"><span className="kpi-value">{by("noreply").length}</span><span className="kpi-label">No real reply yet</span></div>
        <div className="kpi amber"><span className="kpi-value">{by("late").length}</span><span className="kpi-label">Late or acknowledged only</span></div>
        <div className="kpi blue"><span className="kpi-value">{by("replied").length}</span><span className="kpi-label">Replied since the audit</span></div>
        <div className="kpi green"><span className="kpi-value">{by("handled").length}</span><span className="kpi-label">Handled well</span></div>
      </div>
      {owners.length > 0 && (
        <>
          <H2>By owner</H2>
          <div className="card overflow-x-auto mb-8">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="bg-sand3 text-left text-xs uppercase text-ink3 tracking-wider">
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">No real reply</th>
                  <th className="px-4 py-3">Late or acknowledged</th>
                  <th className="px-4 py-3">Replied since</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((x) => (
                  <tr key={x.k} className="border-t border-sand4">
                    <td className="px-4 py-3 font-bold text-ink"><span className="inline-flex items-center gap-2"><PersonDot name={x.k} />{x.k}</span></td>
                    <td className="px-4 py-3 font-bold tabular-nums">{x.nr}</td>
                    <td className="px-4 py-3 font-bold tabular-nums">{x.late}</td>
                    <td className="px-4 py-3 font-bold tabular-nums">{x.rep}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {group("noreply", "No real reply yet")}
      {group("late", "Late, or answered with an acknowledgment only")}
      {group("replied", "Replied since the audit")}
      {group("handled", "Handled well, no action")}
      <details className="card px-5 py-4">
        <summary className="cursor-pointer font-bold text-ink">Scope and limits</summary>
        <div className="mt-3 grid gap-3">
          {edit ? (
            <EditField rows={6} value={meeting.auditNote} onSave={(v) => data.update("meetings", meeting.id, { auditNote: v })} />
          ) : (
            <p className="text-ink3 max-w-[75ch]">{meeting.auditNote || "No scope note."}</p>
          )}
          {meeting.auditSource && <SourceLinks links={[meeting.auditSource]} />}
        </div>
      </details>
    </>
  );
}

// ── Decisions ───────────────────────────────────────────────────────────────
export function DecisionsTab({ data, edit }: { data: BriefingData; edit: boolean }) {
  const { meeting, waiting, recordLoaded } = data;
  if (!recordLoaded) return <SkeletonRows rows={4} />;
  if (!meeting) return null;
  const rows = [...waiting].sort(byOrder);
  const conflicts = String(meeting.conflicts ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  return (
    <>
      <H2 action={edit && <AddButton onClick={() => data.add("waiting", { meetingId: meeting.id, order: nextOrder(rows), item: "", who: "", source: "" })} />}>
        Waiting on Tony
      </H2>
      {rows.length ? (
        <div className="grid gap-3.5 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {rows.map((r) =>
            edit ? (
              <div key={r.id} className="card !mb-0 p-4 grid gap-2">
                <EditField rows={2} value={r.item} placeholder="What Tony owes" onSave={(v) => data.update("waiting", r.id, { item: v })} />
                <EditField value={r.who} placeholder="Who is waiting" onSave={(v) => data.update("waiting", r.id, { who: v })} />
                <EditField value={r.source} placeholder="Source" onSave={(v) => data.update("waiting", r.id, { source: v })} />
                <div><ConfirmDelete onDelete={() => data.remove("waiting", r.id)} /></div>
              </div>
            ) : (
              <div key={r.id} className="card !mb-0 p-4 grid gap-2">
                <div className="font-bold text-ink text-[16.5px]">{r.item}</div>
                <div className="text-sm font-bold text-accent-dark">Waiting: {r.who}</div>
                <div className="text-sm text-ink3">{r.source}</div>
              </div>
            ),
          )}
        </div>
      ) : (
        <Empty title="Nothing listed.">Items Tony still owes the team appear here.</Empty>
      )}
      <H2>To confirm in the meeting</H2>
      {edit ? (
        <EditField rows={6} value={meeting.conflicts} placeholder="One item per line" onSave={(v) => data.update("meetings", meeting.id, { conflicts: v })} />
      ) : conflicts.length ? (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {conflicts.map((c, i) => (
            <div key={i} className="rounded-xl bg-warning-light p-4 font-semibold text-ink text-[16.5px]">{c}</div>
          ))}
        </div>
      ) : (
        <Empty title="Nothing to confirm.">Conflicting facts between sources are listed here.</Empty>
      )}
    </>
  );
}

// ── Meeting log (+ who joined, per Fireflies) ───────────────────────────────
function AttendanceCard({ data }: { data: BriefingData }) {
  const mid = data.mid;
  const [att, setAtt] = useState<{ mid: string; a: Attendance | null } | null>(null);
  useEffect(() => {
    if (!mid) return;
    let live = true;
    data.attendance(mid).then((a) => live && setAtt({ mid, a })).catch(() => live && setAtt({ mid, a: null }));
    return () => {
      live = false;
    };
  }, [mid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mid || !att || att.mid !== mid || !att.a) return null;
  const a = att.a;
  const chips = (names: string[], cls: string, none: string) =>
    names.length ? names.map((n) => <span key={n} className={`pill ${cls}`}>{n}</span>) : <span className="text-sm text-ink3">{none}</span>;
  return (
    <section className="panel mb-7">
      <h2 className="panel-title">
        Who joined the team meeting
        <span className="count-pill">{a.recordings.length ? `${a.joined.length} joined` : "no recording"}</span>
      </h2>
      {a.recordings.length ? (
        <>
          <SourceLinks links={a.recordings.map((r) => ({ label: `${r.title} · ${r.when}`, url: r.url }))} />
          <div>
            <Label>Joined (per Fireflies)</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">{chips(a.joined, "green", "Nobody matched")}</div>
          </div>
          <div>
            <Label>Not seen in the recording</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">{chips(a.notSeen, "red", "Everyone linked joined")}</div>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink3">No Fireflies recording with &quot;Team Meeting&quot; in the title on {fmtDay(mid)} yet.</p>
      )}
      {a.notLinked.length > 0 && (
        <p className="text-sm text-ink3">
          Not linked to Fireflies, so attendance is unknown: {a.notLinked.join(", ")}. Add their Fireflies email in Team &amp; Users → Team Members.
        </p>
      )}
    </section>
  );
}

export function LogTab({ data, edit }: { data: BriefingData; edit: boolean }) {
  const { meeting, log, recordLoaded } = data;
  if (!recordLoaded) return <SkeletonRows rows={6} />;
  if (!meeting) return null;
  const rows = [...log].sort(byOrder);
  const head = (
    <H2 action={edit && <AddButton onClick={() => data.add("log", { meetingId: meeting.id, order: nextOrder(rows), when: "", meeting: "", attendees: "", outcome: "" })} />}>
      Every recorded meeting in the period
    </H2>
  );
  if (!rows.length)
    return (
      <>
        <AttendanceCard data={data} />
        {head}
        <Empty title="No meetings logged." />
      </>
    );
  let lastDay = "";
  return (
    <>
      <AttendanceCard data={data} />
      {head}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="bg-sand3 text-left text-xs uppercase text-ink3 tracking-wider">
              <th className="px-4 py-3">Time (PT)</th>
              <th className="px-4 py-3">Meeting</th>
              <th className="px-4 py-3">Attendees</th>
              <th className="px-4 py-3">What came out of it</th>
              {edit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (edit) {
                const f = (k: "when" | "meeting" | "attendees" | "outcome" | "link", rowsN?: number, ph?: string) => (
                  <EditField rows={rowsN} value={r[k]} placeholder={ph} onSave={(v) => data.update("log", r.id, { [k]: k === "link" ? safeUrl(v) : v })} />
                );
                return (
                  <tr key={r.id} className="border-t border-sand4 align-top">
                    <td className="px-3 py-2">{f("when")}</td>
                    <td className="px-3 py-2 grid gap-1.5">{f("meeting")}{f("link", undefined, "Recording URL")}</td>
                    <td className="px-3 py-2">{f("attendees", 2)}</td>
                    <td className="px-3 py-2">{f("outcome", 2)}</td>
                    <td className="px-3 py-2"><ConfirmDelete onDelete={() => data.remove("log", r.id)} /></td>
                  </tr>
                );
              }
              const day = (r.when ?? "").split(",")[0];
              const sep = day !== lastDay;
              lastDay = day;
              return [
                sep && (
                  <tr key={`d-${r.id}`}>
                    <td colSpan={4} className="bg-accent-light text-accent-dark font-bold text-sm px-4 py-2 border-t border-sand4">{day}</td>
                  </tr>
                ),
                <tr key={r.id} className="border-t border-sand4 align-top">
                  <td className="px-4 py-3 whitespace-nowrap font-semibold text-accent-dark">{(r.when ?? "").split(",").slice(1).join(",").trim() || r.when}</td>
                  <td className="px-4 py-3 font-bold text-ink">
                    {r.meeting}
                    {safeUrl(r.link) && (
                      <div>
                        <a href={safeUrl(r.link)} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-dark underline font-semibold">Recording</a>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{r.attendees}</td>
                  <td className="px-4 py-3">{r.outcome}</td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── What changed ────────────────────────────────────────────────────────────
export function ChangesTab({ data, diff }: { data: BriefingData; diff: Diff }) {
  if (!data.recordLoaded || diff.state === "loading") return <SkeletonRows rows={4} />;
  if (!data.meeting) return null;
  if (diff.state === "first")
    return <Empty title="This is the first record.">Once a later record exists, this tab compares it with the one before.</Empty>;
  if (diff.state === "nobase")
    return (
      <Empty title="Nothing to compare yet.">
        The earlier record ({fmtDay(diff.prev.date)}) was kept as linked documents rather than structured data. Starting with the next record, this tab lists what is new, updated and dropped.
      </Empty>
    );
  const labels = { brief: "What happened", meetings: "Meetings", emails: "Emails" };
  const none = !diff.added.length && !diff.updated.length && !diff.dropped.length && !diff.waitingNew.length && !diff.waitingGone.length;
  const box = (k: string, children: React.ReactNode) => <div key={k} className="card !mb-3 p-4 grid gap-2">{children}</div>;
  return (
    <>
      <p className="text-sm text-ink3 mb-4">
        Compared with the {fmtDay(diff.prev.date)} record. {diff.same.length} entries are unchanged and not listed.
      </p>
      <div className="kpi-grid">
        <div className="kpi blue"><span className="kpi-value">{diff.added.length}</span><span className="kpi-label">New</span></div>
        <div className="kpi green"><span className="kpi-value">{diff.updated.length}</span><span className="kpi-label">Updated</span></div>
        <div className="kpi amber"><span className="kpi-value">{diff.dropped.length}</span><span className="kpi-label">Dropped</span></div>
        <div className="kpi red"><span className="kpi-value">{diff.waitingNew.length}</span><span className="kpi-label">New for Tony</span></div>
        <div className="kpi slate"><span className="kpi-value">{diff.waitingGone.length}</span><span className="kpi-label">Cleared for Tony</span></div>
      </div>
      {diff.updated.length > 0 && (
        <div className="mb-7">
          <H2>Updated</H2>
          {diff.updated.map((e) => {
            const c = diff.by[e.id];
            if (c.state !== "upd") return null;
            return box(e.id, (
              <>
                <h3 className="text-lg font-extrabold">{e.name}</h3>
                {c.fields.map((f) => (
                  <div key={f}>
                    <Label>{labels[f]} now</Label>
                    <p>{e[f]}</p>
                    <Label className="mt-1.5">Before</Label>
                    <p className="text-ink3 line-through text-sm">{c.prev[f]}</p>
                  </div>
                ))}
              </>
            ));
          })}
        </div>
      )}
      {diff.added.length > 0 && (
        <div className="mb-7">
          <H2>New</H2>
          {diff.added.map((e) => box(e.id, (<><h3 className="text-lg font-extrabold">{e.name}</h3><p>{headlineOf(e)}</p></>)))}
        </div>
      )}
      {diff.dropped.length > 0 && (
        <div className="mb-7">
          <H2>In the last record, not in this one</H2>
          {diff.dropped.map((e) => box(e.id, <h3 className="text-lg font-extrabold">{e.name}</h3>))}
        </div>
      )}
      {(diff.waitingNew.length > 0 || diff.waitingGone.length > 0) && (
        <div className="mb-7">
          <H2>Waiting on Tony</H2>
          {diff.waitingNew.map((w) => box(w.id, (<><span className="tag w-max">New</span><p>{w.item} <span className="text-ink3 text-sm">({w.who})</span></p></>)))}
          {diff.waitingGone.map((w) => box(w.id, (<><span className="pill blue w-max">Cleared</span><p className="text-ink3 line-through">{w.item}</p></>)))}
        </div>
      )}
      {none && <Empty title="No changes.">Every entry matches the earlier record.</Empty>}
    </>
  );
}
