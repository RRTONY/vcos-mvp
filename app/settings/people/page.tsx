"use client";

// Unified "Team & Users" section - merges the former separate Team (roster) and
// Users (login accounts) pages into one place with two tabs.
import { useState } from "react";
import TabBar from "@/components/TabBar";
import TeamPanel from "@/components/settings/TeamPanel";
import UsersPanel from "@/components/settings/UsersPanel";
import RequestsPanel from "@/components/settings/RequestsPanel";

const TABS = [
  { id: "team", label: "Team Members" },
  { id: "users", label: "Login Users" },
  { id: "requests", label: "Requests" },
] as const;

export default function PeoplePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("team");
  return (
    <div className="mt-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight mb-3">
        Team &amp; Users
      </h1>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      <div className={tab === "team" ? "" : "hidden"}>
        <TeamPanel />
      </div>
      <div className={tab === "users" ? "" : "hidden"}>
        <UsersPanel />
      </div>
      <div className={tab === "requests" ? "" : "hidden"}>
        <RequestsPanel />
      </div>
    </div>
  );
}
