import { initTRPC, TRPCError } from "@trpc/server";

import { resolvePrincipal } from "@onirix/db/principal";

import type { Context } from "./context";

export const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/**
 * Resolves the caller's organization, teams, and access tokens onto the context.
 *
 * Every knowledge and chat query is scoped by organization and then filtered by
 * team, and PRODUCT.md requires both boundaries to hold, so this is resolved
 * once here rather than rebuilt at each call site — a call site that forgets is
 * a leak, and there is no way to forget if the answer is already on `ctx`.
 */
export const orgProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const principal = await resolvePrincipal(
    ctx.db,
    ctx.session.user.id,
    ctx.session.session.activeOrganizationId,
  );

  if (!principal) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not belong to an organization yet.",
      cause: "NO_ORGANIZATION",
    });
  }

  const organization = await ctx.db.query.organization.findFirst({
    where: (table, { eq }) => eq(table.id, principal.organizationId),
    with: { llmConfig: true },
  });

  if (!organization) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization not found." });
  }

  return next({
    ctx: {
      ...ctx,
      principal,
      organizationId: principal.organizationId,
      organization,
    },
  });
});

/** Requires owner or admin. Used for configuration and source management. */
export const adminProcedure = orgProcedure.use(({ ctx, next }) => {
  if (ctx.principal.role === "member") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action requires an admin or owner role.",
    });
  }
  return next({ ctx });
});
