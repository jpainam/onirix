/**
 * The local model runtime: Ollama, found or installed, started, and fed models.
 *
 * Ollama is used as it ships rather than embedded, for two reasons. The web
 * app already speaks to it (it is the `ollama` provider in the catalog), so a
 * model pulled here is a model the workspace can enable with no new code path.
 * And a user who already runs Ollama keeps their install and their models: the
 * shell looks for a running server first, then a binary on the machine, and
 * only downloads its own copy when there is neither.
 *
 * It binds to loopback unless the user turns on sharing, which is how one
 * machine serves models to a team. The shell itself always talks to it over
 * loopback either way.
 */
import { app } from "electron";
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, createWriteStream, existsSync, openSync } from "node:fs";
import { chmod, mkdir, rm } from "node:fs/promises";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type {
  LocalModel,
  LocalProgress,
  LocalRuntimeStatus,
  LocalSharing,
} from "../../dashboard/src/lib/desktop";

import { readSettings, writeSettings } from "./settings";

const run = promisify(execFile);

const PORT = 11434;
const API = `http://127.0.0.1:${PORT}`;
const RELEASES = "https://github.com/ollama/ollama/releases/latest/download";

/** Ollama tags: a name, optionally namespaced, optionally `:tagged`. */
const MODEL_TAG = /^[a-z0-9][a-z0-9._/-]{0,127}(:[a-z0-9][a-z0-9._-]{0,63})?$/i;

export type ProgressListener = (progress: LocalProgress) => void;

function managedDir(): string {
  return join(app.getPath("userData"), "ollama");
}

function managedBinary(): string {
  if (process.platform === "win32") return join(managedDir(), "ollama.exe");
  // The Linux archive is a prefix (`bin/`, `lib/`); the others are flat.
  if (process.platform === "linux") return join(managedDir(), "bin", "ollama");
  return join(managedDir(), "ollama");
}

/**
 * Known install locations, checked by path rather than through `PATH`: an app
 * launched from Finder or the Start menu inherits almost none of the shell's.
 */
function systemBinaries(): string[] {
  switch (process.platform) {
    case "darwin":
      return [
        "/Applications/Ollama.app/Contents/Resources/ollama",
        "/opt/homebrew/bin/ollama",
        "/usr/local/bin/ollama",
      ];
    case "win32":
      return [
        join(
          process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
          "Programs",
          "Ollama",
          "ollama.exe",
        ),
      ];
    default:
      return ["/usr/local/bin/ollama", "/usr/bin/ollama"];
  }
}

function findBinary(): { path: string; managed: boolean } | null {
  if (existsSync(managedBinary())) return { path: managedBinary(), managed: true };
  const system = systemBinaries().find((candidate) => existsSync(candidate));
  return system ? { path: system, managed: false } : null;
}

async function ping(): Promise<string | null> {
  try {
    const response = await fetch(`${API}/api/version`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: string };
    return body.version ?? "unknown";
  } catch {
    return null;
  }
}

export async function status(): Promise<LocalRuntimeStatus> {
  const version = await ping();
  const binary = findBinary();
  if (version) {
    return { state: "running", version, managed: Boolean(binary?.managed) };
  }
  return {
    state: binary ? "stopped" : "missing",
    version: null,
    managed: Boolean(binary?.managed),
  };
}

/** The server spawned by this launch of the app, if any. */
let child: ChildProcess | null = null;

/**
 * Whether a pid is an Ollama process.
 *
 * A runtime left serving after the app quit is recognised on the next launch
 * by the pid written to settings. Pids are reused, so before anything is
 * signalled the process is checked to be what the settings say it was.
 */
async function isOllama(pid: number): Promise<boolean> {
  try {
    const { stdout } =
      process.platform === "win32"
        ? await run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"])
        : await run("ps", ["-p", String(pid), "-o", "comm="]);
    return /ollama/i.test(stdout);
  } catch {
    return false;
  }
}

/** The pid of the Ollama this app started, this launch or an earlier one. */
async function ownedPid(): Promise<number | null> {
  if (child?.pid) return child.pid;
  const { pid } = readSettings().runtime;
  inherited = pid && (await isOllama(pid)) ? pid : null;
  return inherited;
}

/**
 * A runtime inherited from an earlier launch, once verified. Quitting is
 * synchronous and cannot stop to check a pid, so the check is done ahead.
 */
let inherited: number | null = null;

