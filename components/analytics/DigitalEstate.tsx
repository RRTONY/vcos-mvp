"use client";

// "Digital Estate" band at the top of Analytics > Overview: Tony's Nov 27
// request for one protected portal, dashboard first, midnight/violet. Uses the
// snapshots the page already loaded (no extra API calls). Every figure comes
// from GA4 / X / LinkedIn; anything without a live source is listed as "Not
// connected yet", never shown as zero (VCoS rule: live data only).
import Sparkline from "@/components/Sparkline";
import Skeleton from "@/components/Skeleton";
import {
  ANALYTICS_SITES,
  LINKEDIN_ACCOUNTS,
  X_ACCOUNTS,
  type AnalyticsSiteId,
  type LinkedInAccountId,
  type XAccountId,
} from "@/lib/constants";
import type { AnalyticsSnapshot } from "@/lib/google-analytics";
import type { XSnapshot } from "@/lib/x-analytics";
import type { LinkedInSnapshot } from "@/lib/linkedin-analytics";
import {
  NOT_CONNECTED,
  compareWeeks,
  gaToday,
  type WeekCompare,
} from "@/lib/digital-estate";

type Loaded<T> = (T & { error?: string | null; _ageMinutes?: number }) | null;

const nf = new Intl.NumberFormat("en-US");
const fmt = (n: number) => nf.format(Math.round(n));
const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });

function Change({ c }: { c: WeekCompare }) {
  const up = c.sessionsChange > 0;
  const same = c.sessionsChange === 0;
  const pct =
    c.sessionsChangePct === null ? "" : ` (${up ? "+" : ""}${Math.round(c.sessionsChangePct)}%)`;
  return (
    <span
      className={`text-xs font-semibold ${
        same ? "text-violet-200/70" : up ? "text-emerald-300" : "text-amber-300"
      }`}
    >
      {up ? "+" : ""}
      {fmt(c.sessionsChange)}
      {pct} vs prior 7 days
    </span>
  );
}

