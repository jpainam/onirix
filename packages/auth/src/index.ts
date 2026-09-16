import { expo } from "@better-auth/expo";
import type { Database } from "@onirix/db";
import { account, session, user, verification } from "@onirix/db/schema/auth";
import {
  invitation,
  member,
  organization as organizationTable,
  team,
  teamMember,
} from "@onirix/db/schema/organization";
import { type EmailConfig, createMailer } from "@onirix/transactional";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins/organization";
import { magicLink } from "better-auth/plugins/magic-link";

/**
 * Tables the adapter may read and write.
 *
 * The organization plugin owns `organization`, `member`, `invitation`, `team`
 * and `teamMember`; the keys here have to match the model names it asks for,
 * which is why `teamMember` is spelled in camel case while its table is
 * `team_member`.
 */
const schema = {
  user,
  session,
  account,
  verification,
  organization: organizationTable,
  member,
  invitation,
  team,
  teamMember,
};

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
    databaseHooks: {
      session: {
        create: {
          /**
           * Stamp the session with the organization it is acting as.
           *
           * Better Auth's own organization endpoints — creating a department,
           * inviting a member, changing a role — read `activeOrganizationId`
           * off the session and reject the call with "No active organization"
           * when it is null. Nothing else sets it: workspaces are created
           * directly in onboarding rather than through `organization.create`,
           * and only `acceptInvitation` calls `setActiveOrganization`. So a
           * session that is never stamped here can read the workspace (the
           * app's own scoping falls back to the oldest membership) but cannot
           * administer it.
           *
           * Oldest membership, matching `resolvePrincipal`, so the session and
           * every request made with it agree on which workspace is in scope.
           */
          before: async (sessionData) => {
            const membership = await database.query.member.findFirst({
              where: (table, { eq }) => eq(table.userId, sessionData.userId),
              orderBy: (table, { asc }) => asc(table.createdAt),
            });
            if (!membership) return;

            return {
              data: { ...sessionData, activeOrganizationId: membership.organizationId },
            };
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // nextCookies must come last: plugins with `hooks.after` that run after it
    // set cookies the framework cookie store never receives.
    plugins: [
      organization({
        // Teams are departments — Engineering, Sales, HR — and the unit that
        // document visibility is granted to. Onirix's whole privacy model rests
        // on them, so they are on unconditionally rather than by configuration.
        teams: { enabled: true },
        // A workspace is created during onboarding and is the customer's
        // tenant boundary; letting members spin up more from the UI would
        // fragment their knowledge across tenants that cannot see each other.
        allowUserToCreateOrganization: false,
        // Long enough to survive a weekend, short enough that a forwarded
        // invitation does not stay live indefinitely.
        invitationExpiresIn: 60 * 60 * 24 * 7,
        cancelPendingInvitationsOnReInvite: true,
        sendInvitationEmail: async ({ email, organization: org, inviter, invitation: invite }) => {
          await mailer.sendOrganizationInvite({
            to: email,
            organizationName: org.name,
            inviterName: inviter.user.name || inviter.user.email,
            url: `${env.BETTER_AUTH_URL}/accept-invitation/${invite.id}`,
          });
        },
      }),
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
