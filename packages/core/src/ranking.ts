/**
 * Composite recall scoring — the Stanford generative-agents formula that every serious
 * memory system converged on: relevance × recency × importance(helpfulness).
 *
 * Cheap, explainable signals first; an optional LLM rerank can layer on top later.
 */

export interface RankInput {
  /** Similarity / fused retrieval score in [0, 1]. */
  relevance: number;
  /** When the memory was created. */
  createdAt: Date;
  helpfulCount: number;
  notHelpfulCount: number;
  useCount: number;
}

export interface RankOptions {
  now?: Date;
  /** Days for recency to decay to half weight. */
  recencyHalfLifeDays?: number;
  /** Max multiplier the helpfulness signal can contribute. */
  maxHelpfulnessBoost?: number;
}

const DAY_MS = 86_400_000;

/** Exponential recency decay → (0, 1]. */
export function recencyDecay(createdAt: Date, now: Date, halfLifeDays: number): number {
  const ageDays = Math.max(0, (now.getTime() - createdAt.getTime()) / DAY_MS);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/** Wilson-ish helpfulness boost in [1, maxBoost], damped by low evidence. */
export function helpfulnessBoost(
  helpful: number,
  notHelpful: number,
  useCount: number,
  maxBoost: number,
): number {
  const signal = helpful - notHelpful;
  if (signal <= 0) return 1;
  const evidence = Math.log1p(useCount + helpful + notHelpful);
  const raw = 1 + (signal / (signal + 2)) * (maxBoost - 1);
  // damp when there's little evidence behind the signal
  return 1 + (raw - 1) * Math.min(1, evidence / Math.log(10));
}

export function compositeScore(input: RankInput, opts: RankOptions = {}): number {
  const now = opts.now ?? new Date();
  const halfLife = opts.recencyHalfLifeDays ?? 60;
  const maxBoost = opts.maxHelpfulnessBoost ?? 1.5;

  const recency = recencyDecay(input.createdAt, now, halfLife);
  const boost = helpfulnessBoost(
    input.helpfulCount,
    input.notHelpfulCount,
    input.useCount,
    maxBoost,
  );
  return input.relevance * recency * boost;
}
