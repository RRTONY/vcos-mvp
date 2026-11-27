"use client";

// The two-workspace title in the top bar: the active workspace is the big
// title, the other one a small "Switch to ..." pill under it. Clicking the
// pill swaps them (CSS transition, instant under prefers-reduced-motion).
// Spec: Darryl's handoff docs/01-BUILD-SPEC.md section 1.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  WORKSPACE_HOME,
  WORKSPACE_STORAGE_KEY,
  WORKSPACE_TITLE,
  workspaceFromPath,
  type Workspace,
} from "@/lib/workspace";

const ORDER: Workspace[] = ["vcos", "cc"];

export default function WorkspaceSwitch() {
  const pathname = usePathname();
  const router = useRouter();
  const active = workspaceFromPath(pathname);
  const [announce, setAnnounce] = useState("");
  const first = useRef(true);

  // Theme hook for CSS, plus remember the choice for next time.
  useEffect(() => {
    document.body.dataset.workspace = active;
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, active);
    } catch {
      /* private mode */
    }
    if (first.current) {
      first.current = false;
      return;
    }
    setAnnounce(`${WORKSPACE_TITLE[active]} workspace`);
  }, [active]);

  // Landing on the bare home page reopens the last workspace. Any other
  // direct link wins over the remembered one.
  useEffect(() => {
    if (pathname !== "/") return;
    try {
      if (localStorage.getItem(WORKSPACE_STORAGE_KEY) === "cc")
        router.replace(WORKSPACE_HOME.cc);
    } catch {
      /* private mode */
    }
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-start min-w-0 leading-tight">
      {ORDER.map((ws) => {
        const isActive = ws === active;
        return (
          <Link
            key={ws}
            href={WORKSPACE_HOME[ws]}
            aria-current={isActive ? "page" : undefined}
            className={`truncate max-w-full transition-all duration-[360ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-light ${
              isActive
                ? "order-1 font-display font-extrabold text-[19px] tracking-tight text-white pointer-events-none"
                : "order-2 mt-0.5 inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/10 px-2.5 py-px text-[11.5px] font-semibold text-on-navy-dim hover:bg-white/20 hover:text-white"
            }`}
          >
            {isActive ? (
              WORKSPACE_TITLE[ws]
            ) : (
              <>
                <span aria-hidden>⇄</span>
                Switch to {WORKSPACE_TITLE[ws]}
              </>
            )}
          </Link>
        );
      })}
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
