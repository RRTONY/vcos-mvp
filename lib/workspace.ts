// Two workspaces share one header: VCoS (navy, the existing app) and the
// Command Centre (teal, formerly the Briefing Room). Spec: Darryl's handoff,
// docs/01-BUILD-SPEC.md section 1.

export type Workspace = "vcos" | "cc";

export const WORKSPACE_TITLE: Record<Workspace, string> = {
  vcos: "Visual Chief of Staff",
  cc: "Command Centre",
};

export const CC_BASE = "/command-centre";
export const WORKSPACE_HOME: Record<Workspace, string> = {
  vcos: "/",
  cc: `${CC_BASE}/overview`,
};

/** localStorage key for the last workspace a person used. */
export const WORKSPACE_STORAGE_KEY = "vcos.workspace";

export function workspaceFromPath(pathname: string): Workspace {
  return pathname === CC_BASE || pathname.startsWith(`${CC_BASE}/`)
    ? "cc"
    : "vcos";
}

// Command Centre tabs: the URL slug and the Briefing Room's internal tab id.
export const CC_TABS = [
  { slug: "overview", id: "overview", label: "Overview" },
  { slug: "email-audit", id: "audit", label: "Email audit" },
  { slug: "decisions", id: "decisions", label: "Decisions" },
  { slug: "meeting-log", id: "log", label: "Meeting log" },
  { slug: "what-changed", id: "changes", label: "What changed" },
  { slug: "questions", id: "questions", label: "Questions for Tony" },
  { slug: "history", id: "history", label: "History" },
] as const;

export type CcTabId = (typeof CC_TABS)[number]["id"];
export type CcTabSlug = (typeof CC_TABS)[number]["slug"];

export function isCcTabId(v: unknown): v is CcTabId {
  return CC_TABS.some((t) => t.id === v);
}

export function ccTabFromPath(pathname: string): CcTabId | null {
  const slug = pathname.slice(CC_BASE.length + 1).split("/")[0];
  return CC_TABS.find((t) => t.slug === slug)?.id ?? null;
}

export function ccPath(id: CcTabId): string {
  const tab = CC_TABS.find((t) => t.id === id)!;
  return `${CC_BASE}/${tab.slug}`;
}
