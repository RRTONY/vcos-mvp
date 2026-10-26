// One-time setup - run with: node scripts/register-clickup-webhook.mjs [url]
// Registers a ClickUp webhook that calls VCoS whenever a task changes, so VCoS
// stays in sync with ClickUp in real time. Prints the webhook secret - set it
// as CLICKUP_WEBHOOK_SECRET in Netlify (and redeploy) or every call is rejected.
// Re-running lists existing webhooks first so you don't register duplicates.
// Reads CLICKUP_API_KEY + CLICKUP_WORKSPACE_ID from .env.

import { readFileSync } from "fs";

// Parse .env manually (no dotenv needed)
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^"|"$/g, ""),
      ];
    }),
);

const endpoint =
  process.argv[2] ?? "https://vcos-ramprate.netlify.app/api/clickup-webhook";
const teamId = env.CLICKUP_WORKSPACE_ID ?? "10643959";
const headers = {
  Authorization: env.CLICKUP_API_KEY,
  "Content-Type": "application/json",
};
const BASE = `https://api.clickup.com/api/v2/team/${teamId}/webhook`;

const existing = await fetch(BASE, { headers }).then((r) => r.json());
const match = (existing.webhooks ?? []).find((w) => w.endpoint === endpoint);
if (match) {
  console.log(`⏭  Webhook already registered for ${endpoint}`);
  console.log(`   id: ${match.id}  health: ${JSON.stringify(match.health)}`);
  console.log(`   secret: ${match.secret}`);
  // ClickUp suspends a webhook after repeated failed deliveries (e.g. before
  // the endpoint was deployed or the secret was set) - switch it back on.
  if (match.health?.status && match.health.status !== "active") {
    const r = await fetch(`https://api.clickup.com/api/v2/webhook/${match.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ status: "active" }),
    });
    console.log(r.ok ? "✓ Reactivated" : `✗ Reactivate failed (${r.status})`);
  }
  process.exit(0);
}

const res = await fetch(BASE, {
  method: "POST",
  headers,
  body: JSON.stringify({
    endpoint,
    events: [
      "taskCreated",
      "taskUpdated",
      "taskDeleted",
      "taskStatusUpdated",
      "taskAssigneeUpdated",
      "taskDueDateUpdated",
      "taskPriorityUpdated",
      "taskMoved",
    ],
  }),
});
const data = await res.json();
if (!res.ok) {
  console.error("✗ ClickUp rejected the webhook:", data);
  process.exit(1);
}
console.log(`✓ Webhook registered for ${endpoint} (id ${data.id})`);
console.log(`  Set this in Netlify → Environment variables, then redeploy:`);
console.log(`  CLICKUP_WEBHOOK_SECRET=${data.webhook.secret}`);
