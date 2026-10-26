/**
 * ClickUp full refresh - every 15 minutes.
 * Real-time sync comes from the ClickUp webhook (app/api/clickup-webhook),
 * which patches one task at a time. This full re-fetch is the backstop: it
 * catches any webhook ClickUp failed to deliver and corrects any race between
 * two webhook patches landing at once.
 *
 * Trigger: Netlify Scheduled Functions
 */
import type { Config } from "@netlify/functions";

export default async () => {
  const base = process.env.NEXT_PUBLIC_URL ?? process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error(
      "[clickup-refresh] Missing NEXT_PUBLIC_URL or CRON_SECRET env vars",
    );
    return new Response("Missing env vars", { status: 500 });
  }

  const res = await fetch(`${base}/api/clickup-tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": secret },
  });
  console.log("[clickup-refresh]", new Date().toISOString(), res.status);
  return new Response(JSON.stringify({ ok: res.ok }), { status: 200 });
};

export const config: Config = {
  schedule: "*/15 * * * *",
};
