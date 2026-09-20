/**
 * The renderer's one way out: `window.onirixLocal`, published by the preload.
 *
 * Everything that touches the disk, a model, or the network goes through it,
 * because this page can do none of those itself.
 */
import type { LocalBridge } from "../src/local-bridge";

export function getBridge(): LocalBridge {
  const bridge = window.onirixLocal;
  // Only missing when the page is opened outside the shell, which nothing
  // ships a way to do. Better a sentence than a TypeError three calls later.
  if (!bridge) throw new Error("This page only runs inside the Onirix desktop app.");
  return bridge;
}

/** Electron prefixes a rejected call with the channel it failed on. */
export function errorMessage(failure: unknown): string {
  const text = failure instanceof Error ? failure.message : String(failure);
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}
