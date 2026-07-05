/**
 * ClarificationGraphLoader — DB-driven clarification questions.
 *
 * Reads:
 *   - observation_differential_questions (question_text per obs × crop × lang)
 *
 * ⚠ Current DB state: observation_differential_questions has only 3 rows.
 *    This loader will return an empty set for almost every context. Callers
 *    MUST fall back to the legacy clarification path until ODQ is seeded.
 *    Emit `[GRAPH_LOADER][clarify] empty_odq` when this happens so we can
 *    measure coverage.
 *
 * Additive: not wired.
 */
import type { RequestCache } from './loader-cache.ts';
import type { ClarificationEdge, GraphContext, ObservationCode } from './loader-types.ts';

export class ClarificationGraphLoader {
  constructor(private supabase: any, private cache: RequestCache) {}

  /**
   * For each observation code, return the ODQ question rows scoped by
   * language and optionally crop.  Returns [] when DB has no rows.
   */
  async getQuestions(
    observations: ObservationCode[],
    ctx: GraphContext,
    language: string,
  ): Promise<ClarificationEdge[]> {
    const obs = Array.from(new Set(observations.filter(Boolean)));
    if (obs.length === 0) return [];
    const cacheKey = `clarify.q:${language}|${ctx.crop_code ?? '_'}|${obs.slice().sort().join(',')}`;
    return this.cache.memo(cacheKey, async () => {
      let q = this.supabase
        .from('observation_differential_questions')
        .select('id, observation_code, language, crop_code, question_text')
        .in('observation_code', obs)
        .eq('language', language);
      if (ctx.crop_code) q = q.or(`crop_code.eq.${ctx.crop_code},crop_code.is.null`);
      const { data, error } = await q;
      if (error) {
        console.warn(`[GRAPH_LOADER][clarify.q] error=${error.message}`);
        return [];
      }
      const rows = data ?? [];
      if (rows.length === 0) {
        console.log(
          `[GRAPH_LOADER][clarify] empty_odq lang=${language} crop=${ctx.crop_code ?? '_'} obs=${obs.length}`,
        );
      }
      return rows.map((r: any) => ({
        clarification_id: r.id,
        observation_code: r.observation_code,
        hypothesis_id: null,
        question_key: r.question_text, // opaque handle for renderer
        option_keys: [],
      })) as ClarificationEdge[];
    });
  }
}
