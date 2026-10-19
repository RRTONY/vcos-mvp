"use client";

import { useEffect, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import {
  AUDIT,
  AUDIT_ORDER,
  HEALTH,
  HEALTH_ORDER,
  PEOPLE,
  ageText,
  fmtPT,
  headlineOf,
  healthOf,
  isNone,
  linksToText,
  meetingItems,
  ownerNames,
  parseLinks,
  urgencyOf,
  type BEntry,
  type Diff,
} from "@/lib/briefing-view";
import type { BriefingData } from "@/hooks/useBriefing";
import { useToast } from "@/components/Toast";
import { ConfirmDelete, EditField, EditSelect, Label, PersonDot, SourceLinks } from "./parts";

export default function EntrySheet({
  data,
  entry,
  diff,
  edit,
  present,
  position,
  onStep,
  onClose,
  who,
  setWho,
}: {
  data: BriefingData;
  entry: BEntry;
  diff: Diff;
  edit: boolean;
  present: boolean;
  position: { index: number; total: number };
  onStep: (dir: -1 | 1) => void;
  onClose: () => void;
  who: string;
  setWho: (n: string) => void;
}) {
  const e = entry;
  const h = healthOf(e);
  const ch = diff.state === "ok" ? diff.by[e.id] : undefined;
  const canNote = !!data.access?.canWrite && !present;
  const emails = data.audit
    .filter((a) => a.entryId === e.id)
    .sort((a, b) => AUDIT_ORDER.indexOf(a.status) - AUDIT_ORDER.indexOf(b.status));
  const [note, setNote] = useState(e.teamNote ?? "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const closeRef = useRef<HTMLButtonElement>(null);
  const save = (field: keyof BEntry) => (v: string) => data.update("entries", e.id, { [field]: v });

  useEffect(() => setNote(e.teamNote ?? ""), [e.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (ev.key === "ArrowLeft") onStep(-1);
      if (ev.key === "ArrowRight") onStep(1);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, onStep]);

  async function saveNote() {
    if (note.trim() === String(e.teamNote ?? "")) return;
    setSaving(true);
    try {
      await data.update("entries", e.id, { teamNote: note.trim(), teamNoteBy: who, teamNoteAt: Date.now() });
      toast("Saved");
    } catch (err) {
      toast((err as Error).message);
    }
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(12,20,40,.7)] flex items-start justify-center overflow-y-auto p-3 sm:p-5"
      onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="sheet-title" className="bg-sand rounded-[22px] w-full max-w-[800px] my-auto overflow-hidden shadow-card-lg">
        <div className="hero-band !m-0 !rounded-none !shadow-none">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`pill ${HEALTH[h].color}`}>{HEALTH[h].label}</span>
            {urgencyOf(e) === "high" && <span className="tag urg">Urgent</span>}
            {ch?.state === "new" && <span className="tag !bg-white !text-ink">New</span>}
            {ch?.state === "upd" && <span className="pill blue">Updated</span>}
            <span className="flex-1" />
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="hero-btn !rounded-full !p-2.5">
              <FiX size={18} />
            </button>
          </div>
          <h2 id="sheet-title" className="!text-white text-3xl font-extrabold mt-3">{e.name}</h2>
          <div className="flex items-center gap-2 mt-2 text-sm font-semibold text-on-navy-dim flex-wrap">
            {ownerNames(e.owner).map((n) => (
              <PersonDot key={n} name={n} />
            ))}
            <span>{e.owner}</span>
          </div>
        </div>

        <div className="px-5 sm:px-7 pt-2 pb-7 grid gap-6">
          {edit ? (
            <div className="grid gap-3 mt-4">
              <EditField label="Name" value={e.name} onSave={save("name")} />
              <EditField label="Owner" value={e.owner} onSave={save("owner")} />
              <EditSelect label="Status" value={h} options={HEALTH_ORDER.map((v) => ({ value: v, label: HEALTH[v].label }))} onSave={save("health")} />
              <EditSelect
                label="Priority"
                value={urgencyOf(e)}
                options={[
                  { value: "normal", label: "Normal" },
                  { value: "watch", label: "Watch" },
                  { value: "high", label: "Urgent" },
                ]}
                onSave={save("urgency")}
              />
              <EditField label="Latest status, one short line" value={e.headline} onSave={save("headline")} />
              <EditField label="Done so far" rows={2} value={e.done} onSave={save("done")} />
              <EditField label="Stuck or not moving" rows={2} value={e.stuck} onSave={save("stuck")} />
              <EditField label="Next step" rows={2} value={e.next} onSave={save("next")} />
              <EditField label="What Slack says" rows={3} value={e.slack} onSave={save("slack")} />
              <EditField label="Why flagged (one line)" value={e.urgentReason} onSave={save("urgentReason")} />
              <EditField label="What happened, two sentences" rows={3} value={e.brief} onSave={save("brief")} />
              <EditField label='Meetings (separate with " · ")' rows={4} value={e.meetings} onSave={save("meetings")} />
              <EditField label="Email threads" rows={4} value={e.emails} onSave={save("emails")} />
              <EditField
                label="Source links, one per line: Label | https://..."
                rows={3}
                value={linksToText(e.sources)}
                onSave={(v) => data.update("entries", e.id, { sources: parseLinks(v) })}
              />
              <div>
                <ConfirmDelete
                  label="Delete this entry"
                  onDelete={() => {
                    data.remove("entries", e.id);
                    onClose();
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="font-display text-[22px] font-bold leading-snug mt-4 text-ink">{headlineOf(e)}</p>
              {(e.done || e.stuck || e.next) && (
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  {e.done && (
                    <div className="rounded-xl p-4 bg-success-light grid gap-1.5 content-start">
                      <Label className="!text-success-dark">Done so far</Label>
                      <p>{e.done}</p>
                    </div>
                  )}
                  {e.stuck && (
                    <div className="rounded-xl p-4 bg-warning-light grid gap-1.5 content-start">
                      <Label className="!text-warning-dark">Stuck or not moving</Label>
                      <p>{e.stuck}</p>
                    </div>
                  )}
                  {e.next && (
                    <div className="rounded-xl p-4 bg-accent-light grid gap-1.5 content-start">
                      <Label className="!text-accent-dark">Next step</Label>
                      <p>{e.next}</p>
                    </div>
                  )}
                </div>
              )}
              {e.slack && (
                <section className="grid gap-2">
                  <Label>What Slack says</Label>
                  <p className="border-l-4 border-gold bg-[#FBF6E8] rounded-r-xl px-4 py-3">{e.slack}</p>
                </section>
              )}
              {emails.length > 0 && (
                <section className="grid gap-2">
                  <Label>Email audit for this {e.kind}</Label>
                  {emails.map((a) => (
                    <div key={a.id} className="grid gap-1.5 rounded-xl border border-sand4 bg-soft px-4 py-3">
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className={`pill ${AUDIT[a.status].color}`}>{AUDIT[a.status].label}</span>
                        <b className="text-ink">{a.party}</b>
                        {ageText(a) && <span className={`age ${a.status === "noreply" ? "" : "amber"}`}>{ageText(a)}</span>}
                      </div>
                      {a.subject && <div className="text-[15px]">{a.subject}</div>}
                      {a.done && (
                        <div className="text-[15px]">
                          <b>Done:</b> {a.done}
                        </div>
                      )}
                      {a.next && (
                        <div className="text-[15px]">
                          <b>Next:</b> {a.next}
                        </div>
                      )}
                      <SourceLinks links={a.links} />
                    </div>
                  ))}
                </section>
              )}
              <section className="grid gap-2">
                <Label>What happened</Label>
                <p className="max-w-[68ch]">{e.brief}</p>
              </section>
              <section className="grid gap-2">
                <Label>Meetings this period</Label>
                {meetingItems(e).length ? (
                  <ul className="grid gap-2">
                    {meetingItems(e).map((m, i) => (
                      <li key={i} className="rounded-xl border border-sand4 bg-soft px-4 py-2.5">
                        {m}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink3">None found.</p>
                )}
              </section>
              <section className="grid gap-2">
                <Label>Email threads</Label>
                <p className={isNone(e.emails) ? "text-ink3" : ""}>{e.emails || "None found."}</p>
              </section>
            </>
          )}

          <section className="bg-accent-light rounded-2xl p-4 sm:p-5 grid gap-2.5">
            <Label className="!text-accent-dark">Status / Comments from the team</Label>
            {canNote ? (
              <>
                <textarea
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                  placeholder={`Add your latest status or comment for this ${e.kind}`}
                  className="field-input min-h-[110px] !border-[#9CB0F0]"
                />
                <div className="flex flex-wrap items-center gap-2.5">
                  <label htmlFor="note-who" className="text-sm font-semibold text-accent-dark">
                    Updated by
                  </label>
                  <select id="note-who" value={who} onChange={(ev) => setWho(ev.target.value)} className="field-input !w-auto !py-2">
                    {PEOPLE.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  <button type="button" onClick={saveNote} disabled={saving || note.trim() === String(e.teamNote ?? "")} className="btn-primary">
                    {saving ? "Saving" : "Save"}
                  </button>
                </div>
              </>
            ) : (
              <p className="whitespace-pre-wrap">{e.teamNote?.trim() || "No team update yet."}</p>
            )}
            {e.teamNoteAt && (
              <p className="text-sm font-semibold text-accent-dark">
                Last updated{e.teamNoteBy ? ` by ${e.teamNoteBy}` : ""}, {fmtPT(e.teamNoteAt)}
              </p>
            )}
          </section>

          {!edit && (e.sources ?? []).length > 0 && (
            <section className="grid gap-2">
              <Label>Sources</Label>
              <SourceLinks links={e.sources} />
            </section>
          )}
        </div>

        <div className="flex justify-between items-center gap-2.5 px-5 sm:px-7 py-3.5 border-t border-sand4 bg-soft">
          <button type="button" className="btn-secondary" disabled={position.index <= 0} onClick={() => onStep(-1)}>
            Previous
          </button>
          <span className="text-sm text-ink3">{position.index >= 0 ? `${position.index + 1} of ${position.total}` : ""}</span>
          <button type="button" className="btn-secondary" disabled={position.index < 0 || position.index >= position.total - 1} onClick={() => onStep(1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

