"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/hooks/useMe";

const TABS = [
  { label: "Dashboard", href: "/" },
  { label: "Briefing Room", href: "/briefing" },
  { label: "Team", href: "/team" },
  { label: "Weekly Report", href: "/submit" },
  { label: "VCoS-AI", href: "/chatbot" },
  { label: "Analytics", href: "/analytics" },
  { label: "Invoices", href: "/invoices" },
  { label: "BD Pipeline", href: "/bd" },
];

const ADMIN_TABS = [{ label: "Team & Users", href: "/settings/people" }];

// Systems always renders last - Requests and API Keys now live inside
// Team & Users / Systems as tabs, rather than their own nav entries.
const SYSTEMS_TAB = { label: "Systems", href: "/systems" };

export default function NavTabs() {
  const path = usePathname();
  const { isAdmin } = useMe();

  const allTabs = isAdmin
    ? [...TABS, ...ADMIN_TABS, SYSTEMS_TAB]
    : [...TABS, SYSTEMS_TAB];

  return (
    <nav
      className="flex gap-0.5 px-2 sm:px-4 border-b border-sand4 bg-sand2/95 backdrop-blur overflow-x-auto sticky top-16 z-30"
      style={{ scrollbarWidth: "none" }}
      aria-label="Sections"
    >
      {allTabs.map((t) => {
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`px-4 pt-[15px] pb-3 text-[15px] whitespace-nowrap border-b-[3px] transition-colors ${
              active
                ? "border-accent text-ink font-bold"
                : "border-transparent text-ink3 font-semibold hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
