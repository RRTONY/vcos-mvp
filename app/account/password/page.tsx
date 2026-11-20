"use client";

import { useState } from "react";
import Spinner from "@/components/Spinner";

const INPUT =
  "w-full border border-sand3 bg-white px-4 py-3 text-base focus:outline-none focus:border-ink transition-colors";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("The two new passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        setCurrent("");
        setNew("");
        setConfirm("");
      } else {
        setError(d.error ?? "Could not change password");
      }
    } catch {
      setError("Network error - try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto py-10 px-4">
      <h1 className="text-2xl font-extrabold mb-1">Change password</h1>
      <p className="text-sm text-ink4 mb-6">At least 12 characters.</p>

      {done && (
        <div className="text-sm text-green-800 bg-green-50 border border-green-200 px-3 py-2 mb-4">
          Password changed. Use the new one next time you sign in.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="current" className="field-label">Current password</label>
          <input id="current" type="password" autoComplete="current-password" required
            value={currentPassword} onChange={(e) => setCurrent(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="new" className="field-label">New password</label>
          <input id="new" type="password" autoComplete="new-password" required minLength={12}
            value={newPassword} onChange={(e) => setNew(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="confirm" className="field-label">New password again</label>
          <input id="confirm" type="password" autoComplete="new-password" required minLength={12}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} className={INPUT} />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>
        )}

        <button type="submit" disabled={loading}
          className="w-full bg-ink text-sand font-bold text-base py-4 hover:bg-ink2 transition-colors disabled:opacity-50">
          {loading ? <Spinner label="Saving" /> : "Change password"}
        </button>
      </form>
    </div>
  );
}
