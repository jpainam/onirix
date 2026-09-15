/**
 * Direct organizational search, for when the user wants documents rather than
 * a generated answer.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { orgProcedure, router } from "../index";

export const searchRouter = router({
  query: orgProcedure
    .input(
      z.object({
        query: z.string().min(1).max(500),
        sourceTypes: z.array(z.string()).optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const config = ctx.organization.llmConfig;
      if (!config) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This workspace has no model configuration yet.",
        });
      }

      const index = ctx.getDocumentIndex(
        config.embeddingModel,
        Number(config.embeddingDimension),
      );

      // Keyword-only: direct search should be fast and predictable, and
      // skipping the embedding call avoids a provider round trip per keystroke.
      const hits = await index.keywordSearch({
        queryText: input.query,
        numHits: input.limit,
        filters: {
          organizationId: ctx.organizationId,
          accessControlList: ctx.principal.accessControlList,
          sourceTypes: input.sourceTypes,
        },
      });

      return hits.map((hit) => ({
        documentId: hit.document_id,
        title: hit.title ?? hit.semantic_identifier,
        sourceType: hit.source_type,
        blurb: hit.blurb,
        score: hit.score,
        lastUpdated: hit.last_updated,
      }));
    }),
});
