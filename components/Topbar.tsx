"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRefresh } from "./RefreshContext";
import { useMe } from "@/hooks/useMe";
import { RAMPRATE_LOGO_B64 } from "@/lib/logo";
import { ANALYTICS_SITES, X_ACCOUNTS, LINKEDIN_ACCOUNTS } from "@/lib/constants";
import { FiRefreshCw } from "react-icons/fi";

export default function Topbar() {
  const { me } = useMe();
  const [dateStr, setDateStr] = useState("");
  const { triggerRefresh } = useRefresh();
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    );
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      fetch("/api/clickup-tasks", { method: "POST" }),
      fetch("/api/slack-stats", { method: "POST" }),
      fetch("/api/webwork", { method: "POST" }),
      fetch("/api/fireflies-meetings", { method: "POST" }),
      ...ANALYTICS_SITES.map((s) =>
        fetch(`/api/analytics?site=${s.id}`, { method: "POST" }),
      ),
      ...X_ACCOUNTS.map((a) =>
        fetch(`/api/x-analytics?account=${a.id}`, { method: "POST" }),
      ),
      ...LINKEDIN_ACCOUNTS.map((a) =>
        fetch(`/api/linkedin-analytics?account=${a.id}`, { method: "POST" }),
      ),
    ]);
    triggerRefresh();
    setRefreshing(false);
  }, [triggerRefresh]);

  // ── Self-heal ────────────────────────────────────────────────────────────
  // The daily Netlify scheduled refresh (netlify/functions/cron-refresh.ts) can
  // silently stop firing (it has before - cache went 18 days stale with no
  // alert). Rather than depend solely on that external cron, whoever opens the
  // app checks whether the cache is badly stale (not the routine few-minutes
  // staleness the SWR cache expects, but a sign the daily job actually missed
  // a day) and triggers the same live refresh the button above does. Gated by
  // a per-browser cooldown so a still-broken upstream API isn't hammered.
  useEffect(() => {
    const STALE_MINUTES_THRESHOLD = 12 * 60; // routine cache age is fine; only self-heal once the daily job has clearly missed
    const COOLDOWN_MS = 6 * 60 * 60 * 1000;
    const STORAGE_KEY = "vcos-auto-heal-at";
    const SOURCES = [
      "clickup-tasks",
      "slack-stats",
      "webwork",
      "fireflies-meetings",
    ];

    let lastAttempt = 0;
    try {
      lastAttempt = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
    } catch {
      /* private mode */
    }
    if (Date.now() - lastAttempt < COOLDOWN_MS) return;

    Promise.all(
      SOURCES.map((s) =>
        fetch(`/api/${s}`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ),
    ).then((results) => {
      const needsHeal = results.some(
        (r) =>
          r &&
          typeof r._ageMinutes === "number" &&
          r._ageMinutes > STALE_MINUTES_THRESHOLD,
      );
      if (!needsHeal) return;
      try {
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        /* private mode */
      }
      Promise.allSettled(
        SOURCES.map((s) => fetch(`/api/${s}`, { method: "POST" })),
      ).then(() => triggerRefresh());
    });
  }, [triggerRefresh]);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

  return (
    <div className="bg-ink text-white h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-40 shadow-md">
      {/* Brand */}
      <div className="flex items-center gap-3 min-w-0">
        <img
          src={RAMPRATE_LOGO_B64}
          alt="RampRate"
          className="h-8 w-auto object-contain"
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <span className="hidden sm:block text-sm font-medium text-white/60 truncate">
          Visual Chief of Staff
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
        {/* Date - hidden on mobile */}
        <span className="hidden md:block text-sm text-white/60">{dateStr}</span>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="hidden sm:block text-sm font-medium text-green-600">
            Live
          </span>
        </div>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
          title="Refresh all data"
        >
          <FiRefreshCw
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
          />
          <span className="hidden sm:inline">
            {refreshing ? "Refreshing…" : "Refresh"}
          </span>
        </button>

        {/* User + Sign out */}
        {me && (
          <div className="flex items-center gap-2 pl-3 border-l border-white/20">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-semibold text-white">
                {me.username}
              </span>
              <span className="text-xs text-white/50 capitalize">
                {me.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg border border-white/20 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
