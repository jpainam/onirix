"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { AppearanceSettings } from "@onirix/ui/components/appearance-settings";
import type { ThemeMode } from "@onirix/ui/lib/appearance";

const subscribe = () => () => {};

/**
 * The Appearance screen, joined to where this app keeps light, dark or
 * system: next-themes, which the user menu's theme switch also drives.
 */
export function AppearanceView() {
  const { theme, setTheme } = useTheme();
  // The stored mode is only known in the browser, so the first render shows
  // "system" on both sides and the real choice arrives straight after.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const mode: ThemeMode =
    mounted && (theme === "light" || theme === "dark") ? theme : "system";

  return <AppearanceSettings mode={mode} onModeChange={setTheme} heading={false} />;
}