export async function start(): Promise<LocalRuntimeStatus> {
  if (await ping()) return status();

  const binary = findBinary();
  if (!binary) throw new Error("Ollama is not installed on this computer.");

  const settings = readSettings().runtime;
  const bind = settings.shareOnNetwork ? "0.0.0.0" : "127.0.0.1";

  // Ollama's own log, kept beside the settings: when a model will not load,
  // this is the file that says why.
  const log = openSync(join(app.getPath("userData"), "ollama.log"), "a");
  const spawned = spawn(binary.path, ["serve"], {
    env: { ...process.env, OLLAMA_HOST: `${bind}:${PORT}` },
    stdio: ["ignore", log, log],
    windowsHide: true,
    // Its own process group, so it can outlive the app when asked to.
    detached: true,
  });
  closeSync(log);
  spawned.unref();
  child = spawned;
  writeSettings({ runtime: { ...settings, pid: spawned.pid ?? null } });

  let failure: string | null = null;
  spawned.once("error", (error) => {
    failure = error.message;
    if (child === spawned) child = null;
  });
  spawned.once("exit", () => {
    if (child === spawned) child = null;
  });

  // `serve` answers within a second or two, except the first time: macOS
  // scans a freshly unpacked binary and its libraries before it lets them run,
  // and that alone took over twenty seconds when measured.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await ping()) return status();
    if (!child) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    failure
      ? `Ollama did not start: ${failure}`
      : "Ollama did not start. Try again, or start it yourself and reopen this dialog.",
  );
}

async function stop(): Promise<void> {
  const pid = await ownedPid();
  if (!pid) return;
  try {
    process.kill(pid);
  } catch {
    // Already gone.
  }
  child = null;
  writeSettings({ runtime: { ...readSettings().runtime, pid: null } });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && (await ping())) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * Called as the app quits. A runtime the app started goes down with it unless
 * the user asked for it to keep serving; one it merely found is never touched.
 */
export function stopOnQuit(): void {
  if (readSettings().runtime.keepRunning) return;
  const pid = child?.pid ?? inherited;
  if (!pid) return;
  try {
    process.kill(pid);
  } catch {
    // Already gone.
  }
  child = null;
  inherited = null;
}

/** Brings the runtime up at launch on a machine set to keep serving. */
export async function resume(): Promise<void> {
  // Recognise a runtime left up by an earlier launch before anything else, so
  // turning "keep serving" off later still stops it when the app quits.
  await ownedPid();
  if (!readSettings().runtime.keepRunning || !findBinary()) return;
  await start().catch(() => {
    // The dialog reports a runtime that will not start; launch should not.
  });
}

function lanAddresses(): string[] {
  const found: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        found.push(`http://${address.address}:${PORT}/v1`);
      }
    }
  }
  return found;
}

export async function sharing(): Promise<LocalSharing> {
  const { shareOnNetwork, keepRunning } = readSettings().runtime;
  const running = (await ping()) !== null;
  return {
    shareOnNetwork,
    keepRunning,
    // Nothing running yet is as controllable as it gets: the next start is ours.
    controllable: !running || (await ownedPid()) !== null,
    addresses: shareOnNetwork ? lanAddresses() : [],
  };
}

export async function setSharing(
  patch: Partial<Pick<LocalSharing, "shareOnNetwork" | "keepRunning">>,
): Promise<LocalSharing> {
  const before = readSettings().runtime;
  const next = {
    ...before,
    ...(typeof patch.shareOnNetwork === "boolean" ? { shareOnNetwork: patch.shareOnNetwork } : {}),
    ...(typeof patch.keepRunning === "boolean" ? { keepRunning: patch.keepRunning } : {}),
  };
  writeSettings({ runtime: next });

  // The listening address is fixed when Ollama starts, so changing it means
  // starting again. Models on disk are untouched; one mid-answer is cut off.
  if (next.shareOnNetwork !== before.shareOnNetwork && (await ownedPid())) {
    await stop();
    await start();
  }
  return sharing();
}

function releaseAsset(): string {
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  switch (process.platform) {
    case "darwin":
      return "ollama-darwin.tgz";
    case "win32":
      return `ollama-windows-${arch}.zip`;
    default:
      return `ollama-linux-${arch}.tar.zst`;
  }
}

