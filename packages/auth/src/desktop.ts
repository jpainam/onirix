/**
 * Sign-in handoff for the desktop app.
 *
 * Google refuses to sign anyone in from an embedded browser, and the desktop
 * shell is one, so the desktop cannot run the OAuth dance in its own window.
 * Instead it sends the user to their real browser and waits to be told the
 * outcome. The browser and the window never share a cookie jar, so what
 * travels between them is a short-lived, single-use approval:
 *
 * 1. The window makes a random `verifier`, hashes it into a `challenge`, and
 *    opens `/desktop/sign-in?challenge=…` in the system browser.
 * 2. The user signs in there as usual and lands on `/desktop/handoff`, where
 *    they confirm the sign-in. That calls `approve`, which records "this
 *    challenge may become a session for this user" for a few minutes.
 * 3. Meanwhile the window polls `exchange` with the verifier. Once the
 *    approval exists it is consumed, a fresh session is created for the
 *    window, and its cookie is set on the response.
 *
 * The challenge is public: it sits in the browser's address bar. It is
 * useless without the verifier, which never leaves the window, so a link
 * copied out of the browser cannot be turned into a session elsewhere. The
 * confirmation step on the handoff page is what keeps a crafted link from
 * approving a stranger's challenge with the victim's account.
 */
import { createHash } from "node:crypto";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";

/** Approvals live this long; a sign-in that takes longer starts over. */
const APPROVAL_TTL_MS = 5 * 60 * 1000;

/** Base64url of a SHA-256 digest, which is what a valid challenge is. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

const challengeSchema = z.string().regex(CHALLENGE, "Malformed challenge");

function identifier(challenge: string): string {
  return `desktop-sign-in:${challenge}`;
}

/** The hash the desktop computes in the browser, reproduced on the server. */
export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

export const desktopSignIn = () =>
  ({
    id: "desktop-sign-in",
    endpoints: {
      approveDesktopSignIn: createAuthEndpoint(
        "/desktop/approve",
        {
          method: "POST",
          body: z.object({ challenge: challengeSchema }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: identifier(ctx.body.challenge),
            value: ctx.context.session.user.id,
            expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
          });
          return ctx.json({ status: "approved" as const });
        },
      ),
      exchangeDesktopSignIn: createAuthEndpoint(
        "/desktop/exchange",
        {
          method: "POST",
          body: z.object({ verifier: z.string().min(32).max(256) }),
        },
        async (ctx) => {
          const approval = await ctx.context.internalAdapter.consumeVerificationValue(
            identifier(challengeFor(ctx.body.verifier)),
          );
          if (!approval) return ctx.json({ status: "pending" as const });
          if (approval.expiresAt < new Date()) {
            throw new APIError("BAD_REQUEST", { message: "The sign-in expired. Try again." });
          }
          const user = await ctx.context.internalAdapter.findUserById(approval.value);
          if (!user) throw new APIError("BAD_REQUEST", { message: "User not found" });

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not create session" });
          }
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ status: "signed-in" as const });
        },
      ),
    },
    rateLimit: [
      {
        // The window polls exchange every couple of seconds while the user is
        // off in their browser; leave room for that and not much more.
        pathMatcher: (path) => path.startsWith("/desktop/"),
        window: 60,
        max: 60,
      },
    ],
  }) satisfies BetterAuthPlugin;
