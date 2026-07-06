/**
 * HypothesisGraphLoader — DB-driven hypothesis discovery.
 *
 * Reads:
 *   - hypothesis_master
 *   - hypothesis_conditions       (required/supporting/contradicting evidence)
 *   - hypothesis_rule_mapping     (hypothesis → decision_rules ids)
 *   - hypothesis_contradictions   (agronomic contradictions)
 *
 * Contract:
 *   TS scores. TS does NOT filter by crop / stage / DAS with hardcoded lists.
 *   Every hypothesis's own DB rows carry its applicability.
 *
 * Additive: not wired into the runtime.
 */
import type { RequestCache } from './loader-cache.ts';
import type {
  HypothesisCandidate,
  HypothesisId,
  ObservationCode,
  RuleId,
} from './loader-types.ts';

interface ConditionRow {
  hypothesis_id: HypothesisId;
  condition_type: string;
  condition_key: string;
  is_required: boolean;
  is_discriminator: boolean;
  weight: number | null;
}

export class HypothesisGraphLoader {
  constructor(private supabase: any, private cache: RequestCache) {}

  /**
   * Return every hypothesis whose condition_key set overlaps the observation
   * set. Score = matched_required_weight + 0.5 * matched_supporting_weight
   * − 1.0 * matched_contradicting_weight.  No crop/stage filter here — the
   * caller passes an already-scoped observation set.
   */
  async getCandidates(observations: ObservationCode[]): Promise<HypothesisCandidate[]> {
    const obs = Array.from(new Set(observations.filter(Boolean).map((o) => String(o))));
    if (obs.length === 0) return [];
    const cacheKey = `hyp.candidates:${obs.slice().sort().join(',')}`;
    return this.cache.memo(cacheKey, async () => {
      const obsUpper = obs.map((o) => o.toUpperCase());
      const obsLower = obs.map((o) => o.toLowerCase());

      // 1. hypothesis_conditions — which hypotheses list any of these keys?
      const { data: condRows, error: condErr } = await this.supabase
        .from('hypothesis_conditions')
        .select('hypothesis_id, condition_type, condition_key, is_required, is_discriminator, weight')
        .in('condition_key', Array.from(new Set([...obsUpper, ...obsLower])));
      if (condErr) {
        console.warn(`[GRAPH_LOADER][hyp.conditions] error=${condErr.message}`);
        return [];
      }
      const conditions = (condRows ?? []) as ConditionRow[];
      if (conditions.length === 0) return [];

      const hypIds = Array.from(new Set(conditions.map((c) => c.hypothesis_id)));

      // 2. hypothesis_master — enrich metadata (active only).
      const { data: masterRows } = await this.supabase
        .from('hypothesis_master')
        .select('hypothesis_id, canonical_group, is_active, crop_group')
        .in('hypothesis_id', hypIds)
        .eq('is_active', true);
      const master = new Map<string, any>();
      for (const m of masterRows ?? []) master.set(m.hypothesis_id, m);

      // 3. hypothesis_rule_mapping — attach candidate rule ids.
      const { data: hrmRows } = await this.supabase
        .from('hypothesis_rule_mapping')
        .select('hypothesis_id, rule_id, priority')
        .in('hypothesis_id', hypIds)
        .order('priority', { ascending: false });
      const ruleMap = new Map<string, RuleId[]>();
      for (const r of hrmRows ?? []) {
        const list = ruleMap.get(r.hypothesis_id) ?? [];
        list.push(r.rule_id);
        ruleMap.set(r.hypothesis_id, list);
      }

      // 4. hypothesis_contradictions — for later penalty.
      const { data: contraRows } = await this.supabase
        .from('hypothesis_contradictions')
        .select('hypothesis_id, contradiction_type, contradiction_key')
        .in('hypothesis_id', hypIds);
      const contra = new Map<string, string[]>();
      for (const c of contraRows ?? []) {
        const list = contra.get(c.hypothesis_id) ?? [];
        list.push(String(c.contradiction_key));
        contra.set(c.hypothesis_id, list);
      }

      // 5. Score & assemble.
      const obsSet = new Set([...obsUpper, ...obsLower]);
      const byHyp = new Map<string, ConditionRow[]>();
      for (const c of conditions) {
        const l = byHyp.get(c.hypothesis_id) ?? [];
        l.push(c);
        byHyp.set(c.hypothesis_id, l);
      }

      const out: HypothesisCandidate[] = [];
      for (const [hid, rows] of byHyp) {
        if (!master.has(hid)) continue; // inactive hypothesis
        const required: ObservationCode[] = [];
        const supporting: ObservationCode[] = [];
        let raw = 0;
        for (const r of rows) {
          const w = typeof r.weight === 'number' ? r.weight : 1;
          const matched = obsSet.has(r.condition_key) ||
            obsSet.has(String(r.condition_key).toUpperCase()) ||
            obsSet.has(String(r.condition_key).toLowerCase());
          if (r.is_required) required.push(r.condition_key);
          else supporting.push(r.condition_key);
          if (matched) raw += r.is_required ? w : 0.5 * w;
        }
        const contradictingHits = (contra.get(hid) ?? []).filter((k) => obsSet.has(k)).length;
        raw -= 1.0 * contradictingHits;

        out.push({
          hypothesis_id: hid,
          canonical_group: master.get(hid)?.canonical_group ?? null,
          required_evidence: required,
          supporting_evidence: supporting,
          contradicting_evidence: contra.get(hid) ?? [],
          candidate_rule_ids: ruleMap.get(hid) ?? [],
          raw_score: raw,
        });
      }
      out.sort((a, b) => b.raw_score - a.raw_score);
      return out;
    });
  }

  /** Return hypothesis nodes by id (metadata only). */
  async getByIds(ids: HypothesisId[]): Promise<Record<string, any>> {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (uniq.length === 0) return {};
    const key = `hyp.byIds:${uniq.sort().join(',')}`;
    return this.cache.memo(key, async () => {
      const { data } = await this.supabase
        .from('hypothesis_master')
        .select('hypothesis_id, canonical_group, crop_group, cause_name_en, cause_name_mr, cause_name_hi, is_active, biological_basis, severity_model')
        .in('hypothesis_id', uniq);
      const map: Record<string, any> = {};
      for (const r of data ?? []) map[r.hypothesis_id] = r;
      return map;
    });
  }
}
