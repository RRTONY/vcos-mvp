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
  FiRefreshCw,
} from "react-icons/fi";
import SystemRow from "@/components/SystemRow";
import { SkeletonRows } from "@/components/Skeleton";
import TabBar from "@/components/TabBar";
import KeysPanel from "@/components/settings/KeysPanel";
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

// Colour of the status pill for each cache state (.pill colour classes)
const HEALTH_PILL: Record<HealthRow["health"], string> = {
  ok: "green",
  stale: "amber",
  dead: "red",
  never: "slate",
  circuit_open: "red",
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
      fetch("/api/cache-health", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([sysData, healthData]) => {
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

  const counts = {
    green: systems.filter((x) => x.status === "green").length,
    amber: systems.filter((x) => x.status === "amber").length,
    red: systems.filter((x) => x.status === "red").length,
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Systems</h1>
          <p className="text-ink3 mt-1">The tools VCoS connects to, and how fresh its data is.</p>
        </div>
        {tab === "status" && (
          <div className="flex flex-wrap items-center gap-2">
            {counts.green > 0 && <span className="pill green">{counts.green} online</span>}
            {counts.amber > 0 && <span className="pill amber">{counts.amber} degraded</span>}
            {counts.red > 0 && <span className="pill red">{counts.red} down</span>}
            {lastChecked && <span className="text-sm text-ink4 ml-1">Checked {lastChecked}</span>}
          </div>
        )}
      </div>

      {isAdmin && <TabBar tabs={SYSTEMS_TABS} active={tab} onChange={setTab} />}

      {tab === "keys" && isAdmin ? (
        <div className="pt-6">
          <KeysPanel />
        </div>
      ) : (
        <div className="pt-6 grid gap-8">
          <section className="panel !gap-0 !py-2 !px-3 sm:!px-4">
            <h2 className="panel-title px-2 pt-3 pb-2">Connected systems</h2>
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
          </section>

          <section className="panel !gap-0 !py-2 !px-3 sm:!px-4">
            <div className="flex items-center gap-3 px-2 pt-3 pb-2">
              <h2 className="panel-title">Data freshness</h2>
              <span className="text-sm text-ink3 hidden sm:inline">How recently each source was refreshed</span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleRefresh("all")}
                  disabled={refreshing !== null}
                  className="btn-secondary !py-1.5 ml-auto"
                >
                  <FiRefreshCw className={`w-4 h-4 ${refreshing === "all" ? "animate-spin" : ""}`} />
                  {refreshing === "all" ? "Refreshing" : "Refresh all"}
                </button>
              )}
            </div>
            {cacheHealth.length === 0 ? (
              <SkeletonRows rows={5} className="px-2 pb-3" />
            ) : (
              cacheHealth.map((row) => {
                const fetchedTime = row.fetched_at
                  ? new Date(row.fetched_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                  : null;
                return (
                  <div key={row.source} className="flex items-center gap-3 px-2 py-3 border-b border-sand4 last:border-0">
                    <span className="font-bold text-ink w-36 flex-shrink-0 truncate">{row.label}</span>
                    <span className={`pill ${HEALTH_PILL[row.health]} flex-shrink-0`}>{HEALTH_LABEL[row.health]}</span>
                    <span className="text-sm text-ink3 min-w-0 truncate">
                      {row.age_minutes !== null ? `${row.age_minutes} min ago` : "Not fetched yet"}
                      {fetchedTime ? ` · ${fetchedTime}` : ""}
                      {row.consecutive_failures > 0 && (
                        <span className="text-danger-dark font-semibold">
                          {" "}· {row.consecutive_failures} failed {row.consecutive_failures > 1 ? "tries" : "try"}
                        </span>
                      )}
                      {row.last_error && (
                        <span className="text-danger-dark hidden md:inline" title={row.last_error}>
                          {" "}· {row.last_error.slice(0, 60)}
                          {row.last_error.length > 60 ? "…" : ""}
                        </span>
                      )}
                    </span>
                    {isAdmin && row.health !== "ok" && (
                      <button
                        type="button"
                        onClick={() => handleRefresh(row.source)}
                        disabled={refreshing !== null}
                        aria-label={`Refresh ${row.label}`}
                        title={row.source === "morning-brief" ? "Generates the brief and posts it to Slack now" : `Refresh ${row.label}`}
                        className="btn-ghost !p-2 ml-auto flex-shrink-0"
                      >
                        <FiRefreshCw className={`w-4 h-4 ${refreshing === row.source ? "animate-spin" : ""}`} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </div>
      )}
    </div>
  );
}
