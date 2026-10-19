"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { SkeletonRows } from "@/components/Skeleton";

function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        // Hard navigation (not router.push) so the browser does a full reload
        // that carries the freshly-set session cookie through middleware.
        // A soft navigation can be served from cache before the cookie is
        // readable, leaving the user stuck on the login page.
        window.location.assign(from);
      } else {
        const d = await res.json();
        setError(d.error ?? "Invalid credentials");
      }
    } catch {
      setError("Network error - try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Brand */}
      <div className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <BrandMark size={48} />
        </div>
        <h1 className="text-2xl font-extrabold">Visual Chief of Staff</h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="field-label">
            Username or Email
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border border-sand3 bg-white px-4 py-3 text-base focus:outline-none focus:border-ink transition-colors"
            placeholder="username or email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-sand3 bg-white px-4 py-3 text-base focus:outline-none focus:border-ink transition-colors"
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ink text-sand font-bold text-base py-4 hover:bg-ink2 transition-colors disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <p className="text-center text-xs text-ink4 mt-6">
        Access restricted to team members
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={2} className="w-full max-w-sm" />}>
      <LoginForm />
    </Suspense>
  );
}
