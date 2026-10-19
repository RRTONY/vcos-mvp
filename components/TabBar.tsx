"use client";

export interface TabBarItem<T extends string> {
  id: T;
  label: string;
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
    <div className="flex items-center gap-1 border-b border-sand4 mb-2 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 pt-3 pb-2.5 text-[15px] border-b-[3px] -mb-px transition-colors whitespace-nowrap ${
            active === t.id
              ? "border-accent text-ink font-bold"
              : "border-transparent text-ink3 font-semibold hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
      {right && (
        <div className="ml-auto pb-1.5 pl-2 flex-shrink-0">{right}</div>
      )}
    </div>
  );
}