function SiteTile({
  label,
  snap,
  loading,
}: {
  label: string;
  snap: Loaded<AnalyticsSnapshot>;
  loading: boolean;
}) {
  const trend = snap?.audience?.trend ?? [];
  const c = trend.length ? compareWeeks(trend, gaToday()) : null;
  return (
    <div className="rounded-xl border border-violet-300/20 bg-white/[0.06] px-4 py-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-violet-200 truncate">
          {label}
        </span>
        {c?.flag && (
          <span
            className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${
              c.flag === "up"
                ? "bg-emerald-400/15 text-emerald-300"
                : "bg-amber-400/15 text-amber-300"
            }`}
          >
            {c.flag === "up" ? "Rising" : "Watch"}
          </span>
        )}
      </div>
      {loading && !snap ? (
        <>
          <Skeleton className="h-7 w-20 mt-2 !bg-white/15" />
          <Skeleton className="h-3 w-36 mt-2 !bg-white/10" />
        </>
      ) : !c ? (
        <p className="text-xs text-violet-200/80 mt-2">
          {snap?.error ? `No data: ${snap.error}` : "Not enough data yet for a weekly comparison."}
        </p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3 mt-1">
            <div>
              <div className="font-display font-extrabold text-[26px] leading-tight text-white">
                {fmt(c.current.sessions)}
              </div>
              <div className="text-[11px] text-violet-200/80">
                visits, {fmtDay(c.from)} to {fmtDay(c.to)}
              </div>
            </div>
            <Sparkline
              values={trend.map((d) => d.sessions)}
              color="#C4B5FD"
              width={90}
              height={28}
            />
          </div>
          <div className="mt-1.5">
            <Change c={c} />
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-violet-100/90">
            <span>
              <b className="text-white">{fmt(c.current.views)}</b> page views
            </span>
            <span>
              <b className="text-white">{fmt(c.current.newUsers)}</b> new visitors
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function SocialTile({
  label,
  followers,
  detail,
  loading,
  error,
}: {
  label: string;
  followers: number | null;
  detail: string | null;
  loading: boolean;
  error?: string | null;
}) {
  return (
    <div className="rounded-xl border border-violet-300/20 bg-white/[0.06] px-4 py-3 min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-widest text-violet-200 truncate">
        {label}
      </div>
      {loading && followers === null ? (
        <Skeleton className="h-6 w-16 mt-2 !bg-white/15" />
      ) : followers === null ? (
        <p className="text-xs text-violet-200/80 mt-2">{error ? `No data: ${error}` : "No data"}</p>
      ) : (
        <>
          <div className="font-display font-extrabold text-xl text-white mt-1">
            {fmt(followers)}{" "}
            <span className="text-[11px] font-semibold text-violet-200/80">followers</span>
          </div>
          {detail && <div className="text-[11px] text-violet-100/90 mt-0.5">{detail}</div>}
        </>
      )}
    </div>
  );
}

export default function DigitalEstate({
  snapshots,
  xSnapshots,
  linkedInSnapshots,
  loading,
}: {
  snapshots: Record<AnalyticsSiteId, Loaded<AnalyticsSnapshot>>;
  xSnapshots: Record<XAccountId, Loaded<XSnapshot>>;
  linkedInSnapshots: Record<LinkedInAccountId, Loaded<LinkedInSnapshot>>;
  loading: boolean;
}) {
  const flagged = ANALYTICS_SITES.filter((s) => {
    const t = snapshots[s.id]?.audience?.trend;
    return t?.length ? compareWeeks(t, gaToday())?.flag : false;
  }).length;

  return (
    <section
      aria-labelledby="digital-estate-title"
      className="rounded-2xl px-4 sm:px-6 py-5 mb-6 text-white"
      style={{
        background:
          "radial-gradient(900px 300px at 90% -10%, #4C3A9E 0, transparent 60%), linear-gradient(135deg, #0E0B24, #1E1650)",
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">
            Digital Estate
          </div>
          <h2 id="digital-estate-title" className="font-display font-extrabold text-xl sm:text-2xl mt-1">
            Websites and social, last 7 days
          </h2>
        </div>
        <p className="text-xs text-violet-200/80">
          {flagged > 0
            ? `${flagged} site${flagged > 1 ? "s" : ""} moved 25% or more this week`
            : "No site moved 25% or more this week"}
          . Source: Google Analytics, X, LinkedIn.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        {ANALYTICS_SITES.map((s) => (
          <SiteTile key={s.id} label={s.label} snap={snapshots[s.id] ?? null} loading={loading} />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        {X_ACCOUNTS.map((a) => {
          const x = xSnapshots[a.id] ?? null;
          return (
            <SocialTile
              key={`x-${a.id}`}
              label={`X · ${a.label}`}
              followers={x && !x.error ? x.followersCount : null}
              detail={x && !x.error ? `${fmt(x.last7d.impressions)} impressions, ${fmt(x.last7d.tweetsPosted)} posts in 7 days` : null}
              loading={loading}
              error={x?.error}
            />
          );
        })}
        {LINKEDIN_ACCOUNTS.map((a) => {
          const l = linkedInSnapshots[a.id] ?? null;
          return (
            <SocialTile
              key={`li-${a.id}`}
              label={`LinkedIn · ${a.label}`}
              followers={l && !l.error ? l.followersCount : null}
              detail={l && !l.error ? `${fmt(l.lifetime.impressions)} impressions all time` : null}
              loading={loading}
              error={l?.error}
            />
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-violet-300/30 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-widest text-violet-300">
          Not connected yet
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {NOT_CONNECTED.map((label) => (
            <li
              key={label}
              className="text-[11px] font-semibold rounded-full px-2.5 py-1 bg-white/[0.07] text-violet-100"
            >
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
