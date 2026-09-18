import type { Route } from "next";

/**
 * The desktop app's side of the sign-in handoff.
 *
 * The desktop window cannot sign in with Google itself (Google refuses OAuth
 * from embedded browsers), so it sends the user to their real browser and
 * polls the server until that browser has approved the sign-in. The server
 * half lives in `@onirix/auth`'s `desktopSignIn` plugin; this file holds
 * what both the window and the pages the browser opens agree on.
 */

/** Base64url of a SHA-256 digest: the only shape a challenge may have. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function isChallenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE.test(value);
}

/**
 * Where the browser lands once signed in, to approve this challenge.
 *
 * Typed routes cannot check a query string built at runtime, so the cast is
 * what stands in for them; the path itself is a literal above.
 */
export function handoffPath(challenge: string): Route {
  return `/desktop/handoff?challenge=${challenge}` as Route;
}

/** The page the desktop opens in the browser to begin the sign-in. */
export function signInPath(challenge: string, provider: "google"): string {
  return `/desktop/sign-in?provider=${provider}&challenge=${challenge}`;
}

/** The ordinary login page, on its way to `handoffPath(challenge)`. */
export function loginThenHandoff(challenge: string): Route {
  return `/login?next=${encodeURIComponent(handoffPath(challenge))}` as Route;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A secret that never leaves the desktop window. */
export function createVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The public counterpart of a verifier, computed the same way the server does. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}
