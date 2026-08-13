"use client";

import { useState } from "react";

// Two-letter initials from a full name: "Alex Veytsel" → "AV", "Tony" → "TO".
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

/**
 * User avatar - shows the profile image (from ClickUp/Slack) if available,
 * otherwise a colored circle with two-letter initials. Falls back to initials
 * automatically if the image fails to load.
 */
export default function Avatar({
  name,
  image,
  initials,
  color,
  className = "w-10 h-10 text-sm",
}: {
  name: string;
  image?: string | null;
  initials?: string | null;
  color?: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  // Always show two letters: use ClickUp's initials only when they're exactly 2 chars,
  // otherwise derive two letters from the name.
  const label = (
    initials && initials.length === 2 ? initials : initialsOf(name)
  ).toUpperCase();

  if (image && !broken) {
    return (
      <img
        src={image}
        alt={name}
        onError={() => setBroken(true)}
        className={`${className} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${className} rounded-full flex items-center justify-center font-bold flex-shrink-0 text-white`}
      style={{ background: color || "#4F46E5" }}
      aria-label={name}
    >
      {label}
    </div>
  );
}
