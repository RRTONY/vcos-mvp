/**
 * GA4 analytics cache refresh - runs every 15 min for all tracked sites
 * (RampRate, ImpactSoul, Tony Greenberg). Without this, the cache only
 * updates when someone clicks "Refresh" on the dashboard, so VCoS-AI's
 * analytics answers could go stale for days. Matches CACHE_TTL_ANALYTICS_MS
 * in lib/constants.ts.
 *
 * Schedule: every 15 min
 * Trigger:  Netlify Scheduled Functions
 */
import type { Config } from "@netlify/functions";

const SITES = ["ramprate", "impactsoul", "tonygreenberg"] as const;

export default async () => {
  const base = process.env.NEXT_PUBLIC_URL ?? process.env.URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error(
      "[analytics-refresh] Missing NEXT_PUBLIC_URL or CRON_SECRET env vars",
    );
    return new Response("Missing env vars", { status: 500 });
  }

  const headers = {
    "Content-Type": "application/json",
    "x-cron-secret": secret,
  };

  const results = await Promise.allSettled(
    SITES.map((site) =>
      fetch(`${base}/api/analytics?site=${site}`, {
        method: "POST",
        headers,
      }),
    ),
  );

  const log = results.map((r, i) => {
    const name = SITES[i];
    if (r.status === "fulfilled") return `${name}: ${r.value.status}`;
    return `${name}: ERROR - ${r.reason}`;
  });

  console.log("[analytics-refresh]", new Date().toISOString(), log.join(" | "));
  return new Response(JSON.stringify({ ok: true, log }), { status: 200 });
};

export const config: Config = {
  schedule: "*/15 * * * *",
};
