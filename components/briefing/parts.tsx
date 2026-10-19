"use client";

// Small building blocks shared by the Briefing Room tabs.
import { useEffect, useRef, useState } from "react";
import { PERSON_COLORS, safeUrl, type BLink } from "@/lib/briefing-view";

/** Round initial avatar in the person's colour. */
export function PersonDot({ name, ring = false, size = 26 }: { name: string; ring?: boolean; size?: number }) {
  return (
    <span
      title={name}
      className={`inline-grid place-items-center rounded-full text-white font-bold flex-none ${ring ? "border-2 border-white" : ""}`}
      style={{ background: PERSON_COLORS[name] ?? "#56627F", width: size, height: size, fontSize: Math.round(size * 0.46) }}
    >
      {name[0]}
    </span>
  );
}

/** Overlapping avatars for a list of names. */
export function PersonStack({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <span className="flex ml-auto">
      {names.map((n, i) => (
        <span key={n} className={i ? "-ml-[7px]" : ""}>
          <PersonDot name={n} ring />
        </span>
      ))}
    </span>
  );
}

/** Pill links to sources (only http/https URLs are rendered). */
export function SourceLinks({ links }: { links?: BLink[] }) {
  const ok = (links ?? []).filter((l) => safeUrl(l.url));
  if (!ok.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {ok.map((l, i) => (
        <a
          key={i}
          href={safeUrl(l.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-sand border border-sand4 rounded-full px-3.5 py-1.5 text-sm font-semibold text-accent-dark shadow-card hover:border-accent"
        >
          {l.label || "Source"}
        </a>
      ))}
    </div>
  );
}

export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-xs font-bold uppercase text-ink3 ${className}`} style={{ letterSpacing: "0.08em" }}>
      {children}
    </div>
  );
}

/**
 * Text field that saves when it loses focus (if changed). It keeps your draft
 * while you type, even if new data arrives from the 60-second refresh.
 */
export function EditField({
  label,
  value,
  onSave,
  rows,
  type = "text",
  placeholder,
  readOnly,
}: {
  label?: string;
  value: string | number | undefined;
  onSave: (v: string) => void | Promise<unknown>;
  rows?: number;
  type?: "text" | "number";
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(value ?? ""));
  }, [value]);
  const common = {
    value: draft,
    placeholder,
    readOnly,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      if (draft !== String(value ?? "")) onSave(draft);
    },
    className: "field-input !text-[15px] !py-2",
  };
  const field = rows ? (
    <textarea
      {...common}
      rows={rows}
      // grow with the text so long answers are never cut off
      className={`${common.className} [field-sizing:content] min-h-[3.5rem]`}
      onChange={(e) => setDraft(e.target.value)}
    />
  ) : (
    <input {...common} type={type} onChange={(e) => setDraft(e.target.value)} />
  );
  if (!label) return field;
  return (
    <label className="grid gap-1 text-sm font-semibold text-ink3">
      {label}
      {field}
    </label>
  );
}

/** Dropdown that saves immediately. */
export function EditSelect({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-ink3">
      {label}
      <select value={value} onChange={(e) => onSave(e.target.value)} className="field-input !text-[15px] !py-2">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Delete button that asks for a second click to confirm. */
export function ConfirmDelete({ onDelete, label = "Delete" }: { onDelete: () => void; label?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => (armed ? onDelete() : setArmed(true))}
      className={`btn-ghost ${armed ? "!text-danger-dark !bg-danger-light" : "!text-danger-dark"}`}
    >
      {armed ? "Click again to delete" : label}
    </button>
  );
}

/** Dashed empty-state box. */
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty mb-8">
      <b>{title}</b> {children}
    </div>
  );
}
