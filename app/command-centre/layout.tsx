"use client";

// The Command Centre lives in this layout (not in the tab pages) so its
// loaded data and open panels survive switching tabs; the tab pages below
// only validate the URL. See lib/workspace.ts.
import { usePathname, useRouter } from "next/navigation";
import BriefingRoom from "@/components/briefing/BriefingRoom";
import { ccPath, ccTabFromPath } from "@/lib/workspace";

export default function CommandCentreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tab = ccTabFromPath(pathname);
  if (!tab) return <>{children}</>; // bare /command-centre redirects; unknown tabs 404
  return (
    <>
      <BriefingRoom tab={tab} onTab={(t) => router.push(ccPath(t), { scroll: false })} />
      {children}
    </>
  );
}
