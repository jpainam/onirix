/**
 * The little the shell remembers between launches: which server it is attached
 * to and where the window was. A JSON file in the app's data directory, read
 * once at startup and rewritten whole, since it is a few hundred bytes.
 */
import { app } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Settings = {
  serverUrl: string | null;
  bounds: { x?: number; y?: number; width: number; height: number } | null;
};

const DEFAULTS: Settings = { serverUrl: null, bounds: null };

function file(): string {
  return join(app.getPath("userData"), "settings.json");
}

let cache: Settings | null = null;

export function readSettings(): Settings {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...(JSON.parse(readFileSync(file(), "utf8")) as Partial<Settings>) };
  } catch {
    // First launch, or a file someone hand-edited into invalid JSON. Either
    // way the connect screen is the right place to land.
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function writeSettings(patch: Partial<Settings>): Settings {
  cache = { ...readSettings(), ...patch };
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(cache, null, 2));
  return cache;
}
