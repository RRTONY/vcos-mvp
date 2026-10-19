"use client";

import { useState } from "react";
import { FiEdit2 } from "react-icons/fi";

export interface OKR {
  id: string;
  label: string;
  pct: number;
  note: string;
}

/** Plain-language status for a percentage, with matching colours. */
function status(pct: number) {
  if (pct >= 70) return { label: "On track", pill: "green", bar: "bg-success" };
  if (pct >= 40) return { label: "Watch", pill: "amber", bar: "bg-warning" };
  return { label: "Behind", pill: "red", bar: "bg-danger" };
}

function OkrRow({
  okr,
  canEdit,
  onSave,
}: {
  okr: OKR;
  canEdit: boolean;
  onSave: (id: string, pct: number, note: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState(okr.pct);
  const [note, setNote] = useState(okr.note ?? "");
  const [saving, setSaving] = useState(false);
  const s = status(okr.pct);

  async function save() {
    setSaving(true);
    if (await onSave(okr.id, pct, note)) setEditing(false);
    setSaving(false);
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-ink flex-1 min-w-0">{okr.label}</span>
        <span className={`pill ${s.pill}`}>{s.label}</span>
        <span className="font-display font-extrabold text-ink tabular-nums w-12 text-right">
          {okr.pct}%
        </span>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setPct(okr.pct);
              setNote(okr.note ?? "");
              setEditing(true);
            }}
            className="btn-ghost !px-2"
            aria-label={`Edit ${okr.label}`}
          >
            <FiEdit2 size={14} />
          </button>
        )}
      </div>
      <div className="progress-track mt-2" role="progressbar" aria-valuenow={okr.pct} aria-valuemin={0} aria-valuemax={100} aria-label={okr.label}>
        <div className={`progress-fill ${s.bar}`} style={{ width: `${Math.min(100, Math.max(okr.pct, 2))}%` }} />
      </div>
      {editing ? (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <input
            type="number"
            min={0}
            max={100}
            value={pct}
            onChange={(e) =>
              setPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))
            }
            className="field-input !w-20 text-right tabular-nums"
            aria-label="Percent complete"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Short note"
            className="field-input flex-1 min-w-[160px]"
            aria-label="Note"
          />
          <button type="button" onClick={save} disabled={saving} className="btn-primary !py-2">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
            Cancel
          </button>
        </div>
      ) : (
        okr.note && <p className="text-sm text-ink3 mt-1.5 leading-snug">{okr.note}</p>
      )}
    </li>
  );
}

/** OKRs as labelled progress bars; owners can edit % and note inline. */
export default function OkrProgress({
  okrs,
  canEdit,
  onSave,
}: {
  okrs: OKR[];
  canEdit: boolean;
  onSave: (id: string, pct: number, note: string) => Promise<boolean>;
}) {
  if (!okrs.length) return <p className="text-sm text-ink3">No OKRs set yet.</p>;
  return (
    <ul className="divide-y divide-sand4">
      {okrs.map((o) => (
        <OkrRow key={o.id} okr={o} canEdit={canEdit} onSave={onSave} />
      ))}
    </ul>
  );
}
