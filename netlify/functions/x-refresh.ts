/**
 * X (Twitter) cache refresh - runs every 20 min for both tracked accounts
 * (RampRate, Tony Greenberg). Separate from cron-refresh.ts (which runs once
 * daily) because X's pay-per-usage billing was specifically sized around
 * polling every 15-30 min, not once a day.
 *
 * Schedule: every 20 min
 * Trigger:  Netlify Scheduled Functions
 */
import type { Config } from "@netlify/functions";

const ACCOUNTS = ["ramprate", "tony"] as const;

export default async () => {
  const base = process.env.NEXT_PUBLIC_URL ?? process.env.URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error("[x-refresh] Missing NEXT_PUBLIC_URL or CRON_SECRET env vars");
    return new Response("Missing env vars", { status: 500 });
  }

  const headers = {
    "Content-Type": "application/json",
    "x-cron-secret": secret,
  };

  const results = await Promise.allSettled(
    ACCOUNTS.map((account) =>
      fetch(`${base}/api/x-analytics?account=${account}`, {
        method: "POST",
        headers,
      }),
    ),
  );

  const log = results.map((r, i) => {
    const name = ACCOUNTS[i];
    if (r.status === "fulfilled") return `${name}: ${r.value.status}`;
    return `${name}: ERROR - ${r.reason}`;
  });

  console.log("[x-refresh]", new Date().toISOString(), log.join(" | "));
  return new Response(JSON.stringify({ ok: true, log }), { status: 200 });
};

export const config: Config = {
  schedule: "*/20 * * * *",
};
