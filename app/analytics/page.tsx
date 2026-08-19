"use client";

import { useEffect, useState } from "react";
import { FiAlertTriangle, FiTrendingUp } from "react-icons/fi";
import StaleBadge from "@/components/StaleBadge";
import Skeleton from "@/components/Skeleton";
import TabBar from "@/components/TabBar";
import { PagesTable } from "@/components/PagesTable";
import { useRefresh } from "@/components/RefreshContext";
import {
  ANALYTICS_SITES,
  X_ACCOUNTS,
  LINKEDIN_ACCOUNTS,
  type AnalyticsSiteId,
  type XAccountId,
  type LinkedInAccountId,
} from "@/lib/constants";
import type {
  AnalyticsSnapshot,
  PageRow,
  BreakdownRow,
} from "@/lib/google-analytics";
import type { XSnapshot, XTweet } from "@/lib/x-analytics";
import type { LinkedInSnapshot } from "@/lib/linkedin-analytics";
import dynamic from "next/dynamic";
const AnalyticsSparkline = dynamic(
  () => import("@/components/charts/AnalyticsSparkline"),
  { ssr: false },
);
const AudienceTrendChart = dynamic(
  () => import("@/components/charts/AudienceTrendChart"),
  { ssr: false },
);

const BADGE_COLORS: Record<AnalyticsSiteId, string> = {
  ramprate: "#2A78D6",
  impactsoul: "#4A3AA7",
  tonygreenberg: "#1BAF7A",
};

const X_BADGE_COLORS: Record<XAccountId, string> = {
  ramprate: "#0F1419",
  tony: "#1D9BF0",
};

const LINKEDIN_BADGE_COLORS: Record<LinkedInAccountId, string> = {
  ramprate: "#0A66C2",
};

// One top-level tab per brand; Website/X/LinkedIn live as sub-tabs inside it
// instead of being separate top-level tabs, so someone unfamiliar with the
// dashboard doesn't need to already know "X · RampRate" is part of RampRate.
type TabId = "overview" | AnalyticsSiteId;

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Dashboard" },
  ...ANALYTICS_SITES.map((s) => ({ id: s.id as TabId, label: s.label })),
];

type SubTabId = "website" | "x" | "linkedin";

// Which X/LinkedIn account (if any) belongs to each brand - and the reverse,
// for routing a Dashboard-card click on an X/LinkedIn account to the right
// brand tab. Account ids don't always match the site id (X's Tony Greenberg
// account is "tony", not "tonygreenberg").
const SITE_TO_X_ACCOUNT: Partial<Record<AnalyticsSiteId, XAccountId>> = {
  ramprate: "ramprate",
  tonygreenberg: "tony",
};
const SITE_TO_LINKEDIN_ACCOUNT: Partial<Record<AnalyticsSiteId, LinkedInAccountId>> = {
  ramprate: "ramprate",
};
const X_ACCOUNT_TO_SITE: Record<XAccountId, AnalyticsSiteId> = {
  ramprate: "ramprate",
  tony: "tonygreenberg",
};
const LINKEDIN_ACCOUNT_TO_SITE: Record<LinkedInAccountId, AnalyticsSiteId> = {
  ramprate: "ramprate",
};
// Tony Greenberg's personal LinkedIn has no working data pipeline (see
// lib/linkedin-analytics.ts) - his LinkedIn sub-tab shows a static
// explanation instead of a live snapshot.
const LINKEDIN_INFO_ONLY_SITES: Partial<Record<AnalyticsSiteId, boolean>> = {
  tonygreenberg: true,
};

type SnapshotState = AnalyticsSnapshot & {
  error?: string | null;
  circuitOpen?: boolean;
  _stale?: boolean;
  _ageMinutes?: number;
};

type XSnapshotState = XSnapshot & {
  error?: string | null;
  circuitOpen?: boolean;
  _stale?: boolean;
  _ageMinutes?: number;
};

type LinkedInSnapshotState = LinkedInSnapshot & {
  error?: string | null;
  circuitOpen?: boolean;
  _stale?: boolean;
  _ageMinutes?: number;
};

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function pctDelta(
  today: number,
  yesterday: number,
): { label: string; up: boolean } | null {
  if (!yesterday) return null;
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  return {
    label: `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs yesterday`,
    up: pct >= 0,
  };
}

