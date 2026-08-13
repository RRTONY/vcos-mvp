/**
 * Scheduled VCoS-AI morning brief.
 * Generates the /gm brief and posts it to Slack each weekday morning, so the
 * team gets it before anyone opens the app.
 *
 * Schedule: 7:15 AM PDT (14:15 UTC), Mon–Fri - runs just after the hourly
 *           cron-refresh so it works off fresh data.
 * Trigger:  Netlify Scheduled Functions → POST /api/cron/morning-brief
 */
import type { Config } from "@netlify/functions";

export default async function handler() {
  const baseUrl = (
    process.env.NEXT_PUBLIC_URL ??
    process.env.URL ??
    ""
  ).replace(/\/$/, "");
  const secret = process.env.CRON_SECRET ?? "";

  if (!baseUrl || !secret) {
    console.error("[morning-brief] Missing NEXT_PUBLIC_URL or CRON_SECRET");
    return new Response("Missing env vars", { status: 500 });
  }

  const res = await fetch(`${baseUrl}/api/cron/morning-brief`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": secret },
  });

  const data = await res.json().catch(() => ({}));
  console.log(
    "[morning-brief]",
    new Date().toISOString(),
    JSON.stringify(data),
  );
  return new Response(JSON.stringify(data), { status: res.status });
}

export const config: Config = {
  // 14:15 UTC = 7:15 AM PDT (UTC-7). Change to 15:15 UTC in winter (PST).
  schedule: "15 14 * * 1-5",
};
