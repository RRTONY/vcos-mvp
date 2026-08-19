import { authTest } from "./slack";
import { pingUser } from "./clickup";
import { pingFireflies } from "./fireflies";

export type SystemStatusLevel = "green" | "amber" | "red";

export interface SystemResult {
  system: string;
  status: SystemStatusLevel;
  detail: string;
  manual?: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

async function checkSlack(): Promise<SystemResult> {
  if (!process.env.SLACK_BOT_TOKEN)
    return { system: "Slack", status: "amber", detail: "Token not configured" };
  try {
    const d = await authTest();
    return {
      system: "Slack",
      status: d.ok ? "green" : "red",
      detail: d.ok ? `Connected as ${d.user}` : (d.error ?? "Auth failed"),
    };
  } catch (e) {
    return {
      system: "Slack",
      status: "red",
      detail: e instanceof Error ? e.message : "Error",
    };
  }
}

async function checkClickUp(): Promise<SystemResult> {
  if (!process.env.CLICKUP_API_KEY)
    return {
      system: "ClickUp",
      status: "amber",
      detail: "API key not configured",
    };
  try {
    const d = await pingUser();
    return {
      system: "ClickUp",
      status: d.user ? "green" : "red",
      detail: d.user ? `Authed as ${d.user.username}` : "Auth failed",
    };
  } catch (e) {
    return {
      system: "ClickUp",
      status: "red",
      detail: e instanceof Error ? e.message : "Error",
    };
  }
}

async function checkFireflies(): Promise<SystemResult> {
  if (!process.env.FIREFLIES_API_KEY)
    return {
      system: "Fireflies",
      status: "amber",
      detail: "API key not configured",
    };
  try {
    const d = await pingFireflies();
    const ok = d.data?.user;
    return {
      system: "Fireflies",
      status: ok ? "green" : "amber",
      detail: ok ? `Connected as ${d.data.user.name}` : "Auth issue",
    };
  } catch (e) {
    return {
      system: "Fireflies",
      status: "red",
      detail: e instanceof Error ? e.message : "Error",
    };
  }
}

// Live-checks Slack/ClickUp/Fireflies auth and reports Netlify as always up
// (this code is running on it). Each check degrades to amber/red instead of
// throwing, so this never rejects.
export async function buildSystemsStatusSnapshot(): Promise<{
  systems: SystemResult[];
}> {
  const [slack, clickup, fireflies] = await Promise.all([
    checkSlack(),
    checkClickUp(),
    checkFireflies(),
  ]);
  return {
    systems: [
      {
        system: "Netlify",
        status: "green",
        detail: "Functions running normally",
      },
      slack,
      clickup,
      fireflies,
    ],
  };
}
