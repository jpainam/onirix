/**
 * Post-retrieval score adjustment.
 *
 * OpenSearch's normalization processor runs last and only over the independent
 * sub-query results, so recency and boost cannot be folded into the query
 * itself without distorting it (see the note in `query.ts`). Onyx applies these
 * in code against an already-filtered candidate set, and so do we.
 */
import type { SearchHit } from "./client";

/**
 * Decay strength. Score is divided by `1 + DOC_TIME_DECAY * ageInYears`, so at
 * the default of 0.5 a two-year-old document scores half a fresh one.
 * Set to 0 to disable decay.
 */
export const DOC_TIME_DECAY = 0.5;

/** Documents with no known update time are treated as this old. */
const ASSUMED_DOCUMENT_AGE_DAYS = 90;

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

/**
 * Maps an integer boost (net up/downvotes) onto a score multiplier via a
 * sigmoid: heavily downvoted bottoms out near 0.5x, heavily upvoted tops out
 * near 2x. Dividing by 3 stretches the curve so it approaches the asymptotes
 * gradually rather than saturating after a couple of votes.
 */
export function boostToMultiplier(boost: number): number {
  if (boost < 0) {
    // 0.5 + sigmoid, giving a range of 0.5 to 1.
    return 0.5 + 1 / (1 + Math.exp(-boost / 3));
  }
  // 2 x sigmoid, giving a range of 1 to 2.
  return 2 / (1 + Math.exp(-boost / 3));
}

export function recencyMultiplier(
  lastUpdatedEpochSeconds: number | null,
  decay: number = DOC_TIME_DECAY,
  now: number = Date.now(),
): number {
  if (decay === 0) return 1;

  const nowSeconds = now / 1000;
  const updated =
    lastUpdatedEpochSeconds ?? nowSeconds - ASSUMED_DOCUMENT_AGE_DAYS * 24 * 60 * 60;

  // Clock skew or a source reporting a future date must not boost a document.
  const ageYears = Math.max(0, (nowSeconds - updated) / SECONDS_PER_YEAR);
  return 1 / (1 + decay * ageYears);
}

/**
 * Applies recency decay and per-document boost, then re-sorts.
 *
 * `recencyBias` scales the decay for queries that care more about freshness
 * than usual; 0 disables decay for that query.
 */
export function rerank(
  hits: SearchHit[],
  options: { recencyBias?: number; now?: number } = {},
): SearchHit[] {
  const decay = DOC_TIME_DECAY * (options.recencyBias ?? 1);

  return hits
    .map((hit) => ({
      ...hit,
      score:
        hit.score *
        recencyMultiplier(hit.last_updated, decay, options.now) *
        boostToMultiplier(hit.global_boost ?? 0),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Collapses chunk hits to the best chunk per document.
 *
 * Citations reference documents, so several chunks of one document would
 * otherwise crowd out other sources. Hits must already be score-sorted.
 */
export function dedupeByDocument(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const result: SearchHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.document_id)) continue;
    seen.add(hit.document_id);
    result.push(hit);
  }
  return result;
}
