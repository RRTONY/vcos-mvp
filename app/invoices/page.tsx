"use client";

import { useEffect, useState, useRef } from "react";
import { useRefresh } from "@/components/RefreshContext";
import { useMe } from "@/hooks/useMe";

interface Invoice {
  id: string;
  contractor: string;
  invoiceNumber: string;
  period: string;
  hours: number;
  rate: number; // owner-only
  amount: number; // admin-only
  status: string;
  parsedAt: string;
  clickupTaskId: string | null;
  clickupUrl: string | null;
  uploadedBy: string | null;
  forUser: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-black text-white",
  approved: "bg-green-800 text-white",
  audit_done: "bg-blue-700 text-white",
  pending: "bg-sand2 text-ink3 border border-sand3",
  unknown: "bg-sand2 text-ink4 border border-sand3",
};

const STATUS_LABEL: Record<string, string> = {
  audit_done: "Audit Done",
  approved: "Approved",
  paid: "Paid",
  pending: "Pending",
  unknown: "Unknown",
};

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Extract a YYYY-MM-DD start date from the invoice period text for accurate filtering.
// Returns empty string when the period is unrecognisable (caller should include the
// invoice rather than filtering it out).
function periodStartDate(period: string): string {
  if (!period) return "";
  // "2026-03-01 to 2026-03-15"  OR  "2026-03-01 / 2026-03-15"  OR just "2026-03-01"
  const iso = period.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  // "Hours March 1-15, 2026" / "Mar 1 – 15, 2026" / "March 2026"
  const months: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const m = period.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,]+(\d{1,2})?[^\d]*(\d{4})/i,
  );
  if (m) {
    const mo = months[m[1].toLowerCase().slice(0, 3)];
    const day = (m[2] ?? "1").padStart(2, "0");
    return `${m[3]}-${mo}-${day}`;
  }
  return "";
}

function quickRange(
  preset: "this-month" | "last-month" | "last-3" | "ytd",
): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this-month":
      return [toYMD(new Date(y, m, 1)), toYMD(new Date(y, m + 1, 0))];
    case "last-month":
      return [toYMD(new Date(y, m - 1, 1)), toYMD(new Date(y, m, 0))];
    case "last-3":
      return [toYMD(new Date(y, m - 2, 1)), toYMD(new Date(y, m + 1, 0))];
    case "ytd":
      return [toYMD(new Date(y, 0, 1)), toYMD(now)];
  }
}

