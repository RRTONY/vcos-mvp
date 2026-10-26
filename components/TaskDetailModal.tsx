"use client";

import { useEffect, useRef, useState } from "react";
import { FiExternalLink, FiPaperclip, FiX } from "react-icons/fi";
import Spinner from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import type { ClickUpTaskDetail } from "@/lib/types";

// Full detail of one ClickUp task, loaded live - title, status (editable,
// pushed straight to ClickUp), description, images, files, assignees, dates,
// and recent comments.
export default function TaskDetailModal({
  taskId,
  onClose,
  onStatusChange,
}: {
  taskId: string;
  onClose: () => void;
  onStatusChange?: (taskId: string, status: string, color: string) => void;
}) {
  const [task, setTask] = useState<ClickUpTaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTask(null);
    setError(null);
    fetch(`/api/clickup-tasks/${taskId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setTask(d)))
      .catch(() => setError("Couldn't load this task from ClickUp."));
  }, [taskId]);

  useEffect(() => {
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function changeStatus(status: string) {
    if (!task || status === task.status) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clickup-tasks/${task.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      const color = task.statuses.find((s) => s.status === status)?.color ?? "";
      setTask({ ...task, status, statusColor: color });
      onStatusChange?.(task.id, status, color);
      toast(`✓ Status updated in ClickUp: ${status}`);
    } catch {
      toast("Couldn't update the status in ClickUp - please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(12,20,40,.7)] flex items-start justify-center overflow-y-auto p-3 sm:p-5"
      onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        className="bg-sand rounded-[22px] w-full max-w-[720px] my-auto overflow-hidden shadow-card-lg"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-sand3">
          <div className="min-w-0">
            {task?.list && (
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink4 mb-1">
                {task.list}
              </div>
            )}
            <h2
              id="task-modal-title"
              className="text-lg font-bold text-ink leading-snug break-words"
            >
              {task?.name ?? (error ? "Task" : "Loading…")}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {task && (
              <a
                href={task.url}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg text-ink3 hover:bg-sand2"
                title="Open in ClickUp"
              >
                <FiExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-ink3 hover:bg-sand2"
              aria-label="Close"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {error && <div className="alert alert-amber">{error}</div>}
          {!task && !error && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}

          {task && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <Field label="Status">
                  <select
                    value={task.status}
                    onChange={(e) => changeStatus(e.target.value)}
                    disabled={saving || task.statuses.length === 0}
                    className="text-xs font-semibold rounded-full px-2 py-1 border-0 cursor-pointer disabled:opacity-50"
                    style={{
                      backgroundColor: task.statusColor
                        ? `${task.statusColor}26`
                        : undefined,
                      color: task.statusColor || undefined,
                    }}
                  >
                    {!task.statuses.some((s) => s.status === task.status) && (
                      <option value={task.status}>{task.status}</option>
                    )}
                    {task.statuses.map((s) => (
                      <option key={s.status} value={s.status}>
                        {s.status}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Due">{task.dueDate ?? "-"}</Field>
                <Field label="Priority">
                  <span className="capitalize">{task.priority || "-"}</span>
                </Field>
                <Field label="Assignees">
                  <div className="flex flex-wrap gap-1.5">
                    {task.assignees.length === 0 && "-"}
                    {task.assignees.map((a) => (
                      <span
                        key={a.name}
                        className="inline-flex items-center gap-1.5"
                      >
                        {a.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.image}
                            alt=""
                            className="w-5 h-5 rounded-full"
                          />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-sand3 text-[9px] font-bold flex items-center justify-center">
                            {a.initials}
                          </span>
                        )}
                        {a.name}
                      </span>
                    ))}
                  </div>
                </Field>
                <Field label="Start">{task.startDate ?? "-"}</Field>
                <Field label="Created">
                  {task.createdAt ?? "-"}
                  {task.creator ? ` by ${task.creator}` : ""}
                </Field>
              </div>

              {task.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {task.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <Section title="Description">
                {task.description ? (
                  <p className="text-sm text-ink2 whitespace-pre-wrap break-words">
                    {task.description}
                  </p>
                ) : (
                  <p className="text-sm text-ink4">No description.</p>
                )}
              </Section>

              {task.images.length > 0 && (
                <Section title="Images">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {task.images.map((img) => (
                      <a
                        key={img.url}
                        href={img.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg overflow-hidden border border-sand3 bg-sand2"
                        title={img.title}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.title}
                          className="w-full h-32 object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </Section>
              )}

              {task.files.length > 0 && (
                <Section title="Attachments">
                  <ul className="space-y-1">
                    {task.files.map((f) => (
                      <li key={f.url}>
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-ink2 underline"
                        >
                          <FiPaperclip className="w-3.5 h-3.5" />
                          {f.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {task.comments.length > 0 && (
                <Section title="Recent comments">
                  <ul className="space-y-3">
                    {task.comments.map((c, i) => (
                      <li key={i} className="text-sm">
                        <div className="text-xs text-ink4 mb-0.5">
                          <span className="font-semibold text-ink3">
                            {c.author}
                          </span>
                          {c.date ? ` · ${c.date}` : ""}
                        </div>
                        <p className="text-ink2 whitespace-pre-wrap break-words">
                          {c.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-ink4 mb-1">
        {label}
      </div>
      <div className="text-ink2">{children}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-ink3 mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}
