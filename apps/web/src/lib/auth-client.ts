import type { Route } from "next";
import { magicLinkClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // The organization plugin backs every membership, team and invitation
  // mutation. Onirix reads this data over tRPC but writes it through here, so
  // Better Auth's own permission checks and owner protections always apply.
  plugins: [magicLinkClient(), organizationClient({ teams: { enabled: true } })],
});

/** Where a user lands once any of the sign-in paths succeeds. */
export const AFTER_SIGN_IN = "/chat";

/**
 * Where to land after signing in, honouring a `?next=` handoff.
 *
 * An invitation link sends a signed-out invitee to `/login?next=...` so they
 * come back to the invitation rather than to an empty workspace. Only
 * same-origin paths are accepted: `next` arrives in a URL that anyone can
 * compose and email, so echoing it into a redirect unfiltered would make every
 * sign-in link an open redirect. `//evil.com` and `/\evil.com` read as paths to
 * a naive `startsWith("/")` but as hosts to the browser, so they are rejected
 * too.
 */
export function resolveNext(next: string | null | undefined): Route {
  if (!next || !next.startsWith("/")) return AFTER_SIGN_IN;
  if (next[1] === "/" || next[1] === "\\") return AFTER_SIGN_IN;
  // Typed routes cannot check a value that only exists at runtime; the checks
  // above are what stand in for them.
  return next as Route;
}