function BreakdownList({
  title,
  rows,
  color,
}: {
  title: string;
  rows: BreakdownRow[];
  color: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.pageviews));
  return (
    <div className="card px-4">
      <div className="slbl text-xs">{title}</div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink4 py-3">No data yet.</p>
      ) : (
        <div className="space-y-2 pb-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 sm:gap-3">
              <span
                className="text-xs w-16 sm:w-24 truncate flex-shrink-0"
                title={r.label}
              >
                {r.label}
              </span>
              <div className="flex-1 progress-track min-w-0">
                <div
                  className="progress-fill"
                  style={{
                    width: `${(r.pageviews / max) * 100}%`,
                    background: color,
                  }}
                />
              </div>
              <span className="text-xs text-ink3 tabular-nums w-12 sm:w-16 text-right flex-shrink-0">
                {r.pageviews.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dashboard tab - the condensed, most-important-things-only overview ──────
function OverviewPanel({
  snapshots,
  xSnapshots,
  linkedInSnapshots,
  loading,
  onOpenBrand,
}: {
  snapshots: Record<AnalyticsSiteId, SnapshotState | null>;
  xSnapshots: Record<XAccountId, XSnapshotState | null>;
  linkedInSnapshots: Record<LinkedInAccountId, LinkedInSnapshotState | null>;
  loading: boolean;
  onOpenBrand: (site: AnalyticsSiteId, subTab: SubTabId) => void;
}) {
  const errorSites = ANALYTICS_SITES.filter(
    (s) => (snapshots[s.id]?.notFoundPages.length ?? 0) > 0,
  );

  return (
    <section>
      {errorSites.length > 0 && (
        <div className="alert alert-red mb-4">
          <FiAlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {errorSites
              .map(
                (s) => `${s.label} (${snapshots[s.id]?.notFoundPages.length})`,
              )
              .join(", ")}{" "}
            - 404 pages detected this week.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ANALYTICS_SITES.map((s) => {
          const snap = snapshots[s.id];
          const sessionsDelta = snap
            ? pctDelta(snap.today?.sessions ?? 0, snap.yesterday?.sessions ?? 0)
            : null;
          return (
            <button
              key={s.id}
              onClick={() => onOpenBrand(s.id, "website")}
              className="card text-left px-4 py-3 hover:border-accent hover:shadow-card-md transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: BADGE_COLORS[s.id] }}
                />
                <span className="text-xs font-bold uppercase tracking-widest text-ink3 truncate">
                  {s.label}
                </span>
              </div>
              {loading ? (
                <>
                  <Skeleton className="h-7 w-16 mt-0.5" />
                  <Skeleton className="h-3 w-28 mt-2" />
                </>
              ) : !snap?.today ? (
                <div className="text-xs text-ink4 mt-1">
                  {snap?.error ?? "No data"}
                </div>
              ) : (
                <>
                  <div className="font-serif font-black text-2xl mt-0.5">
                    {snap.today.sessions.toLocaleString()}
                  </div>
                  <div className="text-xs text-ink4">
                    visits today · {snap.today.pageviews.toLocaleString()}{" "}
                    views
                  </div>
                  {sessionsDelta && (
                    <div
                      className={`text-xs mt-1 ${sessionsDelta.up ? "text-success" : "text-danger"}`}
                    >
                      {sessionsDelta.label}
                    </div>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-ink4 mt-3">
        Full traffic, trends, top pages, and 404s for each site are in their own
        tab above.
      </p>

      <div className="slbl mt-6">Social - X (Twitter)</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {X_ACCOUNTS.map((a) => {
          const snap = xSnapshots[a.id];
          return (
            <button
              key={a.id}
              onClick={() => onOpenBrand(X_ACCOUNT_TO_SITE[a.id], "x")}
              className="card text-left px-4 py-3 hover:border-accent hover:shadow-card-md transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: X_BADGE_COLORS[a.id] }}
                />
                <span className="text-xs font-bold uppercase tracking-widest text-ink3 truncate">
                  {a.label}
                </span>
              </div>
              {loading ? (
                <>
                  <Skeleton className="h-7 w-16 mt-0.5" />
                  <Skeleton className="h-3 w-28 mt-2" />
                </>
              ) : !snap || snap.followersCount === undefined ? (
                <div className="text-xs text-ink4 mt-1">
                  {snap?.error ?? "No data"}
                </div>
              ) : (
                <>
                  <div className="font-serif font-black text-2xl mt-0.5">
                    {snap.followersCount.toLocaleString()}
                  </div>
                  <div className="text-xs text-ink4">
                    followers · {snap.last7d.impressions.toLocaleString()}{" "}
                    impressions (7d)
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="slbl mt-6">Social - LinkedIn</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {LINKEDIN_ACCOUNTS.map((a) => {
          const snap = linkedInSnapshots[a.id];
          return (
            <button
              key={a.id}
              onClick={() => onOpenBrand(LINKEDIN_ACCOUNT_TO_SITE[a.id], "linkedin")}
              className="card text-left px-4 py-3 hover:border-accent hover:shadow-card-md transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: LINKEDIN_BADGE_COLORS[a.id] }}
                />
                <span className="text-xs font-bold uppercase tracking-widest text-ink3 truncate">
                  {a.label}
                </span>
              </div>
              {loading ? (
                <>
                  <Skeleton className="h-7 w-16 mt-0.5" />
                  <Skeleton className="h-3 w-28 mt-2" />
                </>
              ) : !snap || snap.followersCount === undefined ? (
                <div className="text-xs text-ink4 mt-1">
                  {snap?.error ?? "Not connected yet"}
                </div>
              ) : (
                <>
                  <div className="font-serif font-black text-2xl mt-0.5">
                    {snap.followersCount.toLocaleString()}
                  </div>
                  <div className="text-xs text-ink4">
                    followers ·{" "}
                    {snap.lifetime.impressions.toLocaleString()} impressions
                  </div>
                </>
              )}
            </button>
          );
        })}
        <button
          onClick={() => onOpenBrand("tonygreenberg", "linkedin")}
          className="card text-left px-4 py-3 hover:border-accent hover:shadow-card-md transition-all"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-ink4" />
            <span className="text-xs font-bold uppercase tracking-widest text-ink3 truncate">
              Tony Greenberg
            </span>
          </div>
          <div className="text-xs text-ink4 mt-1">
            Not available - platform limitation, see details
          </div>
        </button>
      </div>
    </section>
  );
}

// Mirrors SiteSection's real layout so loading doesn't jump/reflow once data arrives.
function SiteSectionSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-sand3 p-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14 mt-2" />
          </div>
        ))}
      </div>

      <div className="card px-4 py-1">
        <Skeleton className="h-3 w-40 mt-4 mb-4" />
        <Skeleton className="h-3 w-full mb-3" />
        <div className="divide-y divide-sand3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24 mt-1.5" />
              </div>
              <Skeleton className="h-3 w-28 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>

      <Skeleton className="h-3 w-40 mt-6 mb-3" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-sand3 p-2.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-10 mt-2" />
          </div>
        ))}
      </div>

      <div className="card px-4 py-4 mb-3">
        <Skeleton className="h-3 w-44 mb-3" />
        <Skeleton className="h-40 w-full" />
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card px-4 py-4">
            <Skeleton className="h-3 w-20 mb-3" />
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-3 w-full mb-2" />
            ))}
          </div>
        ))}
      </div>

      <div className="card px-4 py-4">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

function SiteSection({
  color,
  snapshot,
  loading,
}: {
  color: string;
  snapshot: SnapshotState | null;
  loading: boolean;
}) {
  const sessionsDelta = snapshot
    ? pctDelta(snapshot.today?.sessions ?? 0, snapshot.yesterday?.sessions ?? 0)
    : null;
  const pageviewsDelta = snapshot
    ? pctDelta(
        snapshot.today?.pageviews ?? 0,
        snapshot.yesterday?.pageviews ?? 0,
      )
    : null;

  return (
    <section>
      {snapshot && (
        <div className="flex items-center justify-end mb-3">
          <StaleBadge
            ageMinutes={snapshot._ageMinutes}
            circuitOpen={snapshot.circuitOpen}
            error={snapshot.error ?? undefined}
          />
        </div>
      )}

      {loading ? (
        <SiteSectionSkeleton />
      ) : !snapshot || !snapshot.today ? (
        <div className="card p-6 text-center text-ink4 text-sm">
          {snapshot?.error ?? "No data available."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Visits (today)
              </div>
              <div className="font-serif font-black text-2xl mt-0.5">
                {snapshot.today.sessions.toLocaleString()}
              </div>
              {sessionsDelta && (
                <div
                  className={`text-xs mt-0.5 ${sessionsDelta.up ? "text-success" : "text-danger"}`}
                >
                  {sessionsDelta.label}
                </div>
              )}
            </div>
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Pageviews (today)
              </div>
              <div className="font-serif font-black text-2xl mt-0.5">
                {snapshot.today.pageviews.toLocaleString()}
              </div>
              {pageviewsDelta && (
                <div
                  className={`text-xs mt-0.5 ${pageviewsDelta.up ? "text-success" : "text-danger"}`}
                >
                  {pageviewsDelta.label}
                </div>
              )}
            </div>
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Avg. time on site
              </div>
              <div className="font-serif font-black text-2xl mt-0.5">
                {fmtDuration(snapshot.today.avgSessionDurationSec)}
              </div>
            </div>
          </div>

          <div className="card px-4 pb-4">
            <div className="slbl text-xs flex items-center gap-1.5">
              <FiTrendingUp className="w-3.5 h-3.5 text-ink4" />
              Pages
            </div>

            {snapshot.notFoundPages.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-danger py-2 border-b border-sand3">
                <FiAlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {snapshot.notFoundPages.length} page
                  {snapshot.notFoundPages.length !== 1 ? "s" : ""} returning 404
                  / not-found errors this week:{" "}
                  {snapshot.notFoundPages.map((p) => p.path).join(", ")}
                </span>
              </div>
            )}

            <PagesTable rows={snapshot.topPages} />
          </div>

          {/* Audience - the "who's visiting" breakdown, last 28 days */}
          <div className="slbl mt-6">Audience - Last 28 Days</div>
          {!snapshot.audience ? (
            <div className="card p-6 text-center text-ink4 text-sm">
              This snapshot was cached before audience data was added - click
              Refresh above to load it.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                {[
                  {
                    label: "Pageviews",
                    value: snapshot.audience.last28d.pageviews,
                  },
                  {
                    label: "New Users",
                    value: snapshot.audience.last28d.newUsers,
                  },
                  {
                    label: "Sessions/User",
                    value: snapshot.audience.last28d.sessionsPerUser,
                  },
                  {
                    label: "Bounce Rate",
                    value: `${snapshot.audience.last28d.bounceRatePct}%`,
                  },
                  {
                    label: "1-Day Active",
                    value: snapshot.audience.last28d.active1DayUsers,
                  },
                  {
                    label: "28-Day Active",
                    value: snapshot.audience.last28d.active28DayUsers,
                  },
                ].map((t) => (
                  <div key={t.label} className="border border-sand3 p-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-ink3 truncate">
                      {t.label}
                    </div>
                    <div className="font-serif font-black text-lg mt-0.5">
                      {typeof t.value === "number"
                        ? t.value.toLocaleString()
                        : t.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="card px-4 pt-4 pb-2 mb-3">
                <div className="slbl mb-0 text-xs">
                  Views &amp; New Users - Last 29 Days
                </div>
                <AudienceTrendChart
                  data={snapshot.audience.trend}
                  color={color}
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <BreakdownList
                  title="By Language"
                  rows={snapshot.audience.byLanguage}
                  color={color}
                />
                <BreakdownList
                  title="By Continent"
                  rows={snapshot.audience.byContinent}
                  color={color}
                />
                <BreakdownList
                  title="By Device"
                  rows={snapshot.audience.byDevice}
                  color={color}
                />
              </div>
            </>
          )}

          <div className="card px-4 pt-4 pb-2 mt-6">
            <div className="slbl mb-0 text-xs">Visits</div>
            <AnalyticsSparkline data={snapshot.trend} color={color} />
          </div>
        </>
      )}
    </section>
  );
}

function XTweetRow({ tweet }: { tweet: XTweet }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 py-3 overflow-hidden">
      <div className="min-w-0">
        <div className="text-sm truncate" title={tweet.text}>
          {tweet.text}
        </div>
        <div className="text-xs text-ink4">
          {new Date(tweet.createdAt).toLocaleDateString()}
        </div>
      </div>
      <div className="flex items-center flex-wrap gap-1.5 flex-shrink-0">
        <span className="badge-accent whitespace-nowrap">
          {tweet.impressionCount.toLocaleString()} impressions
        </span>
        <span className="badge whitespace-nowrap">
          {tweet.engagementCount.toLocaleString()} engagements
        </span>
      </div>
    </div>
  );
}

function XSection({
  color,
  snapshot,
  loading,
}: {
  color: string;
  snapshot: XSnapshotState | null;
  loading: boolean;
}) {
  return (
    <section>
      {snapshot && (
        <div className="flex items-center justify-end mb-3">
          <StaleBadge
            ageMinutes={snapshot._ageMinutes}
            circuitOpen={snapshot.circuitOpen}
            error={snapshot.error ?? undefined}
          />
        </div>
      )}

      {loading ? (
        <SiteSectionSkeleton />
      ) : !snapshot || snapshot.followersCount === undefined ? (
        <div className="card p-6 text-center text-ink4 text-sm">
          {snapshot?.error ?? "No data available."}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: color }}
            />
            <span className="text-sm font-semibold">@{snapshot.username}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Followers
              </div>
              <div className="font-serif font-black text-2xl mt-0.5">
                {snapshot.followersCount.toLocaleString()}
              </div>
            </div>
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Tweets (7d)
              </div>
              <div className="font-serif font-black text-2xl mt-0.5">
                {snapshot.last7d.tweetsPosted.toLocaleString()}
              </div>
            </div>
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Impressions (7d)
              </div>
              <div className="font-serif font-black text-2xl mt-0.5">
                {snapshot.last7d.impressions.toLocaleString()}
              </div>
            </div>
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Engagements (7d)
              </div>
              <div className="font-serif font-black text-2xl mt-0.5">
                {snapshot.last7d.engagements.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="card px-4">
            <div className="slbl text-xs flex items-center gap-1.5">
              <FiTrendingUp className="w-3.5 h-3.5 text-ink4" />
              Top Tweets (7d)
            </div>
            {snapshot.topTweets.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
                <p className="text-xs text-ink4">
                  No tweets in the last 7 days.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-sand3 overflow-hidden">
                {snapshot.topTweets.map((t) => (
                  <XTweetRow key={t.id} tweet={t} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function LinkedInSection({
  color,
  snapshot,
  loading,
}: {
  color: string;
  snapshot: LinkedInSnapshotState | null;
  loading: boolean;
}) {
  return (
    <section>
      {snapshot && (
        <div className="flex items-center justify-end mb-3">
          <StaleBadge
            ageMinutes={snapshot._ageMinutes}
            circuitOpen={snapshot.circuitOpen}
            error={snapshot.error ?? undefined}
          />
        </div>
      )}

      {loading ? (
        <SiteSectionSkeleton />
      ) : !snapshot || snapshot.followersCount === undefined ? (
        <div className="card p-6 text-center text-ink4 text-sm">
          {snapshot?.error ??
            "Not connected yet - needs a LinkedIn Marketing Developer Platform app (see LinkedIn · Tony Greenberg tab for the full picture)."}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: color }}
            />
            <span className="text-sm font-semibold">Company Page</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Followers
              </div>
              <div className="font-serif font-black text-2xl mt-0.5">
                {snapshot.followersCount.toLocaleString()}
              </div>
            </div>
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Impressions (lifetime)
              </div>
              <div className="font-serif font-black text-2xl mt-0.5">
                {snapshot.lifetime.impressions.toLocaleString()}
              </div>
            </div>
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Engagement (lifetime)
              </div>
              <div className="font-serif font-black text-2xl mt-0.5">
                {(
                  snapshot.lifetime.likes +
                  snapshot.lifetime.comments +
                  snapshot.lifetime.shares
                ).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Likes
              </div>
              <div className="font-serif font-black text-lg mt-0.5">
                {snapshot.lifetime.likes.toLocaleString()}
              </div>
            </div>
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Comments
              </div>
              <div className="font-serif font-black text-lg mt-0.5">
                {snapshot.lifetime.comments.toLocaleString()}
              </div>
            </div>
            <div className="border border-sand3 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-ink3">
                Shares
              </div>
              <div className="font-serif font-black text-lg mt-0.5">
                {snapshot.lifetime.shares.toLocaleString()}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// LinkedIn's API exposes no impressions/engagement data for personal
// profiles under any developer path (confirmed via Sprout Social's own
// Profile Performance report) - this isn't a "not connected yet" state like
// the other tabs, it's a platform-level dead end, so it gets a static
// explanation instead of a fake data pipeline that would just error forever.
function LinkedInTonyInfo() {
  return (
    <section>
      <div className="card p-6">
        <div className="flex items-start gap-2.5">
          <FiAlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-1">
              No API path exposes this data for personal profiles.
            </p>
            <p className="text-ink4">
              Confirmed via Sprout Social's own Profile Performance report,
              which showed follower/post counts but blank Impressions and
              Engagements. LinkedIn's official API - through any vendor,
              including a direct developer app - does not expose those
              metrics for personal profiles. Only follower/connection count
              and post count are obtainable at all, and even that requires
              going through Sprout Social; a standalone LinkedIn developer app
              gets nothing for a personal profile. This is a platform-level
              restriction, not something more engineering effort fixes.
            </p>
          </div>
        </div>
      </div>

      <div className="card px-4 py-4 mt-3">
        <div className="slbl text-xs mb-2">RampRate's Company Page</div>
        <p className="text-sm text-ink4">
          Unlike Tony's personal profile, the Company Page is fully capable of
          automation - see the "LinkedIn · RampRate" tab. It's not connected
          yet because it needs one of two paths, and the choice (cost vs.
          wait time) isn't a dev decision:
        </p>
        <ul className="text-sm text-ink4 mt-2 space-y-1.5 list-disc pl-5">
          <li>
            Apply for LinkedIn's Marketing Developer Platform at{" "}
            <span className="font-mono text-ink3">developer.linkedin.com</span>{" "}
            under RampRate's Company Page - free, but approval typically takes
            1-4 months and isn't guaranteed.
          </li>
          <li>
            Upgrade Sprout Social from Essentials ($99/mo) to Advanced
            ($499/mo) to unlock their Public API - faster, and also the only
            way to get Tony's limited follower/post-count numbers flowing
            automatically.
          </li>
        </ul>
      </div>
    </section>
  );
}

// One brand's whole picture - Website always present, X/LinkedIn sub-tabs
// only shown when that brand actually has an account, so RampRate gets all
// three but ImpactSoul (no social pipeline yet) only ever shows Website.
function BrandSection({
  site,
  subTab,
  onSubTabChange,
  snapshot,
  xSnapshot,
  linkedInSnapshot,
  loading,
}: {
  site: AnalyticsSiteId;
  subTab: SubTabId;
  onSubTabChange: (t: SubTabId) => void;
  snapshot: SnapshotState | null;
  xSnapshot: XSnapshotState | null;
  linkedInSnapshot: LinkedInSnapshotState | null;
  loading: boolean;
}) {
  const xAccount = SITE_TO_X_ACCOUNT[site];
  const linkedInAccount = SITE_TO_LINKEDIN_ACCOUNT[site];
  const linkedInInfoOnly = LINKEDIN_INFO_ONLY_SITES[site];

  const subTabs: { id: SubTabId; label: string }[] = [
    { id: "website", label: "Website" },
    ...(xAccount ? [{ id: "x" as SubTabId, label: "X (Twitter)" }] : []),
    ...(linkedInAccount || linkedInInfoOnly
      ? [{ id: "linkedin" as SubTabId, label: "LinkedIn" }]
      : []),
  ];

  return (
    <section>
      {subTabs.length > 1 && (
        <div className="mb-4">
          <TabBar tabs={subTabs} active={subTab} onChange={onSubTabChange} />
        </div>
      )}

      {subTab === "website" && (
        <SiteSection color={BADGE_COLORS[site]} snapshot={snapshot} loading={loading} />
      )}
      {subTab === "x" && xAccount && (
        <XSection
          color={X_BADGE_COLORS[xAccount]}
          snapshot={xSnapshot}
          loading={loading}
        />
      )}
      {subTab === "linkedin" &&
        (linkedInInfoOnly ? (
          <LinkedInTonyInfo />
        ) : (
          linkedInAccount && (
            <LinkedInSection
              color={LINKEDIN_BADGE_COLORS[linkedInAccount]}
              snapshot={linkedInSnapshot}
              loading={loading}
            />
          )
        ))}
    </section>
  );
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const [subTab, setSubTab] = useState<SubTabId>("website");
  const [snapshots, setSnapshots] = useState<
    Record<AnalyticsSiteId, SnapshotState | null>
  >({} as Record<AnalyticsSiteId, SnapshotState | null>);
  const [xSnapshots, setXSnapshots] = useState<
    Record<XAccountId, XSnapshotState | null>
  >({} as Record<XAccountId, XSnapshotState | null>);
  const [linkedInSnapshots, setLinkedInSnapshots] = useState<
    Record<LinkedInAccountId, LinkedInSnapshotState | null>
  >({} as Record<LinkedInAccountId, LinkedInSnapshotState | null>);
  const [loading, setLoading] = useState(true);
  const { refreshKey } = useRefresh();

  function openBrand(site: AnalyticsSiteId, sub: SubTabId) {
    setTab(site);
    setSubTab(sub);
  }

  async function fetchSites(ids: AnalyticsSiteId[]) {
    setLoading(true);
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/analytics?site=${id}`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ),
    );
    setSnapshots((prev) => ({
      ...prev,
      ...Object.fromEntries(ids.map((id, i) => [id, results[i]])),
    }));
    setLoading(false);
  }

  async function fetchXAccounts(ids: XAccountId[]) {
    setLoading(true);
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/x-analytics?account=${id}`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ),
    );
    setXSnapshots((prev) => ({
      ...prev,
      ...Object.fromEntries(ids.map((id, i) => [id, results[i]])),
    }));
    setLoading(false);
  }

  async function fetchLinkedInAccounts(ids: LinkedInAccountId[]) {
    setLoading(true);
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/linkedin-analytics?account=${id}`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ),
    );
    setLinkedInSnapshots((prev) => ({
      ...prev,
      ...Object.fromEntries(ids.map((id, i) => [id, results[i]])),
    }));
    setLoading(false);
  }

  // Refetches whenever the header's global "Refresh" button bumps refreshKey
  // (which also live-refreshes the underlying GA4/X/LinkedIn caches - see
  // Topbar.tsx). A brand tab loads Website + its X/LinkedIn accounts (if any)
  // together up front, so switching sub-tabs inside it is instant - no extra
  // network round trip per sub-tab click.
  useEffect(() => {
    if (tab === "overview") {
      fetchSites(ANALYTICS_SITES.map((s) => s.id));
      fetchXAccounts(X_ACCOUNTS.map((a) => a.id));
      fetchLinkedInAccounts(LINKEDIN_ACCOUNTS.map((a) => a.id));
      return;
    }
    fetchSites([tab]);
    const xAccount = SITE_TO_X_ACCOUNT[tab];
    if (xAccount) fetchXAccounts([xAccount]);
    const linkedInAccount = SITE_TO_LINKEDIN_ACCOUNT[tab];
    if (linkedInAccount) fetchLinkedInAccounts([linkedInAccount]);
  }, [tab, refreshKey]);

  return (
    <div>
      <div className="mt-6 mb-1">
        <TabBar
          tabs={TABS}
          active={tab}
          onChange={(t) => {
            setTab(t);
            setSubTab("website");
          }}
        />
      </div>

      <div className="mt-4">
        {tab === "overview" ? (
          <OverviewPanel
            snapshots={snapshots}
            xSnapshots={xSnapshots}
            linkedInSnapshots={linkedInSnapshots}
            loading={loading}
            onOpenBrand={openBrand}
          />
        ) : (
          <BrandSection
            site={tab}
            subTab={subTab}
            onSubTabChange={setSubTab}
            snapshot={snapshots[tab] ?? null}
            xSnapshot={
              SITE_TO_X_ACCOUNT[tab]
                ? (xSnapshots[SITE_TO_X_ACCOUNT[tab]!] ?? null)
                : null
            }
            linkedInSnapshot={
              SITE_TO_LINKEDIN_ACCOUNT[tab]
                ? (linkedInSnapshots[SITE_TO_LINKEDIN_ACCOUNT[tab]!] ?? null)
                : null
            }
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}
