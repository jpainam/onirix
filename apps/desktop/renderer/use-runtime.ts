/**
 * What the window knows about the local model runtime (Ollama).
 *
 * Held outside React on purpose. A model is gigabytes and its download runs
 * for minutes, during which the person will close the setup dialog, open
 * Settings, start a chat. The download belongs to none of those components,
 * so its state does not live in any of them: whichever one is on screen reads
 * the same snapshot, and a progress bar picks up where the last one left off.
 */
import { useEffect, useSyncExternalStore } from "react";

import type { LocalModel, LocalProgress, LocalRuntimeStatus } from "../src/local-bridge";

import { errorMessage, getBridge } from "./bridge";

export type RuntimeSnapshot = {
  /** Null until the first check answers. */
  status: LocalRuntimeStatus | null;
  models: LocalModel[];
  /** Downloads in flight, by model tag. `runtime` is Ollama itself. */
  progress: Record<string, LocalProgress>;
  busy: "install" | "start" | null;
  error: string | null;
};

let snapshot: RuntimeSnapshot = {
  status: null,
  models: [],
  progress: {},
  busy: null,
  error: null,
};

const listeners = new Set<() => void>();
let listening = false;

function update(patch: Partial<RuntimeSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function withoutProgress(target: string): Record<string, LocalProgress> {
  const { [target]: _finished, ...rest } = snapshot.progress;
  return rest;
}

function listen(): void {
  if (listening) return;
  listening = true;
  getBridge().runtime.onProgress((progress) => {
    update({ progress: { ...snapshot.progress, [progress.target]: progress } });
  });
}

export async function refresh(): Promise<void> {
  const bridge = getBridge();
  try {
    const status = await bridge.runtime.status();
    const models = status.state === "running" ? await bridge.runtime.models() : [];
    update({ status, models });
  } catch (failure) {
    update({ error: errorMessage(failure) });
  }
}

async function bringUp(how: "install" | "start"): Promise<void> {
  const bridge = getBridge();
  update({ busy: how, error: null });
  try {
    const status = await (how === "install" ? bridge.runtime.install() : bridge.runtime.start());
    update({ status });
    await refresh();
  } catch (failure) {
    update({ error: errorMessage(failure) });
  } finally {
    update({ busy: null, progress: withoutProgress("runtime") });
  }
}

export const install = () => bringUp("install");
export const start = () => bringUp("start");

export async function pull(model: string): Promise<void> {
  update({
    error: null,
    // Shown at once, before Ollama's first report, so the click visibly took.
    progress: {
      ...snapshot.progress,
      [model]: { target: model, status: "Starting", completedBytes: 0, totalBytes: 0 },
    },
  });
  try {
    await getBridge().runtime.pull(model);
    await refresh();
  } catch (failure) {
    const message = errorMessage(failure);
    // Cancelling is something the person did, not something that went wrong.
    if (message !== "Download cancelled.") update({ error: message });
  } finally {
    update({ progress: withoutProgress(model) });
  }
}

export function cancel(model: string): void {
  void getBridge().runtime.cancel(model);
}

export async function remove(model: string): Promise<void> {
  try {
    await getBridge().runtime.remove(model);
    await refresh();
  } catch (failure) {
    update({ error: errorMessage(failure) });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The runtime's state, checked when the component using it first appears. */
export function useRuntime(): RuntimeSnapshot {
  useEffect(() => {
    listen();
    void refresh();
  }, []);
  return useSyncExternalStore(subscribe, () => snapshot);
}
