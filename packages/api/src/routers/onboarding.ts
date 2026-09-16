/**
 * Onboarding: create an organization and choose the models that power it.
 *
 * PRODUCT.md wants the gap between signing up and useful AI to be small, so
 * setup is a short checklist — name the workspace, connect a provider — that
 * the user works through inside the app rather than behind a wizard.
 *
 * Each step is its own mutation so progress survives a reload, and connecting
 * a provider here is the same call the Language Models page makes later, so a
 * workspace's first provider and its fifth take exactly one code path.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@onirix/db";
import {
  invitation,
  llmConfig,
  llmProvider,
  member,
  organization as organizationTable,
  session as sessionTable,
  user as userTable,
} from "@onirix/db/schema";
import { resolvePrincipal } from "@onirix/db/principal";
import { PROVIDERS } from "@onirix/llm";

import { orgProcedure, protectedProcedure, router } from "../index";
import { connectInput, connectProvider } from "./models";

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Suffix keeps slugs unique without a retry loop on collision.
  return `${base || "workspace"}-${randomUUID().slice(0, 6)}`;
}

/**
 * Live invitations waiting for an email address.
 *
 * Signing in puts a user on one of two paths: they were invited into an
 * existing workspace, or they are starting one. This is what tells them apart,
 * so it backs both the query the onboarding screen renders and the guard that
 * stops an invitee creating a second workspace by accident.
 *
 * Better Auth only marks an invitation expired when someone tries to use it, so
 * a row can sit at "pending" long past its date — the expiry is filtered here
 * rather than trusted from the status. Addresses are compared case-insensitively
 * because the inviter types the address by hand and the invitee's own is
 * whatever they signed up with.
 */
function pendingInvitationsFor(db: Database, email: string) {
  return db
    .select({
      id: invitation.id,
      organizationId: invitation.organizationId,
      organizationName: organizationTable.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      inviterName: userTable.name,
      inviterEmail: userTable.email,
    })
    .from(invitation)
    .innerJoin(organizationTable, eq(organizationTable.id, invitation.organizationId))
    .innerJoin(userTable, eq(userTable.id, invitation.inviterId))
    .where(
      and(
        sql`lower(${invitation.email}) = ${email.toLowerCase()}`,
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.createdAt));
}

export const onboardingRouter = router({
  /**
   * Model catalog for the picker: every provider Onirix can talk to, and what
   * connecting one asks for. Credentials are not part of it — they are the
   * workspace's own, pasted into the dialog.
   */
  providers: protectedProcedure.query(() => {
    return Object.values(PROVIDERS).map((provider) => ({
      id: provider.id,
      label: provider.label,
      description: provider.description,
      requiresApiKey: provider.requiresApiKey,
      selfHosted: provider.selfHosted,
      defaultBaseUrl: provider.defaultBaseUrl ?? null,
      selfHostedLabel: provider.selfHostedLabel ?? null,
      cloud: provider.cloud ?? null,
      chatModels: provider.chatModels,
      embeddingModels: provider.embeddingModels,
      /** True when connecting this provider alone is enough to index. */
      servesEmbeddings: provider.embeddingModels.length > 0,
    }));
  }),

  /** Which setup steps are still outstanding. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const principal = await resolvePrincipal(
      ctx.db,
      ctx.session!.user.id,
      ctx.session!.session.activeOrganizationId,
    );

    const organization = principal
      ? await ctx.db.query.organization.findFirst({
          where: eq(organizationTable.id, principal.organizationId),
          with: { llmConfig: true, llmProviders: true },
        })
      : null;

    const config = organization?.llmConfig ?? null;

    return {
      hasOrganization: Boolean(principal),
      hasModelConfig: Boolean(config),
      organizationName: organization?.name ?? null,
      connectedProvider: config?.chatProvider ?? null,
      connectedModels:
        organization?.llmProviders.flatMap((row) => row.chatModels) ?? [],
    };
  }),

  /**
   * Invitations waiting for the signed-in user.
   *
   * Onboarding asks this before offering to create anything: an invited user
   * has a workspace already and should join it, not start a second one that
   * their colleagues cannot see. Scoped to the caller's own address, so it
   * reveals nothing about who else has been invited anywhere.
   */
  myInvitations: protectedProcedure.query(async ({ ctx }) => {
    const rows = await pendingInvitationsFor(ctx.db, ctx.session!.user.email);
    return rows.map((row) => ({ ...row, role: row.role ?? "member" }));
  }),

  /** Step one: name the workspace. The creator owns it. */
  createWorkspace: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;

      const existing = await ctx.db.query.member.findFirst({
        where: eq(member.userId, userId),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already belong to an organization.",
        });
      }

      // An invited user belongs somewhere already. Letting them name a
      // workspace here would strand the invitation and split the customer
      // across two tenants that cannot see each other's knowledge — the same
      // reason `allowUserToCreateOrganization` is off in the auth config. The
      // UI does not offer the choice; this is what makes it true of the API.
      const invited = await pendingInvitationsFor(ctx.db, ctx.session!.user.email);
      if (invited.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `You have been invited to ${invited[0]!.organizationName}. Accept that invitation instead of creating a new workspace.`,
        });
      }

      const organizationId = randomUUID();

      await ctx.db.transaction(async (tx) => {
        await tx.insert(organizationTable).values({
          id: organizationId,
          name: input.name,
          slug: slugify(input.name),
        });

        await tx.insert(member).values({
          id: randomUUID(),
          organizationId,
          userId,
          role: "owner",
        });

        // The session predates the membership — it was minted at signup, when
        // there was nothing to point it at — so Better Auth's session hook
        // could not stamp it. Without this the owner can use the workspace but
        // every organization endpoint (create a team, invite a member)
        // fails with "No active organization" until they sign in again.
        //
        // Only sessions with nothing set, so a second device already acting as
        // another workspace is not yanked over to this one.
        await tx
          .update(sessionTable)
          .set({ activeOrganizationId: organizationId })
          .where(
            and(eq(sessionTable.userId, userId), isNull(sessionTable.activeOrganizationId)),
          );
      });

      return { organizationId };
    }),

  /**
   * Step two: connect a provider and enable models on it.
   *
   * The same mutation the Language Models page uses, so reconnecting after a
   * reset — or adding a second provider later — is this call again.
   */
  connect: orgProcedure
    .input(connectInput)
    .mutation(({ ctx, input }) => connectProvider(ctx, input)),

  /**
   * Drops the workspace's model configuration, sending the owner back to the
   * "connect your models" step.
   *
   * Deliberately narrow: chats, documents and the search index survive, so
   * this is a way to change your mind about a provider, not a way to erase the
   * workspace.
   */
  reset: orgProcedure.mutation(async ({ ctx }) => {
    const { organizationId } = ctx;
    await ctx.db.transaction(async (tx) => {
      await tx.delete(llmConfig).where(eq(llmConfig.organizationId, organizationId));
      await tx
        .delete(llmProvider)
        .where(eq(llmProvider.organizationId, organizationId));
    });
    return { organizationId };
  }),
});
