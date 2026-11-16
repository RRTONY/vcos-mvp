"use client";

export interface TabBarItem<T extends string> {
  id: T;
  label: string;
  /** Optional count badge; `alert` shows it in red. */
  count?: number | null;
  alert?: boolean;
}

/**
 * Shared secondary tab-bar style for in-page tab groups (Reports, Performance,
 * Systems, Team & Users, etc.) - sentence-case labels, accent underline on
 * the active tab. Use this everywhere instead of hand-rolling per-page
 * button/className markup, so tab styling stays consistent across the app.
 */
export default function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  right,
}: {
  tabs: readonly TabBarItem<T>[];
  active: T;
  onChange: (id: T) => void;
  right?: React.ReactNode;
}) {
  return (
    // The bottom rule is an inset shadow, not a border: the active tab's
    // underline paints over it without a negative margin, so the bar has no
    // vertical overflow and only scrolls left-right on narrow screens.
    <div className="flex items-center gap-1 mb-2 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_theme(colors.sand4)]">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 pt-3 pb-2.5 text-[15px] border-b-[3px] transition-colors whitespace-nowrap ${
            active === t.id
              ? "border-accent text-ink font-bold"
              : "border-transparent text-ink3 font-semibold hover:text-ink"
          }`}
        >
          {t.label}
          {t.count != null && (
            <span
              className={`ml-2 text-xs font-bold px-2 py-px rounded-full ${
                t.alert
                  ? "bg-danger-light text-danger-dark"
                  : active === t.id
                    ? "bg-accent-light text-accent-dark"
                    : "bg-sand3 text-slate-dark"
              }`}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
      {right && (
        <div className="ml-auto pb-1.5 pl-2 flex-shrink-0">{right}</div>
      )}
    </div>
  );
}
