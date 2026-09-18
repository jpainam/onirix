"use client";

import type { Route } from "next";
import { useCallback, useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { type DesktopBridge, getDesktopBridge } from "@/lib/desktop";
import { challengeFor, createVerifier, handoffPath } from "@/lib/desktop-sign-in";

/** How often the window asks whether the browser has finished. */
const POLL_INTERVAL_MS = 2000;
/** How long the user gets to finish in their browser, inbox included. */
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

export type DesktopHandoff = {
  bridge: DesktopBridge;
  /**
   * Starts one attempt. The `callbackURL` is where the browser should land
   * once it is signed in; the `verifier` is what this window trades for the
   * session afterwards and never leaves it.
   */
  begin: () => Promise<{ challenge: string; verifier: string; callbackURL: Route }>;
  /** Resolves once the browser approved. The window is signed in by then. */
  wait: (verifier: string) => Promise<void>;
  /** Stops waiting. A `wait` cancelled this way never resolves or rejects. */
  cancel: () => void;
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Cancelled", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Signing in through the user's real browser, from the desktop app.
 *
 * Google refuses OAuth to embedded browsers, and every emailed link (magic
 * link, email verification) opens in the default browser rather than in this
 * window. Both leave the session where the app cannot reach it. So the app
 * asks for the sign-in to happen out there and waits to be handed the result:
 * `begin` makes the one-time secret, the browser approves it on the handoff
 * page, and `wait` trades it for a session cookie on this window.
 *
 * Null in an ordinary browser, where none of this is needed. It is also null
 * on the first client render, before the bridge can be read, so the browser
 * path is what renders until the shell is confirmed.
 */
export function useDesktopHandoff(): DesktopHandoff | null {
  const [bridge, setBridge] = useState<DesktopBridge | null>(null);
  const attempt = useRef<AbortController | null>(null);

  useEffect(() => {
    setBridge(getDesktopBridge());
    return () => attempt.current?.abort();
  }, []);

  const begin = useCallback(async () => {
    attempt.current?.abort();
    attempt.current = new AbortController();
    const verifier = createVerifier();
    const challenge = await challengeFor(verifier);
    return { challenge, verifier, callbackURL: handoffPath(challenge) };
  }, []);

  const wait = useCallback(async (verifier: string) => {
    const signal = attempt.current?.signal ?? new AbortController().signal;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { data, error } = await authClient.$fetch<{ status: "pending" | "signed-in" }>(
        "/desktop/exchange",
        { method: "POST", body: { verifier }, signal },
      );
      if (error) throw new Error(error.message || error.statusText || "Sign-in failed");
      if (data?.status === "signed-in") return;
      await sleep(POLL_INTERVAL_MS, signal);
    }
    throw new Error("The sign-in timed out. Try again.");
  }, []);

  const cancel = useCallback(() => {
    attempt.current?.abort();
    attempt.current = null;
  }, []);

  return bridge ? { bridge, begin, wait, cancel } : null;
}

/** True when an error is a cancelled wait rather than a real failure. */
export function isCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
