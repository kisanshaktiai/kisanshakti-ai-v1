/**
 * graph/ — DB-driven graph loader layer.
 *
 * PURPOSE
 *   Single choke-point where the runtime asks the database for agriculture
 *   knowledge (observations, hypotheses, rules, clarifications). No file in
 *   this folder may contain crop / pest / disease / stage / symptom
 *   literals — only node-type names and SQL column names.
 *
 * STATUS (Phase 1)
 *   Additive only. Nothing in the deployed runtime imports these yet.
 *   Wiring happens in Phase 2 behind a feature flag.
 */
export { RequestCache, makeRequestCache } from './loader-cache.ts';
export type {
  IntentCode, ObservationCode, HypothesisId, RuleId, ClarificationId,
  CropCode, StageCode, GraphContext, ObservationNode, ObservationValidation,
  HypothesisCandidate, RuleNode, ClarificationEdge,
} from './loader-types.ts';
export { ObservationOntologyLoader } from './ObservationOntologyLoader.ts';
export { HypothesisGraphLoader } from './HypothesisGraphLoader.ts';
export { RuleGraphLoader } from './RuleGraphLoader.ts';
export { ClarificationGraphLoader } from './ClarificationGraphLoader.ts';

/** Convenience factory — one cache, all four loaders. */
import { makeRequestCache } from './loader-cache.ts';
import { ObservationOntologyLoader } from './ObservationOntologyLoader.ts';
import { HypothesisGraphLoader } from './HypothesisGraphLoader.ts';
import { RuleGraphLoader } from './RuleGraphLoader.ts';
import { ClarificationGraphLoader } from './ClarificationGraphLoader.ts';

export function createGraphLoaders(supabase: any) {
  const cache = makeRequestCache();
  return {
    cache,
    observations:   new ObservationOntologyLoader(supabase, cache),
    hypotheses:     new HypothesisGraphLoader(supabase, cache),
    rules:          new RuleGraphLoader(supabase, cache),
    clarifications: new ClarificationGraphLoader(supabase, cache),
  };
}
