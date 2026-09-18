"use client";

import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { type DesktopBridge, getDesktopBridge } from "@/lib/desktop";
import { challengeFor, createVerifier, handoffPath } from "@/lib/desktop-sign-in";

/** How often the window asks whether the browser has finished. */
const POLL_INTERVAL_MS = 2000;
/** How long one stretch of polling lasts before it gives up. */
const POLL_TIMEOUT_MS = 15 * 60 * 1000;
/** How long an attempt stays worth resuming, counted from when it started. */
const ATTEMPT_TTL_MS = 30 * 60 * 1000;

const PENDING_KEY = "onirix.desktop-handoff";

/**
 * The attempt this window is waiting on, kept where a reload can find it.
 *
 * A magic link can sit in an inbox for a while, and the app may be restarted
 * or left alone long enough for the polling to give up. Writing the attempt
 * down means coming back to the window resumes it rather than stranding an
 * approval the browser has already granted. It is the app's own storage on
 * the user's machine, alongside the session cookie it would become.
 */
type Attempt = { verifier: string; destination: string; startedAt: number };

function readAttempt(): Attempt | null {
  try {
    const stored = localStorage.getItem(PENDING_KEY);
    if (!stored) return null;
    const attempt = JSON.parse(stored) as Attempt;
    if (typeof attempt?.verifier !== "string") return null;
    if (Date.now() - attempt.startedAt > ATTEMPT_TTL_MS) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return attempt;
  } catch {
    // Private mode, cleared storage, hand-edited value: nothing to resume.
    return null;
  }
}

function writeAttempt(attempt: Attempt | null): void {
  try {
    if (attempt) localStorage.setItem(PENDING_KEY, JSON.stringify(attempt));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage is a convenience here; the attempt in memory still works.
  }
}

export type DesktopHandoff = {
  bridge: DesktopBridge;
  /**
   * Starts one attempt. The `callbackURL` is where the browser should land
   * once it is signed in; the `verifier` is what this window trades for the
   * session afterwards and never leaves it. `destination` is where to go once
   * that works, including after a reload that resumes the attempt.
   */
  begin: (destination: string) => Promise<{
    challenge: string;
    verifier: string;
    callbackURL: Route;
  }>;
  /** Resolves once the browser approved. The window is signed in by then. */
  wait: (verifier: string) => Promise<void>;
  /** Stops waiting, and forgets the attempt. */
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

/** Trades the secret for a session, once the browser has approved it. */
async function poll(verifier: string, signal: AbortSignal): Promise<void> {
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
}

/**
 * The one poller. Several components use this hook on the same screen, and
 * an approval can only be spent once, so they share a single attempt rather
 * than racing each other for it.
 */
let live: AbortController | null = null;

/**
 * Signing in through the user's real browser, from the desktop app.
 *
 * Google refuses OAuth to embedded browsers, and every emailed link (magic
 * link, email verification) opens in the default browser rather than in this
 * window. Both leave the session where the app cannot reach it. So the app
 * asks for the sign-in to happen out there and waits to be handed the result:
 * `begin` makes the one-time secret, the browser approves it on the handoff
 * page, and the window trades it for a session cookie.
 *
 * Null in an ordinary browser, where none of this is needed. It is also null
 * on the first client render, before the bridge can be read, so the browser
 * path is what renders until the shell is confirmed.
 */
export function useDesktopHandoff(): DesktopHandoff | null {
  const [bridge, setBridge] = useState<DesktopBridge | null>(null);

  useEffect(() => setBridge(getDesktopBridge()), []);

  const begin = useCallback(async (destination: string) => {
    live?.abort();
    live = new AbortController();
    const verifier = createVerifier();
    const challenge = await challengeFor(verifier);
    writeAttempt({ verifier, destination, startedAt: Date.now() });
    return { challenge, verifier, callbackURL: handoffPath(challenge) };
  }, []);

  const wait = useCallback(async (verifier: string) => {
    const controller = live ?? new AbortController();
    try {
      await poll(verifier, controller.signal);
      writeAttempt(null);
    } finally {
      // Whether it worked or timed out, this stretch of polling is over, so a
      // later return to the window is free to pick the attempt up again.
      if (live === controller) live = null;
    }
  }, []);

  const cancel = useCallback(() => {
    live?.abort();
    live = null;
    writeAttempt(null);
  }, []);

  /**
   * Picks an abandoned attempt back up.
   *
   * The browser's approval waits on the server for a few minutes, so an app
   * that was restarted, or that stopped polling while the user was in their
   * inbox, still finishes the sign-in. Coming back to the window is the cue,
   * which is exactly what the `onirix://` link does after an approval.
   */
  useEffect(() => {
    if (!bridge) return;

    const resume = () => {
      if (live && !live.signal.aborted) return;
      const attempt = readAttempt();
      if (!attempt) return;
      const controller = new AbortController();
      live = controller;
      poll(attempt.verifier, controller.signal)
        .then(() => {
          writeAttempt(null);
          // A full load: the session cookie is new and every server component
          // should read it from scratch.
          window.location.assign(attempt.destination);
        })
        .catch(() => {
          // Nothing came of it. The attempt stays on disk until it ages out,
          // so the next time the window is looked at it tries once more.
        })
        .finally(() => {
          if (live === controller) live = null;
        });
    };

    resume();
    window.addEventListener("focus", resume);
    return () => window.removeEventListener("focus", resume);
  }, [bridge]);

  return bridge ? { bridge, begin, wait, cancel } : null;
}

/** True when an error is a cancelled wait rather than a real failure. */
export function isCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
