"use client";

import { useSyncExternalStore } from "react";

import { getDesktopBridge } from "@/lib/desktop";

// The bridge is installed by the preload script before any page script runs
// and never changes afterwards, so there is nothing to subscribe to.
const subscribe = () => () => {};

/**
 * True inside the desktop shell on macOS, where the title bar is hidden and
 * the window controls float over the top-left corner of the page.
 *
 * False on the server and during hydration, then corrected straight after.
 */
export function useDesktopMac(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getDesktopBridge()?.platform === "darwin",
    () => false,
  );
}
