"use client";

import { useSyncExternalStore } from "react";

import type { BrowserProgress } from "@onirix/ui/components/model-browser";

/**
 * Model downloads in flight, as this tab knows them.
 *
 * Held outside React on purpose. A model is gigabytes and its download runs
 * for minutes, during which the admin will move to another page. The request
 * belongs to the tab, not to the page that started it, so coming back finds
 * the bar where it should be. Closing the tab does end the download: Ollama
 * keeps what it has and the next attempt resumes from there.
 */
type Snapshot = {
  progress: Record<string, BrowserProgress>;
  error: string | null;
};

type PullLine = Partial<BrowserProgress> & { done?: boolean; error?: string };

let snapshot: Snapshot = { progress: {}, error: null };
const listeners = new Set<() => void>();
const requests = new Map<string, AbortController>();

function update(patch: Partial<Snapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function withoutProgress(model: string): Record<string, BrowserProgress> {
  const { [model]: _finished, ...rest } = snapshot.progress;
  return rest;
}

/** Resolves true when the model is on disk, false if it failed or was cancelled. */
export async function download(model: string): Promise<boolean> {
  if (requests.has(model)) return false;
  const controller = new AbortController();
  requests.set(model, controller);
  update({
    error: null,
    // Shown at once, before Ollama's first report, so the click visibly took.
    progress: {
      ...snapshot.progress,
      [model]: { status: "Starting", completedBytes: 0, totalBytes: 0 },
    },
  });

  try {
    const response = await fetch("/api/models/pull", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ model }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `The download could not start (HTTP ${response.status}).`);
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let finished = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const text of lines) {
        if (!text.trim()) continue;
        const line = JSON.parse(text) as PullLine;
        if (line.error) throw new Error(line.error);
        if (line.done) {
          finished = true;
          continue;
        }
        update({
          progress: {
            ...snapshot.progress,
            [model]: {
              status: line.status ?? "",
              completedBytes: line.completedBytes ?? 0,
              totalBytes: line.totalBytes ?? 0,
            },
          },
        });
      }
    }
    // A stream that ends without saying so was cut off on the way.
    if (!finished) throw new Error("The download was interrupted. Start it again to resume.");
    return true;
  } catch (failure) {
    // Cancelling is something the person did, not something that went wrong.
    if (!controller.signal.aborted) {
      update({ error: failure instanceof Error ? failure.message : String(failure) });
    }
    return false;
  } finally {
    requests.delete(model);
    update({ progress: withoutProgress(model) });
  }
}

export function cancelDownload(model: string): void {
  requests.get(model)?.abort();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_SNAPSHOT: Snapshot = { progress: {}, error: null };

export function useModelDownloads(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );
}