/** The published digest for one asset, from the release's own checksum file. */
async function expectedDigest(asset: string): Promise<string> {
  const response = await fetch(`${RELEASES}/sha256sum.txt`);
  if (!response.ok) throw new Error("Could not fetch the Ollama checksum file.");
  for (const line of (await response.text()).split("\n")) {
    const [digest, name] = line.trim().split(/\s+/);
    if (digest && name?.replace(/^\.\//, "") === asset) return digest;
  }
  throw new Error(`The Ollama release lists no checksum for ${asset}.`);
}

let installing: Promise<LocalRuntimeStatus> | null = null;

/**
 * Downloads Ollama into the app's data directory.
 *
 * Verified against the release's published SHA-256 before anything is
 * unpacked, and unpacked with the system `tar`, which reads all three archive
 * formats (bsdtar on macOS and Windows, GNU tar with zstd on Linux).
 */
export function install(onProgress: ProgressListener): Promise<LocalRuntimeStatus> {
  installing ??= doInstall(onProgress).finally(() => {
    installing = null;
  });
  return installing;
}

async function doInstall(onProgress: ProgressListener): Promise<LocalRuntimeStatus> {
  const asset = releaseAsset();
  const digest = await expectedDigest(asset);

  const response = await fetch(`${RELEASES}/${asset}`);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download Ollama (HTTP ${response.status}).`);
  }

  const totalBytes = Number(response.headers.get("content-length") ?? 0);
  const archive = join(app.getPath("temp"), `onirix-${asset}`);
  const hash = createHash("sha256");
  const out = createWriteStream(archive);
  const emit = throttled(onProgress);
  let completedBytes = 0;

  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      completedBytes += chunk.byteLength;
      if (!out.write(chunk)) await new Promise((resolve) => out.once("drain", resolve));
      emit({ target: "runtime", status: "Downloading Ollama", completedBytes, totalBytes });
    }
    await new Promise<void>((resolve, reject) => {
      out.end((error?: Error | null) => (error ? reject(error) : resolve()));
    });

    if (hash.digest("hex") !== digest) {
      throw new Error("The Ollama download did not match its published checksum.");
    }

    onProgress({ target: "runtime", status: "Unpacking", completedBytes, totalBytes });
    await rm(managedDir(), { recursive: true, force: true });
    await mkdir(managedDir(), { recursive: true });
    try {
      await run("tar", ["-xf", archive, "-C", managedDir()]);
    } catch {
      await rm(managedDir(), { recursive: true, force: true });
      throw new Error(
        process.platform === "linux"
          ? "Could not unpack Ollama. Install zstd, or install Ollama from ollama.com, then try again."
          : "Could not unpack Ollama. Install it from ollama.com, then try again.",
      );
    }
    if (process.platform !== "win32") await chmod(managedBinary(), 0o755);
  } finally {
    out.destroy();
    await rm(archive, { force: true });
  }

  return start();
}

export async function models(): Promise<LocalModel[]> {
  const response = await fetch(`${API}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Ollama is not answering.");
  const body = (await response.json()) as { models?: { name: string; size: number }[] };
  return (body.models ?? []).map((model) => ({
    name: model.name.replace(/:latest$/, ""),
    sizeBytes: model.size,
  }));
}

const pulls = new Map<string, AbortController>();

function assertTag(model: string): void {
  if (!MODEL_TAG.test(model)) throw new Error(`"${model}" is not a valid model name.`);
}

/**
 * Pulls one model, reporting bytes across all of its layers.
 *
 * Ollama streams one JSON line per event, and a model is several blobs, each
 * with its own total. Summing per digest gives a bar that moves forward once,
 * rather than one that fills and resets for every layer.
 */
export async function pull(model: string, onProgress: ProgressListener): Promise<void> {
  assertTag(model);
  if (pulls.has(model)) throw new Error(`${model} is already downloading.`);

  const controller = new AbortController();
  pulls.set(model, controller);
  const emit = throttled(onProgress);
  const layers = new Map<string, { total: number; completed: number }>();

  try {
    const response = await fetch(`${API}/api/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Ollama refused the download (HTTP ${response.status}).`);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as {
          status?: string;
          error?: string;
          digest?: string;
          total?: number;
          completed?: number;
        };
        if (event.error) throw new Error(event.error);
        if (event.digest && event.total) {
          layers.set(event.digest, { total: event.total, completed: event.completed ?? 0 });
        }

        let totalBytes = 0;
        let completedBytes = 0;
        for (const layer of layers.values()) {
          totalBytes += layer.total;
          completedBytes += layer.completed;
        }
        emit({ target: model, status: event.status ?? "", completedBytes, totalBytes });
      }
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Download cancelled.");
    throw error;
  } finally {
    pulls.delete(model);
  }
}

export function cancel(model: string): void {
  pulls.get(model)?.abort();
}

export async function remove(model: string): Promise<void> {
  assertTag(model);
  const response = await fetch(`${API}/api/delete`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not remove ${model} (HTTP ${response.status}).`);
  }
}

/**
 * Ollama reports progress many times a second, and each report crosses a
 * process boundary to reach the window. Ten a second is already smoother than
 * the eye needs. A change of status always goes through, so "verifying" and
 * "success" are never the ones dropped.
 */
function throttled(listener: ProgressListener): ProgressListener {
  let last = 0;
  let lastStatus = "";
  return (progress) => {
    const now = Date.now();
    if (progress.status === lastStatus && now - last < 100) return;
    last = now;
    lastStatus = progress.status;
    listener(progress);
  };
}
