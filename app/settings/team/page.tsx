"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/hooks/useMe";

interface TeamMember {
  id: string;
  full_name: string;
  vcos_username: string | null;
  email: string | null;
  slack_aliases: string[];
  slack_user_id: string | null;
  clickup_key: string | null;
  clickup_user_id: string | null;
  braintrust_name: string | null;
  webwork_username: string | null;
  webwork_user_id: string | null;
  webwork_contract_id: string | null;
  fireflies_email: string | null;
  role_description: string | null;
  hourly_rate: number;
  bills_hours: boolean;
  files_report: boolean;
  active: boolean;
}

const EMPTY: Omit<TeamMember, "id"> = {
  full_name: "",
  vcos_username: null,
  email: null,
  slack_aliases: [],
  slack_user_id: null,
  clickup_key: null,
  clickup_user_id: null,
  braintrust_name: null,
  webwork_username: null,
  webwork_user_id: null,
  webwork_contract_id: null,
  fireflies_email: null,
  role_description: null,
  hourly_rate: 0,
  bills_hours: true,
  files_report: true,
  active: true,
};

function aliasesFromString(s: string): string[] {
  return s
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

export default function TeamManagementPage() {
  const { isAdmin } = useMe();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Omit<TeamMember, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const data = await fetch("/api/team", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => []);
    setMembers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(m: TeamMember) {
    setEditingId(m.id);
    setForm({ ...m });
    setError("");
  }

  function startNew() {
    setEditingId("new");
    setForm({ ...EMPTY });
    setError("");
  }

  async function save() {
    if (!form.full_name.trim()) {
      setError("Full name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload =
        editingId === "new" ? { ...form } : { id: editingId, ...form };
      const res = await fetch("/api/team", {
        method: editingId === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Save failed");
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (
      !confirm(
        "Deactivate this team member? They will no longer appear in reports or forms.",
      )
    )
      return;
    await fetch("/api/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  if (!isAdmin)
    return <div className="p-8 text-ink4">Admin access required.</div>;

  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active);

  return (
    <div>
      <div className="flex items-center justify-between mt-6 mb-1">
        <div className="slbl mb-0">Team Management</div>
        <button onClick={startNew} className="btn-primary text-xs py-1.5 px-3">
          + Add Member
        </button>
      </div>
      <div className="text-xs text-ink4 mb-4">
        Changes here propagate to all integrations: weekly report detection,
        invoice matching, submit form, compliance page.
      </div>

      {/* Add / Edit form */}
      {editingId && (
        <div className="card mb-4">
          <div className="card-hd">
            <div className="card-ti">
              {editingId === "new"
                ? "Add New Team Member"
                : `Edit - ${form.full_name}`}
            </div>
          </div>
          <div className="card-body space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  value={form.full_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, full_name: e.target.value }))
                  }
                  className="field-input text-sm"
                  placeholder="e.g. Daniel Baez"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  VCOS Username
                </label>
                <input
                  value={form.vcos_username ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      vcos_username: e.target.value || null,
                    }))
                  }
                  className="field-input text-sm"
                  placeholder="e.g. daniel"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  Role
                </label>
                <input
                  value={form.role_description ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      role_description: e.target.value || null,
                    }))
                  }
                  className="field-input text-sm"
                  placeholder="e.g. Webmaster"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  Hourly Rate ($)
                </label>
                <input
                  type="number"
                  value={form.hourly_rate}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      hourly_rate: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="field-input text-sm"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  Slack Aliases{" "}
                  <span className="text-ink4 font-normal">
                    (comma-separated)
                  </span>
                </label>
                <input
                  value={form.slack_aliases.join(", ")}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      slack_aliases: aliasesFromString(e.target.value),
                    }))
                  }
                  className="field-input text-sm"
                  placeholder="e.g. daniel baez, daniel's weekly report"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  ClickUp Key
                </label>
                <input
                  value={form.clickup_key ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      clickup_key: e.target.value || null,
                    }))
                  }
                  className="field-input text-sm"
                  placeholder="e.g. daniel"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  Braintrust Name{" "}
                  <span className="text-ink4 font-normal">(as in PDF)</span>
                </label>
                <input
                  value={form.braintrust_name ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      braintrust_name: e.target.value || null,
                    }))
                  }
                  className="field-input text-sm"
                  placeholder="e.g. Daniel Baez"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  WebWork Username
                </label>
                <input
                  value={form.webwork_username ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      webwork_username: e.target.value || null,
                    }))
                  }
                  className="field-input text-sm"
                  placeholder="e.g. daniel"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  WebWork User ID
                </label>
                <input
                  value={form.webwork_user_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      webwork_user_id: e.target.value || null,
                    }))
                  }
                  className="field-input text-sm font-mono"
                  placeholder="e.g. 404312"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  WebWork Contract ID
                </label>
                <input
                  value={form.webwork_contract_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      webwork_contract_id: e.target.value || null,
                    }))
                  }
                  className="field-input text-sm font-mono"
                  placeholder="e.g. 707596"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value || null }))
                  }
                  className="field-input text-sm"
                  placeholder="e.g. daniel@ramprate.com"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  Slack User ID
                </label>
                <input
                  value={form.slack_user_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      slack_user_id: e.target.value || null,
                    }))
                  }
                  className="field-input text-sm font-mono"
                  placeholder="e.g. U04XYZABC"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  ClickUp User ID
                </label>
                <input
                  value={form.clickup_user_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      clickup_user_id: e.target.value || null,
                    }))
                  }
                  className="field-input text-sm font-mono"
                  placeholder="e.g. 12345678"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-ink3 block mb-1">
                  Fireflies Email
                </label>
                <input
                  type="email"
                  value={form.fireflies_email ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      fireflies_email: e.target.value || null,
                    }))
                  }
                  className="field-input text-sm"
                  placeholder="e.g. daniel@ramprate.com"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.files_report}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, files_report: e.target.checked }))
                  }
                  className="w-4 h-4"
                />
                Expected to file weekly report
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.bills_hours}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bills_hours: e.target.checked }))
                  }
                  className="w-4 h-4"
                />
                Bills hours (Braintrust)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, active: e.target.checked }))
                  }
                  className="w-4 h-4"
                />
                Active
              </label>
            </div>
            {error && <div className="text-xs text-red-600">{error}</div>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="btn-primary text-xs py-1.5 px-4 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="text-xs text-ink4 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-ink4 animate-pulse">Loading…</div>
      ) : (
        <div className="card">
          <div className="card-body p-0 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-sand3">
                  <th className="text-left py-2 px-4 text-xs font-extrabold uppercase tracking-widest text-ink3">
                    Name
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-extrabold uppercase tracking-widest text-ink3 hidden sm:table-cell">
                    Role
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-extrabold uppercase tracking-widest text-ink3 hidden md:table-cell">
                    VCOS User
                  </th>
                  <th className="text-center py-2 px-3 text-xs font-extrabold uppercase tracking-widest text-ink3">
                    Report
                  </th>
                  <th className="text-center py-2 px-3 text-xs font-extrabold uppercase tracking-widest text-ink3">
                    BT
                  </th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {active.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-sand3 last:border-0 hover:bg-sand2/50"
                  >
                    <td className="py-2.5 px-4 font-bold">{m.full_name}</td>
                    <td className="py-2.5 px-3 text-xs text-ink3 hidden sm:table-cell">
                      {m.role_description ?? "-"}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-ink3 hidden md:table-cell">
                      {m.vcos_username ?? "-"}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs">
                      {m.files_report ? "✓" : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs">
                      {m.bills_hours ? "✓" : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => startEdit(m)}
                          className="text-xs text-ink4 hover:text-ink"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deactivate(m.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inactive.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-bold uppercase tracking-widest text-ink4 mb-2">
            Inactive ({inactive.length})
          </div>
          <div className="text-xs text-ink4">
            {inactive.map((m) => m.full_name).join(", ")}
          </div>
        </div>
      )}
    </div>
  );
}
