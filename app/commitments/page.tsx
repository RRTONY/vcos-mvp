"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMe } from "@/hooks/useMe";
import Spinner from "@/components/Spinner";
import { FiCheckSquare, FiSquare, FiPlus } from "react-icons/fi";

interface Commitment {
  id: string;
  type: "commitment" | "decision";
  text: string;
  owner: string | null;
  due: string | null;
  status: "open" | "done";
  createdBy: string;
  createdAt: string;
}

type Filter = "open" | "overdue" | "done" | "all";

export default function CommitmentsPage() {
  const { isAdmin } = useMe();
  const [items, setItems] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("open");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    text: "",
    owner: "",
    due: "",
    type: "commitment",
  });

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/commitments")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (c: Commitment) =>
    c.status === "open" && !!c.due && c.due < today;

  const toggle = async (c: Commitment) => {
    const status = c.status === "open" ? "done" : "open";
    const r = await fetch("/api/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, status }),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (r?.items) setItems(r.items);
  };

  const add = async () => {
    if (!draft.text.trim()) return;
    setAdding(true);
    const r = await fetch("/api/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: draft.text,
        owner: draft.owner || null,
        due: draft.due || null,
        type: draft.type,
      }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setAdding(false);
    if (r?.items) {
      setItems(r.items);
      setDraft({ text: "", owner: "", due: "", type: "commitment" });
    }
  };

  const counts = useMemo(
    () => ({
      open: items.filter((c) => c.status === "open").length,
      overdue: items.filter(isOverdue).length,
      done: items.filter((c) => c.status === "done").length,
      all: items.length,
    }),
    [items],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const list =
      filter === "overdue"
        ? items.filter(isOverdue)
        : filter === "all"
          ? items
          : items.filter((c) => c.status === filter);
    return [...list].sort((a, b) => {
      const ao = isOverdue(a) ? 0 : 1,
        bo = isOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (a.due ?? "9999").localeCompare(b.due ?? "9999");
    });
  }, [items, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-xl tracking-widest">
          DECISIONS &amp; COMMITMENTS
        </h1>
        {counts.overdue > 0 && (
          <span className="badge-red">{counts.overdue} overdue</span>
        )}
      </div>
      <p className="text-xs text-ink4 mb-4">
        Promises and decisions VCoS-AI captured from chats - plus anything you
        add. Check one off when it&apos;s handled.
      </p>

      {/* Add (admin) */}
      {isAdmin && (
        <div className="card p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={draft.text}
              onChange={(e) =>
                setDraft((d) => ({ ...d, text: e.target.value }))
              }
              placeholder="New commitment or decision…"
              className="field-input flex-1"
            />
            <input
              value={draft.owner}
              onChange={(e) =>
                setDraft((d) => ({ ...d, owner: e.target.value }))
              }
              placeholder="Owner"
              className="field-input sm:w-32"
            />
            <input
              type="date"
              value={draft.due}
              onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))}
              className="field-input sm:w-40"
            />
            <select
              value={draft.type}
              onChange={(e) =>
                setDraft((d) => ({ ...d, type: e.target.value }))
              }
              className="field-input sm:w-36"
            >
              <option value="commitment">Commitment</option>
              <option value="decision">Decision</option>
            </select>
            <button
              onClick={add}
              disabled={adding || !draft.text.trim()}
              className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
            >
              <FiPlus size={15} /> Add
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        {(["open", "overdue", "done", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${filter === f ? "bg-accent text-white border-accent" : "border-sand4 text-ink3 hover:border-accent"}`}
          >
            {f[0].toUpperCase() + f.slice(1)} ({counts[f]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-6">
          <Spinner label="Loading…" className="text-ink4 text-sm" />
        </div>
      ) : shown.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink4">
          Nothing here. Make a commitment in a VCoS-AI chat (e.g.
          &ldquo;I&apos;ll send the deck Friday&rdquo;) and it lands here.
        </div>
      ) : (
        <div className="card divide-y divide-sand3">
          {shown.map((c) => {
            const overdue = isOverdue(c);
            return (
              <div key={c.id} className="flex items-start gap-3 px-4 py-3">
                <button
                  onClick={() => toggle(c)}
                  className="mt-0.5 flex-shrink-0"
                  title={c.status === "open" ? "Mark done" : "Reopen"}
                >
                  {c.status === "done" ? (
                    <FiCheckSquare size={17} className="text-success" />
                  ) : (
                    <FiSquare
                      size={17}
                      className="text-ink4 hover:text-accent"
                    />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm ${c.status === "done" ? "line-through text-ink4" : "text-ink"}`}
                  >
                    {c.text}
                  </div>
                  <div className="text-[11px] text-ink4 mt-0.5 flex flex-wrap gap-2 items-center">
                    <span
                      className={`badge ${c.type === "decision" ? "badge-accent" : ""} !py-0`}
                    >
                      {c.type}
                    </span>
                    {c.owner && <span>· {c.owner}</span>}
                    {c.due && (
                      <span
                        className={overdue ? "text-danger font-semibold" : ""}
                      >
                        · due {c.due}
                        {overdue ? " ⚠️" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
