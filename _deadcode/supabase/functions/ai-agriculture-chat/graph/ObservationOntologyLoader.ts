/**
 * ObservationOntologyLoader — DB-driven observation validation.
 *
 * Reads:
 *   - observation_master (canonical observations, universality via applicable_crop_groups)
 *   - observation_aliases (farmer-facing text → canonical_code)
 *   - intent_observation_mapping (curated INTENT × CROP × STAGE × DAS allowlist)
 *
 * Contract:
 *   TS decides nothing about agronomy. Every judgment ("valid for this crop
 *   at this stage") is a round-trip to the DB.
 *
 * Additive: nothing in the runtime imports this yet.
 */
import type { RequestCache } from './loader-cache.ts';
import type {
  GraphContext,
  ObservationCode,
  ObservationNode,
  ObservationValidation,
} from './loader-types.ts';

const UNIVERSAL_MARKERS = new Set(['ALL', 'UNIVERSAL', '*']);

export class ObservationOntologyLoader {
  constructor(private supabase: any, private cache: RequestCache) {}

  /** Resolve a farmer-facing token or code to a canonical observation code. */
  async resolveSymbol(token: string, language: string | null = null): Promise<ObservationCode | null> {
    const norm = String(token || '').trim().toLowerCase();
    if (!norm) return null;
    const key = `obs.resolve:${language ?? '_'}:${norm}`;
    return this.cache.memo(key, async () => {
      // Try exact canonical_code hit first.
      const { data: codeHit } = await this.supabase
        .from('observation_master')
        .select('observation_code')
        .ilike('observation_code', norm)
        .limit(1);
      if (codeHit?.[0]?.observation_code) return codeHit[0].observation_code as string;

      // Then alias table.
      let q = this.supabase
        .from('observation_aliases')
        .select('canonical_code, confidence, language')
        .eq('active', true)
        .or(`alias_normalized.eq.${norm},alias_text.ilike.${norm}`)
        .order('confidence', { ascending: false })
        .limit(5);
      if (language) q = q.eq('language', language);
      const { data: aliasHits } = await q;
      return (aliasHits?.[0]?.canonical_code ?? null) as string | null;
    });
  }

  /** Fetch canonical observation nodes. */
  async getNodes(codes: ObservationCode[]): Promise<ObservationNode[]> {
    const uniq = Array.from(new Set(codes.filter(Boolean)));
    if (uniq.length === 0) return [];
    const key = `obs.nodes:${uniq.sort().join(',')}`;
    return this.cache.memo(key, async () => {
      const { data, error } = await this.supabase
        .from('observation_master')
        .select('observation_code, canonical_group, observation_category, severity_level, applicable_crop_groups, applies_to_stages, is_active, symptom_pattern, semantic_class, polarity')
        .in('observation_code', uniq);
      if (error) {
        console.warn(`[GRAPH_LOADER][obs.nodes] error=${error.message}`);
        return [];
      }
      return (data ?? []).map((r: any) => ({
        observation_code: r.observation_code,
        scope: this.deriveScope(r.applicable_crop_groups),
        category: r.observation_category ?? r.canonical_group ?? null,
        severity_class: r.severity_level ?? null,
        metadata: {
          applies_to_stages: r.applies_to_stages ?? null,
          applicable_crop_groups: r.applicable_crop_groups ?? null,
          symptom_pattern: r.symptom_pattern ?? null,
          semantic_class: r.semantic_class ?? null,
          polarity: r.polarity ?? null,
          is_active: r.is_active,
        },
      })) as ObservationNode[];
    });
  }

  /**
   * Validate one observation against context (INTENT × CROP × STAGE × DAS).
   * IOM hit → IOM_ANCHORED. Universal observation → UNIVERSAL. Else UNKNOWN.
   */
  async validate(code: ObservationCode, ctx: GraphContext): Promise<ObservationValidation> {
    const cacheKey =
      `obs.validate:${code}|${ctx.intent_code ?? '_'}|${ctx.crop_code ?? '_'}|${ctx.stage_code ?? '_'}|${ctx.das ?? '_'}`;
    return this.cache.memo(cacheKey, async () => {
      const codeUpper = String(code || '').trim();
      if (!codeUpper) {
        return { observation_code: code, valid: false, confidence: 0, reason: 'EMPTY_CODE', relationship: 'UNKNOWN' };
      }

      // 1. IOM anchored (curated).
      if (ctx.intent_code) {
        const iomQ = this.supabase
          .from('intent_observation_mapping')
          .select('confidence_rank, assertion_strength, das_min, das_max')
          .eq('is_active', true)
          .eq('intent_code', String(ctx.intent_code).toUpperCase())
          .eq('observation_code', codeUpper);
        const { data: iomRows } = await iomQ;
        const iomHit = (iomRows ?? []).find((r: any) => {
          if (ctx.crop_code && r.crop_code && r.crop_code !== ctx.crop_code && r.crop_code !== 'all' && r.crop_code !== 'universal') return false;
          if (ctx.stage_code && r.growth_stage && r.growth_stage !== ctx.stage_code && r.growth_stage !== 'all') return false;
          if (ctx.das != null && r.das_min != null && ctx.das < r.das_min) return false;
          if (ctx.das != null && r.das_max != null && ctx.das > r.das_max) return false;
          return true;
        }) ?? iomRows?.[0];
        if (iomHit) {
          const rank = typeof iomHit.confidence_rank === 'number' ? iomHit.confidence_rank : 5;
          const conf = Math.max(0.1, Math.min(1, 1 - (rank - 1) * 0.15));
          return { observation_code: code, valid: true, confidence: conf, reason: 'IOM_HIT', relationship: 'IOM_ANCHORED' };
        }
      }

      // 2. Universal observation (applicable to all crop groups).
      const [node] = await this.getNodes([code]);
      if (node && node.scope === 'UNIVERSAL') {
        return { observation_code: code, valid: true, confidence: 0.6, reason: 'UNIVERSAL_OBSERVATION', relationship: 'UNIVERSAL' };
      }
      if (node) {
        return { observation_code: code, valid: false, confidence: 0.3, reason: 'NO_IOM_ROW', relationship: 'UNKNOWN' };
      }
      return { observation_code: code, valid: false, confidence: 0, reason: 'CODE_NOT_IN_MASTER', relationship: 'UNKNOWN' };
    });
  }

  /** Batch validate. */
  async validateBatch(codes: ObservationCode[], ctx: GraphContext): Promise<ObservationValidation[]> {
    return Promise.all(codes.map((c) => this.validate(c, ctx)));
  }

  private deriveScope(groups: unknown): 'UNIVERSAL' | 'CROP_SPECIFIC' {
    if (!Array.isArray(groups) || groups.length === 0) return 'CROP_SPECIFIC';
    return groups.some((g) => UNIVERSAL_MARKERS.has(String(g).toUpperCase())) ? 'UNIVERSAL' : 'CROP_SPECIFIC';
  }
}