export default function InvoicesPage() {
  const { isAdmin, isOwner } = useMe();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [pushing, setPushing] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { refreshKey } = useRefresh();

  // Past Invoices filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [contractorFilter, setContractorFilter] = useState("");
  // Pending section contractor filter
  const [pendingContractor, setPendingContractor] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/invoices", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setInvoices(d.invoices ?? []);
        setLoadError(d.error ?? "");
        setLoading(false);
      })
      .catch((e) => {
        setLoadError(String(e));
        setLoading(false);
      });
  }, [refreshKey]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    setUploadWarnings([]);
    const form = new FormData();
    form.append("pdf", file);
    try {
      const res = await fetch("/api/invoices/upload", {
        method: "POST",
        body: form,
      });
      const d = await res.json();
      if (res.ok) {
        const warnings: string[] = d.clickupWarnings ?? [];
        setUploadMsg(
          `✓ Imported ${d.count} invoice${d.count !== 1 ? "s" : ""}${warnings.length > 0 ? " - ClickUp sync failed" : " and sent to ClickUp"}`,
        );
        setUploadWarnings(warnings);
        setInvoices((prev) => [...(d.invoices ?? []), ...prev]);
      } else {
        setUploadMsg(`Error: ${d.error}`);
      }
    } catch {
      setUploadMsg("Upload failed - try again");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSendToClickUp(id: string) {
    setPushing(id);
    try {
      const res = await fetch(`/api/invoices/${id}/clickup`, {
        method: "POST",
      });
      const d = await res.json();
      if (res.ok) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === id
              ? { ...inv, clickupTaskId: d.taskId, clickupUrl: d.url }
              : inv,
          ),
        );
      } else {
        alert(`ClickUp error: ${d.error}`);
      }
    } catch {
      alert("Failed to send to ClickUp");
    } finally {
      setPushing(null);
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    setActioning(id);
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const d = await res.json();
      if (res.ok) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === id ? { ...inv, status: newStatus } : inv,
          ),
        );
      } else {
        alert(`Error: ${d.error}`);
      }
    } catch {
      alert("Request failed");
    } finally {
      setActioning(null);
    }
  }

  function applyQuick(preset: "this-month" | "last-month" | "last-3" | "ytd") {
    const [f, t] = quickRange(preset);
    setDateFrom(f);
    setDateTo(t);
  }

  function clearPastFilters() {
    setDateFrom("");
    setDateTo("");
    setContractorFilter("");
  }

  // Split invoices
  const active = invoices.filter((inv) => inv.status !== "paid");
  const paid = invoices.filter((inv) => inv.status === "paid");

  // Unique contractors for filters
  const activeContractors = Array.from(
    new Set(active.map((inv) => inv.contractor)),
  ).sort();
  const paidContractors = Array.from(
    new Set(paid.map((inv) => inv.contractor)),
  ).sort();

  // Apply past filters - filter by invoice period date only.
  // If the period can't be parsed we have no reliable date; include the invoice rather
  // than accidentally hiding it by using the upload date as a proxy.
  const visiblePaid = paid.filter((inv) => {
    if (contractorFilter && inv.contractor !== contractorFilter) return false;
    const d = periodStartDate(inv.period);
    if (!d) return true; // unknown period - always include
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  // Apply pending contractor filter
  const visibleActive = pendingContractor
    ? active.filter((inv) => inv.contractor === pendingContractor)
    : active;

  // Totals for the filtered past invoices (for scrutiny)
  const totalHours = visiblePaid.reduce((s, inv) => s + (inv.hours ?? 0), 0);
  const totalAmount = visiblePaid.reduce((s, inv) => s + (inv.amount ?? 0), 0);

  const hasFilter = dateFrom || dateTo || contractorFilter;

  return (
    <div>
      {/* ── Header + upload ── */}
      <div className="flex items-center justify-between mt-6 mb-1">
        <div className="slbl mb-0">Pending Invoices</div>
        <div className="flex items-center gap-2">
          {uploadMsg && (
            <span
              className={`text-xs font-medium ${uploadMsg.startsWith("✓") ? "text-green-700" : "text-red-600"}`}
            >
              {uploadMsg}
            </span>
          )}
          <label className="btn-secondary cursor-pointer text-xs">
            {uploading ? "Importing…" : "↑ Upload PDF"}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {loadError && (
        <div className="alert alert-amber mt-2 mb-2 text-xs">
          <span className="font-bold">Failed to load invoices:</span>{" "}
          {loadError}
        </div>
      )}

      {uploadWarnings.length > 0 && (
        <div className="alert alert-amber mt-2 text-xs space-y-1">
          <div className="font-bold">
            Invoice saved but ClickUp sync failed:
          </div>
          {uploadWarnings.map((w, i) => (
            <div key={i}>• {w}</div>
          ))}
          <div className="text-ink3 mt-1">
            Use the "+ ClickUp" button in the table to retry.
          </div>
        </div>
      )}

      {/* Pending contractor filter */}
      {activeContractors.length > 1 && (
        <div className="flex items-center gap-2 mb-2">
          <select
            value={pendingContractor}
            onChange={(e) => setPendingContractor(e.target.value)}
            className="field-input text-xs py-1 w-full sm:w-auto"
          >
            <option value="">All contractors</option>
            {activeContractors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {pendingContractor && (
            <button
              onClick={() => setPendingContractor("")}
              className="text-xs text-ink4 hover:text-ink1 underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Active invoices ── */}
      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 animate-pulse text-sm text-ink4">
              Loading invoices…
            </div>
          ) : visibleActive.length === 0 ? (
            <div className="p-4 text-sm text-ink4">
              {pendingContractor
                ? `No pending invoices for ${pendingContractor}.`
                : "No pending invoices. Upload a Braintrust PDF to get started."}
            </div>
          ) : (
            <InvoiceTable
              invoices={visibleActive}
              isAdmin={isAdmin}
              isOwner={isOwner}
              actioning={actioning}
              pushing={pushing}
              onStatusChange={handleStatusChange}
              onSendToClickUp={handleSendToClickUp}
            />
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="text-xs text-ink4 mt-1 mb-2">
          Amounts visible to all admins. Rates visible to owners only.
        </div>
      )}

      {/* ── Past Invoices header + filters ── */}
      <div className="mt-6 mb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="slbl mb-0">Past Invoices</div>
          {hasFilter && (
            <button
              onClick={clearPastFilters}
              className="text-xs text-ink4 hover:text-ink1 underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Filter controls */}
        <div className="card px-4 py-3">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Quick-select presets */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-ink4 font-semibold">
                Quick select
              </span>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["this-month", "This Month"],
                    ["last-month", "Last Month"],
                    ["last-3", "Last 3 Months"],
                    ["ytd", "Year to Date"],
                  ] as const
                ).map(([preset, label]) => (
                  <button
                    key={preset}
                    onClick={() => applyQuick(preset)}
                    className="text-xs px-2 py-0.5 border border-sand3 hover:border-ink3 hover:text-ink rounded transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Invoice period */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-ink4 font-semibold">
                Invoice period
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="field-input text-xs py-1 w-full sm:w-36"
                />
                <span className="text-ink4 text-xs">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="field-input text-xs py-1 w-full sm:w-36"
                />
              </div>
            </div>

            {/* Contractor filter */}
            {paidContractors.length > 1 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-ink4 font-semibold">
                  Contractor
                </span>
                <select
                  value={contractorFilter}
                  onChange={(e) => setContractorFilter(e.target.value)}
                  className="field-input text-xs py-1 w-full sm:w-auto"
                >
                  <option value="">All contractors</option>
                  {paidContractors.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Active filter summary */}
          {hasFilter && (
            <div className="mt-2 pt-2 border-t border-sand2 flex flex-wrap gap-4 text-xs text-ink3">
              {(dateFrom || dateTo) && (
                <span>
                  Period:{" "}
                  <span className="font-semibold text-ink">
                    {dateFrom || "-"} → {dateTo || "now"}
                  </span>
                </span>
              )}
              {contractorFilter && (
                <span>
                  Contractor:{" "}
                  <span className="font-semibold text-ink">
                    {contractorFilter}
                  </span>
                </span>
              )}
              <span className="text-ink4">
                {visiblePaid.length} invoice
                {visiblePaid.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Past invoices table ── */}
      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 animate-pulse text-sm text-ink4">Loading…</div>
          ) : visiblePaid.length === 0 ? (
            <div className="p-4 text-sm text-ink4">
              {hasFilter
                ? "No paid invoices match the selected filters."
                : "No paid invoices yet."}
            </div>
          ) : (
            <>
              <InvoiceTable
                invoices={visiblePaid}
                isAdmin={isAdmin}
                isOwner={isOwner}
                actioning={actioning}
                pushing={pushing}
                onStatusChange={handleStatusChange}
                onSendToClickUp={handleSendToClickUp}
              />
              {/* Totals row */}
              <div className="border-t border-sand3 px-4 py-3 flex flex-wrap gap-6 items-center bg-sand1">
                <span className="text-xs font-bold uppercase tracking-widest text-ink3">
                  Totals - {visiblePaid.length} invoice
                  {visiblePaid.length !== 1 ? "s" : ""}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {totalHours.toFixed(1)} hrs
                </span>
                {(isAdmin || isOwner) && totalAmount > 0 && (
                  <span className="text-sm font-semibold tabular-nums">
                    ${totalAmount.toLocaleString()} total
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface InvoiceTableProps {
  invoices: Invoice[];
  isAdmin: boolean;
  isOwner: boolean;
  actioning: string | null;
  pushing: string | null;
  onStatusChange: (id: string, newStatus: string) => void;
  onSendToClickUp: (id: string) => void;
}

function InvoiceTable({
  invoices,
  isAdmin,
  isOwner,
  actioning,
  pushing,
  onStatusChange,
  onSendToClickUp,
}: InvoiceTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-sand3 text-left text-xs text-ink4 uppercase tracking-wide">
            <th className="px-4 py-2 font-medium whitespace-nowrap">
              Contractor
            </th>
            <th className="px-4 py-2 font-medium whitespace-nowrap hidden sm:table-cell">
              Invoice
            </th>
            <th className="px-4 py-2 font-medium whitespace-nowrap">Period</th>
            <th className="px-4 py-2 font-medium text-right whitespace-nowrap">
              Hours
            </th>
            {isOwner && (
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap hidden md:table-cell">
                Rate
              </th>
            )}
            {(isAdmin || isOwner) && (
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap">
                Amount
              </th>
            )}
            <th className="px-4 py-2 font-medium whitespace-nowrap">Status</th>
            <th className="px-4 py-2 font-medium whitespace-nowrap hidden md:table-cell">
              Uploaded by
            </th>
            {(isAdmin || isOwner) && (
              <th className="px-4 py-2 font-medium text-center whitespace-nowrap hidden sm:table-cell">
                ClickUp
              </th>
            )}
            {(isAdmin || isOwner) && (
              <th className="px-4 py-2 font-medium whitespace-nowrap">
                Action
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              className="border-b border-sand2 hover:bg-sand1 transition-colors"
            >
              <td className="px-4 py-2 font-medium whitespace-nowrap">
                {inv.contractor}
              </td>
              <td className="px-4 py-2 text-ink3 whitespace-nowrap hidden sm:table-cell">
                {inv.invoiceNumber}
              </td>
              <td className="px-4 py-2 text-ink3 max-w-[140px] sm:max-w-none truncate">
                {inv.period}
              </td>
              <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                {inv.hours}
              </td>
              {isOwner && (
                <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap hidden md:table-cell">
                  ${inv.rate}/hr
                </td>
              )}
              {(isAdmin || isOwner) && (
                <td className="px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap">
                  {inv.amount > 0 ? `$${inv.amount.toLocaleString()}` : "-"}
                </td>
              )}
              <td className="px-4 py-2">
                <span
                  className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[inv.status] ?? STATUS_STYLE.unknown}`}
                >
                  {STATUS_LABEL[inv.status] ?? inv.status}
                </span>
              </td>
              <td className="px-4 py-2 text-ink3 text-xs whitespace-nowrap hidden md:table-cell">
                {inv.uploadedBy ?? "-"}
              </td>

              {/* ClickUp column */}
              {(isAdmin || isOwner) && (
                <td className="px-4 py-2 text-center hidden sm:table-cell">
                  {inv.clickupUrl ? (
                    <a
                      href={inv.clickupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                    >
                      ↗ View
                    </a>
                  ) : (
                    <button
                      onClick={() => onSendToClickUp(inv.id)}
                      disabled={pushing === inv.id}
                      className="text-xs text-ink4 hover:text-ink1 underline disabled:opacity-40"
                    >
                      {pushing === inv.id ? "…" : "+ Add"}
                    </button>
                  )}
                </td>
              )}

              {/* Workflow action column */}
              {(isAdmin || isOwner) && (
                <td className="px-4 py-2 whitespace-nowrap">
                  {inv.status === "pending" && (
                    <button
                      onClick={() => onStatusChange(inv.id, "audit_done")}
                      disabled={actioning === inv.id}
                      className="btn-secondary text-xs py-0.5 px-2 disabled:opacity-50"
                    >
                      {actioning === inv.id ? "…" : "Audit Done"}
                    </button>
                  )}
                  {inv.status === "audit_done" && isOwner && (
                    <button
                      onClick={() => onStatusChange(inv.id, "approved")}
                      disabled={actioning === inv.id}
                      className="btn-secondary text-xs py-0.5 px-2 disabled:opacity-50"
                    >
                      {actioning === inv.id ? "…" : "Approve"}
                    </button>
                  )}
                  {inv.status === "approved" && (
                    <button
                      onClick={() => onStatusChange(inv.id, "paid")}
                      disabled={actioning === inv.id}
                      className="btn-primary text-xs py-0.5 px-2 disabled:opacity-50"
                    >
                      {actioning === inv.id ? "…" : "Mark Paid"}
                    </button>
                  )}
                  {isOwner &&
                    (inv.status === "pending" ||
                      inv.status === "audit_done") && (
                      <button
                        onClick={() => onStatusChange(inv.id, "paid")}
                        disabled={actioning === inv.id}
                        title="Skip workflow and mark as paid"
                        className="ml-2 text-xs text-ink4 hover:text-ink1 underline disabled:opacity-40"
                      >
                        {actioning === inv.id ? "" : "Mark Paid"}
                      </button>
                    )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
