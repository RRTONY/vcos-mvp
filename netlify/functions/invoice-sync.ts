/**
 * Invoice ClickUp Sync - runs daily at 8 AM PDT (15:00 UTC).
 * Polls the ClickUp invoice list for tasks moved to a "done/paid/closed" status
 * and marks the matching Supabase invoice as paid.
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
    console.error("[invoice-sync] Missing NEXT_PUBLIC_URL or CRON_SECRET");
    return new Response("Missing env vars", { status: 500 });
  }

  const res = await fetch(`${baseUrl}/api/invoices/sync-clickup`, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });

  const data = await res.json();
  console.log("[invoice-sync]", new Date().toISOString(), JSON.stringify(data));
  return new Response(JSON.stringify(data), { status: res.status });
}

export const config: Config = {
  // 7 AM PDT (UTC-7) = 14:00 UTC. Change to 15:00 UTC Nov–Mar (PST).
  schedule: "0 14 * * *",
};
