"use client";

import { useState } from "react";
import type { IconType } from "react-icons";
import { FiChevronDown, FiEdit2, FiExternalLink } from "react-icons/fi";

type Status = "green" | "amber" | "red";

interface SystemRowProps {
  icon: IconType;
  name: string;
  detail: string;
  status: Status;
  url?: string;
  notes?: string[];
  manual?: boolean;
  updatedBy?: string;
  updatedAt?: string;
  onSave?: (status: Status, detail: string) => Promise<void>;
}

// Pill colours come from the shared .pill classes in globals.css
const STATUS: Record<Status, { pill: string; label: string; tile: string }> = {
  green: { pill: "green", label: "Online", tile: "bg-success-light text-success-dark" },
  amber: { pill: "amber", label: "Degraded", tile: "bg-warning-light text-warning-dark" },
  red: { pill: "red", label: "Down", tile: "bg-danger-light text-danger-dark" },
};

export default function SystemRow({
  icon: Icon,
  name,
  detail,
  status,
  url,
  notes,
  manual,
  updatedBy,
  updatedAt,
  onSave,
}: SystemRowProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editStatus, setEditStatus] = useState<Status>(status);
  const [editDetail, setEditDetail] = useState(detail);
  const [saving, setSaving] = useState(false);
  const cfg = STATUS[status];
  const hasMore = (notes?.length ?? 0) > 0 || !!url;

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(editStatus, editDetail);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const updatedTime = updatedAt
    ? new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <div className="border-b border-sand4 last:border-0">
      <div className="flex items-center gap-2 py-2">
        <button
          type="button"
          onClick={() => !editing && hasMore && setOpen((v) => !v)}
          aria-expanded={hasMore ? open : undefined}
          className={`flex items-center gap-3.5 flex-1 min-w-0 text-left rounded-xl px-2 py-2 transition-colors ${hasMore ? "hover:bg-soft" : "cursor-default"}`}
        >
          <span className={`w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 ${cfg.tile}`}>
            <Icon className="w-[18px] h-[18px]" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-ink">{name}</span>
            <span className="block text-sm text-ink3 truncate">
              {detail}
              {manual && updatedBy && updatedTime && (
                <span className="text-ink4"> · updated by {updatedBy} {updatedTime}</span>
              )}
            </span>
          </span>
          <span className={`pill ${cfg.pill} flex-shrink-0`}>{cfg.label}</span>
          <FiChevronDown
            aria-hidden
            className={`w-5 h-5 flex-shrink-0 transition-transform ${hasMore ? "text-ink3" : "text-transparent"} ${open ? "rotate-180" : ""}`}
          />
        </button>
        {/* Fixed-width slot so every row's status lines up, editable or not */}
        <span className="w-9 flex-shrink-0 flex justify-center">
          {onSave && !editing && (
            <button
              type="button"
              onClick={() => {
                setEditStatus(status);
                setEditDetail(detail);
                setEditing(true);
                setOpen(false);
              }}
              className="btn-ghost !p-2"
              aria-label={`Edit ${name} status`}
              title="Edit status"
            >
              <FiEdit2 className="w-4 h-4" />
            </button>
          )}
        </span>
      </div>

      {editing && (
        <div className="pl-[66px] pr-11 pb-4 flex items-center gap-2 flex-wrap">
          <select
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value as Status)}
            className="field-input !w-40 !py-2"
            aria-label="Status"
          >
            <option value="green">Online</option>
            <option value="amber">Degraded</option>
            <option value="red">Down</option>
          </select>
          <input
            value={editDetail}
            onChange={(e) => setEditDetail(e.target.value)}
            className="field-input !py-2 flex-1 min-w-48"
            placeholder="Short status detail"
            aria-label="Status detail"
          />
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary !py-2">
            {saving ? "Saving" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
            Cancel
          </button>
        </div>
      )}

      {open && !editing && (
        <div className="pl-[66px] pr-11 pb-4 grid gap-3">
          {notes && notes.length > 0 && (
            <ul className="grid gap-1.5 list-disc pl-5 text-sm text-ink2 marker:text-ink4">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary justify-self-start !py-1.5">
              Open {name}
              <FiExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
