"use client";

// Team - one place for everything about how the team is doing. Replaces the
// former Reports, Compliance, Performance, Standup Log, Escalations and
// Decisions & Commitments pages (old URLs redirect here, see next.config.js).
import { useEffect, useState } from "react";
import TabBar from "@/components/TabBar";
import SubTabs from "@/components/SubTabs";
import { useMe } from "@/hooks/useMe";
import AttentionPanel from "@/components/team/AttentionPanel";
import ReportsPanel from "@/components/team/ReportsPanel";
import FilingPanel from "@/components/team/FilingPanel";
import PeoplePanel from "@/components/team/PeoplePanel";
import DailyLogPanel from "@/components/team/DailyLogPanel";
import DecisionsPanel from "@/components/team/DecisionsPanel";
import ProjectsPanel from "@/components/team/ProjectsPanel";
import { SkeletonRows } from "@/components/Skeleton";

const TABS = [
  {
    id: "attention",
    label: "Needs attention",
    adminOnly: true,
    about:
      "Everything overdue, missing or going cold, most urgent first. Start here.",
  },
  {
    id: "reports",
    label: "Weekly reports",
    adminOnly: false,
    about: "Read the weekly reports. Use the arrows to change the week.",
  },
  {
    id: "filing",
    label: "Who filed",
    adminOnly: false,
    about:
      "Who filed their weekly report on time over the last 11 weeks, plus the payroll checklist.",
  },
  {
    id: "people",
    label: "People",
    adminOnly: true,
    about:
      "Each person's report, hours, task load and suggested next step on one row.",
  },
  {
    id: "hours",
    label: "Hours",
    adminOnly: false,
    about: "Hours tracked in WebWork this week - by person, or by project.",
  },
  {
    id: "daily",
    label: "Daily log",
    adminOnly: true,
    about: "A snapshot taken every morning: reports filed, overdue tasks, hours.",
  },
  {
    id: "decisions",
    label: "Decisions",
    adminOnly: true,
    about:
      "Decisions and promises captured from chats, plus anything you add. Tick one off when it's done.",
  },
] as const;
type TabId = (typeof TABS)[number]["id"];

const isTabId = (v: string | null): v is TabId =>
  TABS.some((t) => t.id === v);

const HOURS_VIEWS = [
  { id: "person", label: "By person" },
  { id: "project", label: "By project" },
] as const;

function HoursTab() {
  const [view, setView] = useState<(typeof HOURS_VIEWS)[number]["id"]>("person");
  return (
    <>
      <SubTabs tabs={HOURS_VIEWS} active={view} onChange={setView} />
      {view === "person" ? <ReportsPanel view="hours" /> : <ProjectsPanel />}
    </>
  );
}

export default function TeamPage() {
  const { me, isAdmin } = useMe();
  const [tab, setTab] = useState<TabId | null>(null);

  const visible = TABS.filter((t) => isAdmin || !t.adminOnly);

  // Pick the tab once we know who is looking: ?tab= if allowed, else the default.
  useEffect(() => {
    if (!me || tab) return;
    const wanted = new URLSearchParams(window.location.search).get("tab");
    const allowed = visible.some((t) => t.id === wanted);
    setTab(isTabId(wanted) && allowed ? wanted : visible[0].id);
  }, [me, tab, visible]);

  function choose(id: TabId) {
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  }

  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="mt-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Team</h1>
      <p className="text-ink3 mt-1 mb-4">
        How the team is doing: reports, hours, people and what needs attention.
      </p>

      {!current ? (
        <div className="py-6">
          <SkeletonRows rows={4} />
        </div>
      ) : (
        <>
          <TabBar tabs={visible} active={current.id} onChange={choose} />
          <p className="text-sm text-ink3 mt-3 mb-5">{current.about}</p>

          {current.id === "attention" && <AttentionPanel />}
          {current.id === "reports" && <ReportsPanel view="submitted" />}
          {current.id === "filing" && <FilingPanel />}
          {current.id === "people" && <PeoplePanel />}
          {current.id === "hours" && <HoursTab />}
          {current.id === "daily" && <DailyLogPanel />}
          {current.id === "decisions" && <DecisionsPanel />}
        </>
      )}
    </div>
  );
}
