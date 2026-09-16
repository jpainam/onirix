/**
 * Skills: the instructions the answering model follows.
 *
 * Every skill is a row, including the ones that ship with the product. Those are
 * seeded from `BUILT_IN_SKILL_SEEDS` the first time a workspace reads its
 * skills, and from that moment they are ordinary rows — edited, disabled and
 * read exactly like any other. Nothing about how an answer is written is read
 * out of code at answer time.
 *
 * `builtInId` is all that distinguishes them, and it buys two things: a seeded
 * skill can be put back the way it shipped, and it cannot be deleted outright,
 * since the product's grounding rules disappearing on a stray click is not a
 * recoverable state for a workspace to be in.
 */
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@onirix/db";
import { skill, user } from "@onirix/db/schema";
import { builtInSkillSeed, ensureBuiltInSkills, resetBuiltInSkill } from "@onirix/db/skills";

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

/**
 * The fields an admin may change on any skill.
 *
 * `name` and `loading` are absent for a seeded skill — see `update` — and
 * `requiresContext` is absent for every skill: it is how a built-in is wired
 * into the answering path, not a preference.
 */
const skillFields = z.object({
  /**
   * Capped hard, and deliberately. For a skill that loads on demand this line
   * is the whole basis on which the model decides to fetch the body — a
   * paragraph here is a paragraph in every prompt, which is the cost the
   * feature exists to avoid.
   */
  description: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(20_000),
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

const SELECTION = {
  id: skill.id,
  name: skill.name,
  description: skill.description,
  instructions: skill.instructions,
  loading: skill.loading,
  enabled: skill.enabled,
  requiresContext: skill.requiresContext,
  builtInId: skill.builtInId,
  updatedAt: skill.updatedAt,
  // Left join: deleting the author nulls the reference but leaves the skill,
  // which is the right way round — instructions outlive whoever typed them.
  author: user.name,
} as const;

export const skillRouter = router({
  /**
   * Every skill this workspace has, seeding the built-ins if it has none yet.
   *
   * Seeding on read rather than at workspace creation is what covers the two
   * cases a creation hook misses: workspaces that existed before skills did, and
   * a built-in shipped in a later release.
   */
  list: orgProcedure.query(async ({ ctx }) => {
    const read = () =>
      ctx.db
        .select(SELECTION)
        .from(skill)
        .leftJoin(user, eq(user.id, skill.createdBy))
        .where(eq(skill.organizationId, ctx.organizationId))
        .orderBy(asc(skill.name));

    let rows = await read();
    // Passing what was just read means a workspace with nothing missing does no
    // write and no second query.
    const seeded = await ensureBuiltInSkills(
      ctx.db,
      ctx.organizationId,
      rows.map((row) => row.builtInId),
    );
    if (seeded) rows = await read();

    return rows
      .map((row) => ({
        ...row,
        author: row.builtInId ? "Onirix" : (row.author ?? "Unknown"),
        builtIn: row.builtInId !== null,
      }))
      // Built-ins first: they are the product's own answer to "how does this
      // thing behave", which reads better as a block than alphabetised among a
      // workspace's own.
      .sort((a, b) => Number(b.builtIn) - Number(a.builtIn));
  }),

  create: permissionProcedure("skill", "create")
    .input(skillFields.extend({ name: skillName, loading: z.enum(["always", "on_demand"]) }))
    .mutation(async ({ ctx, input }) => {
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
    .input(
      skillFields.extend({
        id: z.string(),
        /** Ignored for a seeded skill, whose name is how it is identified. */
        name: skillName.optional(),
        /** Ignored for a seeded skill: "applied by default" is what it is. */
        loading: z.enum(["always", "on_demand"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await requireOwnSkill(ctx.db, input.id, ctx.organizationId);
      const seeded = existing.builtInId !== null;

      try {
        await ctx.db
          .update(skill)
          .set({
            description: input.description,
            instructions: input.instructions,
            enabled: input.enabled,
            // A seeded skill keeps the name it is seeded under, since that is
            // what `reset` matches on and what the model was told to ask for.
            // It also keeps its loading mode: `grounding` reaching the model
            // only when the model thinks to request it is not a setting anyone
            // wants to arrive at by accident.
            ...(seeded
              ? {}
              : {
                  ...(input.name ? { name: input.name } : {}),
                  ...(input.loading ? { loading: input.loading } : {}),
                }),
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

  /** Restores a seeded skill to the text it shipped with. */
  reset: permissionProcedure("skill", "update")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await requireOwnSkill(ctx.db, input.id, ctx.organizationId);
      if (!existing.builtInId || !builtInSkillSeed(existing.builtInId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a built-in skill has a default to return to.",
        });
      }
      await resetBuiltInSkill(ctx.db, ctx.organizationId, existing.builtInId);
      return { id: input.id };
    }),

  delete: permissionProcedure("skill", "delete")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await requireOwnSkill(ctx.db, input.id, ctx.organizationId);
      if (existing.builtInId) {
        // Deleting would only make it come back: the next read reseeds anything
        // missing. Disabling is the operation that actually holds.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A built-in skill cannot be deleted. Turn it off to stop using it, " +
            "or reset it to its default.",
        });
      }
      await ctx.db.delete(skill).where(eq(skill.id, input.id));
      return { id: input.id };
    }),
});
