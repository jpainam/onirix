/**
 * The little the shell remembers between launches: which server it is attached
 * to (if any), where the window was, and whether the first-run setup has been
 * seen. A JSON file in the app's data directory, read once at startup and
 * rewritten whole, since it is a few hundred bytes.
 */
import { app } from "electron";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { writeJsonAtomic } from "./atomic-write";

export type Appearance = "system" | "light" | "dark";

export type Settings = {
  /** The attached server. Null means the app runs on its own, with no server. */
  serverUrl: string | null;
  /**
   * The server last attached to, kept after "Use Without a Server" so going
   * back is one click rather than retyping an address.
   */
  lastServerUrl: string | null;
  /**
   * When the first-run setup was finished, skipped, or closed. All three
   * count: the setup is an offer, and an offer declined is not made again.
   */
  onboardingCompletedAt: string | null;
  /** Local mode only. A server workspace keeps its own theme. */
  appearance: Appearance;
  bounds: { x?: number; y?: number; width: number; height: number } | null;
  runtime: {
    shareOnNetwork: boolean;
    keepRunning: boolean;
    /** The Ollama this app started, so a later launch knows it is its own. */
    pid: number | null;
  };
};

const DEFAULTS: Settings = {
  serverUrl: null,
  lastServerUrl: null,
  onboardingCompletedAt: null,
  appearance: "system",
  bounds: null,
  runtime: { shareOnNetwork: false, keepRunning: false, pid: null },
};

function file(): string {
  return join(app.getPath("userData"), "settings.json");
}

let cache: Settings | null = null;

export function readSettings(): Settings {
  if (cache) return cache;
  try {
    const stored = JSON.parse(readFileSync(file(), "utf8")) as Partial<Settings>;
    cache = {
      ...DEFAULTS,
      ...stored,
      runtime: { ...DEFAULTS.runtime, ...stored.runtime },
    };
  } catch {
    // First launch, or a file someone hand-edited into invalid JSON. Either
    // way local mode with the setup over it is the right place to land.
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function writeSettings(patch: Partial<Settings>): Settings {
  cache = { ...readSettings(), ...patch };
  mkdirSync(dirname(file()), { recursive: true });
  // Written as the window closes, which is also when a quit can turn into a
  // kill. A plain write there was seen to leave an empty file behind.
  writeJsonAtomic(file(), cache);
  return cache;
}
