/**
 * Skills: the instructions the answering model follows.
 *
 * A workspace's own skills are rows; the ones that ship with the product are
 * code constants in `@onirix/llm`. Both reach the model through one namespace,
 * so this router is where the two are merged for reading and where a custom
 * skill is stopped from taking a built-in's name.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@onirix/db";
import { skill } from "@onirix/db/schema";
import { BUILT_IN_SKILLS, isBuiltInSkillName } from "@onirix/llm";

import { orgProcedure, permissionProcedure, router } from "../index";

/**
 * The name is written by a model into a tool argument, not read by a person, so
 * it is constrained to the shape a model can reproduce exactly: lowercase, with
 * single hyphens between words.
 */
const skillName = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single hyphens, e.g. expense-policy.",
  );

const skillInput = z.object({
  name: skillName,
  /**
   * Capped hard, and deliberately. For a skill that loads on demand this line
   * is the whole basis on which the model decides to fetch the body — a
   * paragraph here is a paragraph in every prompt, which is the cost the
   * feature exists to avoid.
   */
  description: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(20_000),
  loading: z.enum(["always", "on_demand"]).default("on_demand"),
  enabled: z.boolean().default(true),
});

/** Turns the unique-index violation on (organization, name) into a usable message. */
function rethrowDuplicateName(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A skill with that name already exists.",
    });
  }
  throw error;
}

/**
 * Built-in names are reserved.
 *
 * Postgres cannot enforce this — the built-ins are not rows — so it is checked
 * here. Two skills answering to one name would make `load_skill` ambiguous, and
 * the resolver would have to pick a winner no admin could predict.
 */
function assertNameAvailable(name: string): void {
  if (isBuiltInSkillName(name)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `"${name}" is a built-in skill. Choose another name.`,
    });
  }
}

/** Ownership probe. 404 rather than 403, so a miss does not confirm existence. */
async function requireOwnSkill(db: Database, id: string, organizationId: string) {
  const found = await db.query.skill.findFirst({
    where: and(eq(skill.id, id), eq(skill.organizationId, organizationId)),
  });
  if (!found) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found." });
  }
  return found;
}

export const skillRouter = router({
  /**
   * Every skill the workspace has, built-ins first.
   *
   * Built-ins are returned alongside the workspace's own so the page shows one
   * list rather than making the reader understand the distinction before they
   * can find anything. They carry `builtIn` so the UI can badge them and refuse
   * to edit them.
   */
  list: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        loading: skill.loading,
        enabled: skill.enabled,
        updatedAt: skill.updatedAt,
      })
      .from(skill)
      .where(eq(skill.organizationId, ctx.organizationId))
      .orderBy(asc(skill.name));

    return [
      ...BUILT_IN_SKILLS.map((entry) => ({
        id: `built-in:${entry.name}`,
        name: entry.name,
        description: entry.description,
        instructions: entry.instructions,
        loading: entry.loading,
        enabled: true,
        updatedAt: null as Date | null,
        builtIn: true as const,
      })),
      ...rows.map((row) => ({ ...row, builtIn: false as const })),
    ];
  }),

  create: permissionProcedure("skill", "create")
    .input(skillInput)
    .mutation(async ({ ctx, input }) => {
      assertNameAvailable(input.name);

      const id = randomUUID();
      try {
        await ctx.db.insert(skill).values({
          id,
          organizationId: ctx.organizationId,
          name: input.name,
          description: input.description,
          instructions: input.instructions,
          loading: input.loading,
          enabled: input.enabled,
          createdBy: ctx.principal.userId,
        });
      } catch (error) {
        rethrowDuplicateName(error);
      }

      return { id };
    }),

  update: permissionProcedure("skill", "update")
    .input(skillInput.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await requireOwnSkill(ctx.db, input.id, ctx.organizationId);

      // Only when it actually changes: re-checking an unchanged name would
      // reject a built-in's own row, which cannot exist, but would also reject
      // a rename that merely keeps the name it already holds.
      if (input.name !== existing.name) assertNameAvailable(input.name);

      try {
        await ctx.db
          .update(skill)
          .set({
            name: input.name,
            description: input.description,
            instructions: input.instructions,
            loading: input.loading,
            enabled: input.enabled,
          })
          .where(eq(skill.id, input.id));
      } catch (error) {
        rethrowDuplicateName(error);
      }

      return { id: input.id };
    }),

  /** Takes a skill out of the prompt without losing what was written. */
  setEnabled: permissionProcedure("skill", "update")
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireOwnSkill(ctx.db, input.id, ctx.organizationId);
      await ctx.db
        .update(skill)
        .set({ enabled: input.enabled })
        .where(eq(skill.id, input.id));
      return { id: input.id };
    }),

  delete: permissionProcedure("skill", "delete")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireOwnSkill(ctx.db, input.id, ctx.organizationId);
      await ctx.db.delete(skill).where(eq(skill.id, input.id));
      return { id: input.id };
    }),
});
