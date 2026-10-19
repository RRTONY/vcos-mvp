"use client";

/**
 * Pill-style switcher for sections inside a tab (e.g. Team → People). Use this
 * instead of a second TabBar so nested navigation never looks like the main
 * tabs.
 */
export default function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={active === t.id}
          onClick={() => onChange(t.id)}
          className="fchip"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
