"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "@onirix/ui/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

/**
 * Three swatch cards rather than a select: the choice is visual, so showing
 * each surface is more useful than naming it.
 */
export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // `theme` is unknown until the client reads storage; rendering a selection
  // before then would flash the wrong card.
  useEffect(() => setMounted(true), []);
  const active = mounted ? (theme ?? "system") : undefined;

  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setTheme(option.value)}
          aria-pressed={active === option.value}
          className={cn(
            "bg-card flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
            active === option.value
              ? "border-ring ring-ring/40 ring-1"
              : "hover:bg-tint-01"
          )}
        >
          <option.icon className="text-ink-03 size-4" />
          {option.label}
        </button>
      ))}
    </div>
  );
}
