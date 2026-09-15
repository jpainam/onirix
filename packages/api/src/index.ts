import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { member } from "@onirix/db/schema";

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
 * Resolves the caller's organization membership and puts it on the context.
 *
 * Every knowledge and chat query is organization-scoped, and PRODUCT.md
 * requires organizations to stay isolated, so resolving membership once here is
 * safer than repeating the join at each call site.
 */
export const orgProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const membership = await ctx.db.query.member.findFirst({
    where: eq(member.userId, ctx.session!.user.id),
    with: { organization: { with: { llmConfig: true } } },
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not belong to an organization yet.",
      cause: "NO_ORGANIZATION",
    });
  }

  return next({
    ctx: {
      ...ctx,
      membership,
      organizationId: membership.organizationId,
      organization: membership.organization,
    },
  });
});

/** Requires owner or admin. Used for configuration and source management. */
export const adminProcedure = orgProcedure.use(({ ctx, next }) => {
  if (ctx.membership.role === "member") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action requires an admin or owner role.",
    });
  }
  return next({ ctx });
});
