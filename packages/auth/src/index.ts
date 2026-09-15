import { expo } from "@better-auth/expo";
import type { Database } from "@onirix/db";
import * as schema from "@onirix/db/schema/auth";
import { type EmailConfig, createMailer } from "@onirix/transactional";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";

export type AuthConfig = EmailConfig & {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
};

export function createAuth(env: AuthConfig, database: Database) {
  const mailer = createMailer(env);

  // Google is only offered when the deployment has credentials for it, so a
  // self-hosted instance without an OAuth app still boots.
  const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.BETTER_AUTH_URL, "onirix://", "exp://", "http://localhost:8081"],
    emailAndPassword: {
      enabled: true,
      // Verification is what makes implicit account linking safe: Better Auth
      // only merges a Google identity into an existing row when that row's
      // email is already verified, so an unverified signup at someone else's
      // address cannot capture their Google sign-in.
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.sendAuthLink({ kind: "reset-password", to: user.email, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // A password sign-in by an unverified user is a dead end otherwise: the
      // original email may be old or lost, so mail a fresh link on the attempt.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.sendAuthLink({ kind: "verify-email", to: user.email, url });
      },
    },
    socialProviders: googleConfigured
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {},
    account: {
      accountLinking: {
        enabled: true,
        // All three providers prove control of the address before linking:
        // Google asserts `email_verified`, and both magic link and password
        // signup only reach a verified state by clicking a mailed link.
        trustedProviders: ["google", "email-password"],
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // nextCookies must come last: plugins with `hooks.after` that run after it
    // set cookies the framework cookie store never receives.
    plugins: [
      magicLink({
        // Clicking the link is itself proof of address ownership, so a magic
        // link signup produces an already-verified user that Google can link to.
        sendMagicLink: async ({ email, url }) => {
          await mailer.sendAuthLink({ kind: "magic-link", to: email, url });
        },
      }),
      expo(),
      nextCookies(),
    ],
  });
}
