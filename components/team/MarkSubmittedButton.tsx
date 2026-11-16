"use client";

// Admin action: mark a member's weekly report as submitted when it was shared
// outside VCoS. Once marked, the report counts as filed everywhere and the
// daily Slack reminder stops. Used by Team → Weekly reports and the Filing
// scorecard's Exception Report. See app/api/weekly-reports/mark.
import { useState } from "react";
import { FiCheckCircle, FiRotateCcw } from "react-icons/fi";
import Spinner from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { todayPT, weekStartISO } from "@/lib/week-utils";

async function callMark(
  method: "POST" | "DELETE",
  body: Record<string, string>,
): Promise<string | null> {
  try {
    const res = await fetch("/api/weekly-reports/mark", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const d = await res.json().catch(() => ({}));
    return d.error ?? `Request failed (${res.status})`;
  } catch {
    return "Network error";
  }
}

export function MarkSubmittedButton({
  name,
  weekMonday,
  onDone,
}: {
  name: string;
  weekMonday: Date;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const minDay = weekStartISO(weekMonday);
  const maxDay = todayPT();
  const [open, setOpen] = useState(false);
  const [sharedOn, setSharedOn] = useState(maxDay);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const err = await callMark("POST", {
      name,
      week_start: minDay,
      shared_on: sharedOn,
    });
    setBusy(false);
    if (err) {
      toast(`Could not mark ${name}: ${err}`);
      return;
    }
    toast(`${name.split(" ")[0]}'s report marked as submitted - reminders stopped`);
    setOpen(false);
    onDone();
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-ghost text-xs py-1 px-2 inline-flex items-center gap-1 whitespace-nowrap"
        title="Report was shared outside VCoS - count it as filed and stop reminders"
      >
        <FiCheckCircle className="w-3.5 h-3.5" />
        Mark as Submitted
      </button>
    );

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="flex items-center gap-1 text-ink3">
        Shared on
        <input
          type="date"
          value={sharedOn}
          min={minDay}
          max={maxDay}
          onChange={(e) => setSharedOn(e.target.value)}
          className="field-input text-xs py-1 px-1.5 w-auto"
        />
      </label>
      <button
        onClick={confirm}
        disabled={busy || !sharedOn}
        className="btn-primary text-xs py-1 px-2 disabled:opacity-50"
      >
        {busy ? <Spinner label="Saving" /> : "Confirm"}
      </button>
      <button
        onClick={() => setOpen(false)}
        disabled={busy}
        className="text-ink4 hover:text-ink underline"
      >
        Cancel
      </button>
    </div>
  );
}

export function UndoMarkButton({
  name,
  weekMonday,
  onDone,
}: {
  name: string;
  weekMonday: Date;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function undo() {
    if (
      !window.confirm(
        `Remove the manual "submitted" mark for ${name}? Their report will show as not submitted again and reminders will resume.`,
      )
    )
      return;
    setBusy(true);
    const err = await callMark("DELETE", {
      name,
      week_start: weekStartISO(weekMonday),
    });
    setBusy(false);
    if (err) {
      toast(`Could not undo: ${err}`);
      return;
    }
    toast(`Mark removed for ${name.split(" ")[0]}`);
    onDone();
  }

  return (
    <button
      onClick={undo}
      disabled={busy}
      className="text-xs text-ink4 hover:text-ink inline-flex items-center gap-1 disabled:opacity-50"
    >
      <FiRotateCcw className="w-3 h-3" />
      {busy ? "Removing…" : "Undo mark"}
    </button>
  );
}
