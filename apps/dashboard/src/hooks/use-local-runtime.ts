"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  type LocalProgress,
  type LocalRuntimeStatus,
  type LocalSharing,
  getDesktopBridge,
  localRuntimeCandidates,
} from "@/lib/desktop";
import { trpc } from "@/utils/trpc";

/**
 * Whether the Onirix server can use a model served on this computer.
 *
 * `remote`: the server is on another machine, so it cannot, and saying so
 * before anyone downloads 5 GB is the whole job of this state. `unknown`: not
 * tested yet, because nothing is serving. `unreachable`: serving, but the
 * server could not get to it by any name this host answers to.
 */
export type Reachability =
  | { state: "remote" | "unknown" | "checking" | "unreachable" }
  | { state: "reachable"; baseUrl: string };

/** Electron prefixes a rejected call with the channel it was made on. */
function readable(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

/**
 * The desktop app's local model runtime, as the setup dialog needs it.
 *
 * Inert in a browser: `available` is false and nothing else moves. In the
 * desktop app it tracks Ollama's state, what is on disk, what is downloading,
 * and the one fact the shell cannot know by itself, which is whether the
 * server can reach any of it.
 */
export function useLocalRuntime(enabled: boolean) {
  const bridge = getDesktopBridge();
  const candidates = bridge ? localRuntimeCandidates(bridge.server.origin) : [];

  const [status, setStatus] = useState<LocalRuntimeStatus | null>(null);
  const [downloaded, setDownloaded] = useState<Map<string, number>>(new Map());
  const [progress, setProgress] = useState<Record<string, LocalProgress>>({});
  const [sharing, setSharingState] = useState<LocalSharing | null>(null);
  const [busy, setBusy] = useState<"install" | "start" | "sharing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reach, setReach] = useState<Reachability>({
    state: candidates.length === 0 ? "remote" : "unknown",
  });

  // `mutateAsync` keeps one identity for the life of the component, so it is
  // safe to name as an effect dependency.
  const { mutateAsync: probe } = useMutation(trpc.models.probe.mutationOptions());

  const canServe = candidates.length > 0;
  const candidateKey = candidates.join(" ");

  const refresh = useCallback(async () => {
    if (!bridge) return;
    const next = await bridge.runtime.status();
    setStatus(next);
    setSharingState(await bridge.runtime.sharing());
    if (next.state !== "running") return;

    const models = await bridge.runtime.models();
    setDownloaded(new Map(models.map((model) => [model.name, model.sizeBytes])));
  }, [bridge]);

  useEffect(() => {
    if (!enabled || !bridge || !canServe) return;
    void refresh().catch((failure) => setError(readable(failure)));
    return bridge.runtime.onProgress((update) =>
      setProgress((current) => ({ ...current, [update.target]: update })),
    );
  }, [enabled, bridge, canServe, refresh]);

  // Once something is serving, find the name the server can reach it by. The
  // first that answers wins: inside Docker that is the host gateway, from a
  // server on the host it is loopback.
  const running = status?.state === "running";
  useEffect(() => {
    if (!enabled || !running || !candidateKey) return;
    let cancelled = false;
    setReach({ state: "checking" });

    void (async () => {
      for (const baseUrl of candidateKey.split(" ")) {
        const result = await probe({ baseUrl }).catch(() => null);
        if (cancelled) return;
        if (result?.reachable) {
          setReach({ state: "reachable", baseUrl });
          return;
        }
      }
      if (!cancelled) setReach({ state: "unreachable" });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, running, candidateKey, probe]);

  const act = useCallback(
    async (kind: "install" | "start") => {
      if (!bridge) return;
      setBusy(kind);
      setError(null);
      try {
        setStatus(await bridge.runtime[kind]());
        await refresh();
      } catch (failure) {
        setError(readable(failure));
      } finally {
        setBusy(null);
        setProgress(({ runtime: _done, ...rest }) => rest);
      }
    },
    [bridge, refresh],
  );

  // Changing the listening address restarts Ollama, which takes a few seconds
  // and drops any download in flight, so it counts as busy like a start does.
  const setSharing = useCallback(
    async (patch: Partial<Pick<LocalSharing, "shareOnNetwork" | "keepRunning">>) => {
      if (!bridge) return;
      setBusy("sharing");
      setError(null);
      try {
        setSharingState(await bridge.runtime.setSharing(patch));
        await refresh();
      } catch (failure) {
        setError(readable(failure));
      } finally {
        setBusy(null);
      }
    },
    [bridge, refresh],
  );

  /** Resolves true when the model is on disk, false if it failed or was cancelled. */
  const pull = useCallback(
    async (model: string): Promise<boolean> => {
      if (!bridge) return false;
      setError(null);
      setProgress((current) => ({
        ...current,
        [model]: { target: model, status: "Starting", completedBytes: 0, totalBytes: 0 },
      }));
      try {
        await bridge.runtime.pull(model);
        await refresh();
        return true;
      } catch (failure) {
        const message = readable(failure);
        if (message !== "Download cancelled.") setError(message);
        return false;
      } finally {
        setProgress(({ [model]: _done, ...rest }) => rest);
      }
    },
    [bridge, refresh],
  );

  const cancel = useCallback(
    (model: string) => void bridge?.runtime.cancel(model),
    [bridge],
  );

  return {
    /** True inside the desktop app. */
    available: bridge !== null,
    status,
    downloaded,
    progress,
    busy,
    error,
    reach,
    sharing,
    setSharing,
    install: () => act("install"),
    start: () => act("start"),
    pull,
    cancel,
  };
}
