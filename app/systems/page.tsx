"use client";

import { useEffect, useState } from "react";
import type { IconType } from "react-icons";
import {
  FiMessageSquare,
  FiCheckSquare,
  FiMail,
  FiMic,
  FiCreditCard,
  FiBarChart2,
  FiLock,
  FiGlobe,
  FiEdit3,
  FiTrendingUp,
  FiClock,
  FiCpu,
  FiSettings,
} from "react-icons/fi";
import SystemRow from "@/components/SystemRow";
import TabBar from "@/components/TabBar";
import KeysPanel from "@/app/settings/keys/page";
import { useRefresh } from "@/components/RefreshContext";
import { useMe } from "@/hooks/useMe";
import { CLICKUP_WORKSPACE_URL } from "@/lib/constants";
import type { HealthRow } from "@/app/api/cache-health/route";

type Status = "green" | "amber" | "red";

interface SystemStatus {
  system: string;
  status: Status;
  detail: string;
  url?: string;
  notes?: string[];
  manual?: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

const STATIC_SYSTEMS: SystemStatus[] = [
  {
    system: "Slack",
    status: "green",
    detail: "",
    url: "https://app.slack.com",
  },
  {
    system: "ClickUp",
    status: "green",
    detail: "",
    url: CLICKUP_WORKSPACE_URL,
  },
  {
    system: "Gmail",
    status: "green",
    detail: "",
    url: "https://mail.google.com",
  },
  {
    system: "Fireflies",
    status: "green",
    detail: "",
    url: "https://app.fireflies.ai",
  },
  {
    system: "BILL.com",
    status: "green",
    detail: "",
    url: "https://app.bill.com",
  },
  {
    system: "QuickBooks",
    status: "green",
    detail: "",
    url: "https://qbo.intuit.com",
  },
  {
    system: "Bitwarden",
    status: "green",
    detail: "",
    url: "https://vault.bitwarden.com",
  },
  {
    system: "Netlify",
    status: "green",
    detail: "",
    url: "https://app.netlify.com",
  },
  {
    system: "Braintrust",
    status: "green",
    detail: "",
    url: "https://app.usebraintrust.com",
  },
  {
    system: "Email Meter",
    status: "green",
    detail: "",
    url: "https://emailmeter.com",
  },
  {
    system: "WebWork",
    status: "green",
    detail: "",
    url: "https://webworktracker.com",
  },
  { system: "Manus/AI", status: "green", detail: "", url: "https://manus.im" },
];

const SYSTEMS_TABS = [
  { id: "status", label: "Status" },
  { id: "keys", label: "API Keys" },
] as const;

const ICONS: Record<string, IconType> = {
  Slack: FiMessageSquare,
  ClickUp: FiCheckSquare,
  Gmail: FiMail,
  Fireflies: FiMic,
  "BILL.com": FiCreditCard,
  QuickBooks: FiBarChart2,
  Bitwarden: FiLock,
  Netlify: FiGlobe,
  Braintrust: FiEdit3,
  "Email Meter": FiTrendingUp,
  WebWork: FiClock,
  "Manus/AI": FiCpu,
};

interface SlackKPIs {
  totalMessages: number;
  activeMembers: number;
  channels: number;
}

const HEALTH_COLOR: Record<HealthRow["health"], string> = {
  ok: "bg-green-500",
  stale: "bg-amber-400",
  dead: "bg-red-500",
  never: "bg-sand3",
  circuit_open: "bg-red-500",
};

const HEALTH_TEXT: Record<HealthRow["health"], string> = {
  ok: "text-green-700",
  stale: "text-amber-600",
  dead: "text-red-600",
  never: "text-ink4",
  circuit_open: "text-red-600",
};

const HEALTH_LABEL: Record<HealthRow["health"], string> = {
  ok: "Fresh",
  stale: "Stale",
  dead: "Expired",
  never: "Never fetched",
  circuit_open: "Circuit open",
};

export default function SystemsPage() {
  const [tab, setTab] = useState<(typeof SYSTEMS_TABS)[number]["id"]>("status");
  const [systems, setSystems] = useState<SystemStatus[]>(STATIC_SYSTEMS);
  const [lastChecked, setLastChecked] = useState("");
  const [slackKPIs, setSlackKPIs] = useState<SlackKPIs | null>(null);
  const [cacheHealth, setCacheHealth] = useState<HealthRow[]>([]);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const { refreshKey } = useRefresh();
  const { isAdmin } = useMe();

  async function fetchCacheHealth() {
    const data = await fetch("/api/cache-health", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    if (data?.health) setCacheHealth(data.health);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/systems-status", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/slack-stats", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/cache-health", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([sysData, slackData, healthData]) => {
      if (sysData?.systems) {
        setSystems((prev) =>
          prev.map((s) => {
            const live = (sysData.systems as SystemStatus[]).find(
              (ls) => ls.system.toLowerCase() === s.system.toLowerCase(),
            );
            if (!live) return s;
            return {
              ...s,
              status: live.status,
              detail: live.detail,
              manual: live.manual,
              updatedBy: live.updatedBy,
              updatedAt: live.updatedAt,
            };
          }),
        );
      }
      if (slackData?.slackStats) setSlackKPIs(slackData.slackStats);
      if (healthData?.health) setCacheHealth(healthData.health);
      setLastChecked(new Date().toLocaleTimeString());
    });
  }, [refreshKey]);

  async function handleSystemEdit(
    systemName: string,
    newStatus: "green" | "amber" | "red",
    newDetail: string,
  ) {
    const res = await fetch("/api/systems-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: systemName,
        status: newStatus,
        detail: newDetail,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Save failed");
    }
    setSystems((prev) =>
      prev.map((s) =>
        s.system === systemName
          ? {
              ...s,
              status: newStatus,
              detail: newDetail,
              updatedBy: "you",
              updatedAt: new Date().toISOString(),
            }
          : s,
      ),
    );
  }

  async function handleRefresh(source: string) {
    setRefreshing(source);
    try {
      await fetch("/api/cache-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      await fetchCacheHealth();
    } finally {
      setRefreshing(null);
    }
  }

  return (
    <div>
      {isAdmin && (
        <div className="mt-6">
          <TabBar tabs={SYSTEMS_TABS} active={tab} onChange={setTab} />
        </div>
      )}

      {tab === "keys" && isAdmin ? (
        <KeysPanel />
      ) : (
        <>
          <div className="flex items-center justify-between mt-6 mb-1">
            <div className="slbl mb-0">Digital Systems Status</div>
            {lastChecked && (
              <span className="text-xs text-ink4">Checked {lastChecked}</span>
            )}
          </div>

          <div className="card">
            <div className="card-body divide-y divide-sand3 p-0 px-4">
              {systems.map((s) => (
                <SystemRow
                  key={s.system}
                  icon={ICONS[s.system] ?? FiSettings}
                  name={s.system}
                  detail={s.detail}
                  status={s.status}
                  url={s.url}
                  notes={s.notes}
                  manual={s.manual}
                  updatedBy={s.updatedBy}
                  updatedAt={s.updatedAt}
                  onSave={
                    isAdmin && s.manual
                      ? (st, det) => handleSystemEdit(s.system, st, det)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mt-6 mb-1">
            <div className="slbl mb-0">API Cache Health</div>
            {isAdmin && (
              <button
                onClick={() => handleRefresh("all")}
                disabled={refreshing !== null}
                className="btn-secondary text-xs py-1 px-3 disabled:opacity-50"
              >
                {refreshing === "all" ? "Refreshing…" : "↻ Refresh All"}
              </button>
            )}
          </div>
          <div className="card mb-6">
            <div className="card-body p-0 px-4 divide-y divide-sand3">
              {cacheHealth.length === 0 ? (
                <div className="py-3 text-sm text-ink4 animate-pulse">
                  Loading cache health…
                </div>
              ) : (
                cacheHealth.map((row) => {
                  const isProblematic = row.health !== "ok";
                  const fetchedTime = row.fetched_at
                    ? new Date(row.fetched_at).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : null;
                  return (
                    <div
                      key={row.source}
                      className="flex items-center gap-3 py-3"
                    >
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${HEALTH_COLOR[row.health]}`}
                      />
                      <span className="text-sm font-bold w-32">
                        {row.label}
                      </span>
                      <span
                        className={`text-xs font-bold w-24 ${HEALTH_TEXT[row.health]}`}
                      >
                        {HEALTH_LABEL[row.health]}
                      </span>
                      <span className="text-xs text-ink4">
                        {row.age_minutes !== null
                          ? `${row.age_minutes}m ago`
                          : "-"}
                        {fetchedTime ? ` · ${fetchedTime}` : ""}
                        {row.consecutive_failures > 0 && (
                          <span className="text-red-500 ml-1">
                            · {row.consecutive_failures} fail
                            {row.consecutive_failures > 1 ? "s" : ""}
                          </span>
                        )}
                      </span>
                      {row.last_error && (
                        <span
                          className="text-xs text-red-500 truncate max-w-xs hidden sm:block"
                          title={row.last_error}
                        >
                          {row.last_error.slice(0, 60)}
                          {row.last_error.length > 60 ? "…" : ""}
                        </span>
                      )}
                      {isAdmin &&
                        isProblematic &&
                        row.source !== "systems-status" && (
                          <button
                            onClick={() => handleRefresh(row.source)}
                            disabled={refreshing !== null}
                            className="ml-auto text-xs border border-sand3 px-2 py-0.5 hover:border-ink3 hover:text-ink transition-colors disabled:opacity-40"
                          >
                            {refreshing === row.source ? "…" : "↻"}
                          </button>
                        )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="slbl">Communication KPIs</div>
          <div className="card">
            <div className="card-body">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    value: slackKPIs
                      ? slackKPIs.totalMessages.toLocaleString()
                      : "-",
                    label: "Slack Messages",
                    sub: "This week",
                  },
                  {
                    value: slackKPIs ? slackKPIs.activeMembers : "-",
                    label: "Active Members",
                    sub: "Non-bot accounts",
                  },
                  {
                    value: slackKPIs ? slackKPIs.channels : "-",
                    label: "Channels",
                    sub: "Public channels",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`border border-sand3 p-3 ${!slackKPIs && stat.value === "-" ? "animate-pulse" : ""}`}
                  >
                    <div className="font-serif font-black text-2xl">
                      {stat.value}
                    </div>
                    <div className="text-xs font-bold uppercase tracking-widest text-ink3 mt-0.5">
                      {stat.label}
                    </div>
                    <div className="text-xs text-ink4 mt-0.5">{stat.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
