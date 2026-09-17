/**
 * The contract between the web app and the desktop shell.
 *
 * The desktop app is a thin client: a window around this same web app, served
 * by whichever Onirix server the user pointed it at. The one thing a browser
 * tab cannot do is run software on the user's machine, so the shell exposes
 * exactly that and nothing else: a local model runtime (Ollama) it can
 * install, start, and pull models into.
 *
 * This file is the single source of truth for that surface. The shell's
 * preload script imports these types, and the web app reads the bridge through
 * `getDesktopBridge`. It must stay free of imports so both sides can compile it.
 */

export type DesktopPlatform = "darwin" | "win32" | "linux";

export type LocalRuntimeStatus = {
  /**
   * `missing`: no Ollama on this machine. `stopped`: installed, not serving.
   * `running`: answering on the loopback port.
   */
  state: "missing" | "stopped" | "running";
  version: string | null;
  /** True when the shell installed the runtime itself, under its own data. */
  managed: boolean;
};

export type LocalModel = {
  /** The Ollama tag with `:latest` dropped, so it compares against the catalog. */
  name: string;
  sizeBytes: number;
};

export type LocalProgress = {
  /** What is downloading: a model tag, or `runtime` for Ollama itself. */
  target: string;
  /** Ollama's own wording ("pulling manifest", "verifying sha256 digest"). */
  status: string;
  completedBytes: number;
  totalBytes: number;
};

export type DesktopBridge = {
  platform: DesktopPlatform;
  version: string;
  server: {
    /** Origin of the Onirix server this window is attached to. */
    origin: string;
    /** Back to the connect screen, to point the app somewhere else. */
    change: () => Promise<void>;
  };
  runtime: {
    status: () => Promise<LocalRuntimeStatus>;
    /** Downloads Ollama into the app's own data directory, checksum verified. */
    install: () => Promise<LocalRuntimeStatus>;
    start: () => Promise<LocalRuntimeStatus>;
    models: () => Promise<LocalModel[]>;
    /** Resolves when the model is fully on disk; rejects if cancelled. */
    pull: (model: string) => Promise<void>;
    cancel: (model: string) => Promise<void>;
    remove: (model: string) => Promise<void>;
    /** Returns the unsubscribe function. */
    onProgress: (listener: (progress: LocalProgress) => void) => () => void;
  };
};

declare global {
  interface Window {
    onirixDesktop?: DesktopBridge;
  }
}

/** The bridge when running inside the desktop shell, otherwise null. */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.onirixDesktop ?? null;
}

/**
 * Where the Onirix server might find a model served on this computer.
 *
 * The server makes the model calls, not this window, so a local runtime only
 * helps when the server runs on the same machine. From inside a container the
 * host is `host.docker.internal`; from a server started with `pnpm dev` it is
 * plain loopback. Remote servers get an empty list: nothing on this computer
 * is reachable from there.
 */
export function localRuntimeCandidates(serverOrigin: string): string[] {
  let hostname: string;
  try {
    hostname = new URL(serverOrigin).hostname;
  } catch {
    return [];
  }
  const loopback =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  if (!loopback) return [];
  return [
    "http://host.docker.internal:11434/v1",
    "http://127.0.0.1:11434/v1",
  ];
}
