// Harness — reproduces layered-rule-evaluator StageGate for the 29-Aug case
// using the module's own cache loader fed with verbatim DB rows.
import * as StageKnowledgeCache from '../../supabase/functions/ai-agriculture-chat/utils/stage-knowledge-cache.ts';
import { stageFamily, stagesEquivalent } from '../../supabase/functions/ai-agriculture-chat/runtime/stage-family-shim.ts';

const data = JSON.parse(await Deno.readTextFile(new URL('./data.json', import.meta.url)));

function stub(table: string) {
  const rows = table === 'crop_stage_master' ? data.master
    : table === 'crop_stage_graph' ? data.edges
    : [];
  const q: any = {
    select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q,
    then: (res: any) => res({ data: rows, error: null }),
  };
  return q;
}
const supabase = { from: (t: string) => stub(t) };

(globalThis as any).__stageKnowledgeCacheRef = StageKnowledgeCache;
await StageKnowledgeCache.loadStageKnowledge(supabase);
StageKnowledgeCache.enterCultivationLane?.('direct_seeded');

// --- exact copy of the gate arithmetic in convertBundledToRule.when.custom ---
const shim: any = await import('../../supabase/functions/ai-agriculture-chat/runtime/stage-family-shim.ts');
function gate(ruleId: string, stageApplicable: string[], currentStage: string, crop: string) {
  const norm = stageApplicable.map((s) => s.toLowerCase());
  const family = stageFamily(currentStage, crop) as string[];
  const known = typeof shim.isKnownStage === 'function' ? shim.isKnownStage(currentStage, crop) : null;
  const familyKnown = known === null ? family.length > 1 : known; // new logic (old = family.length>1)
  const exactMatch = norm.includes(currentStage);
  const familyMatch = norm.some((s) => stagesEquivalent(currentStage, s, crop));
  let result: string;
  if (exactMatch || familyMatch) result = 'PASS';
  else result = familyKnown ? 'BLOCKED' : 'BYPASS(STAGE_ONTOLOGY_MISSING)';
  console.log(`${ruleId.padEnd(28)} stage_applicable=[${norm.join(',')}] current=${currentStage} ` +
    `family=[${family.join(',')}] known=${known} exact=${exactMatch} familyMatch=${familyMatch} → ${result}`);
  return result;
}

console.log('MODE:', typeof shim.isKnownStage === 'function' ? 'FIXED' : 'ORIGINAL');
const r1 = gate('RICE_NUTR_N_DEFICIT_001', ['tillering', 'panicle_initiation'], 'booting', 'rice');
const r2 = gate('RICE_NUTR_K_DEFICIT_001', ['tillering', 'panicle_initiation', 'booting'], 'booting', 'rice');
const r3 = gate('RICE_NUTR_LCC_KL_001', ['tillering', 'panicle_initiation', 'booting', 'heading'], 'booting', 'rice');
const r4 = gate('SOME_RULE_unknown_stage', ['tillering'], 'not_a_real_stage', 'rice');

// ── RegionGate (FIX 4) — mirrors the evaluator predicate ─────────────────────
function regionGate(ruleId: string, ruleRegion: string | null, landRegion: string | null) {
  const rr = String(ruleRegion ?? '').trim().toUpperCase();
  if (!rr) { console.log(`${ruleId.padEnd(28)} rule_region=NULL (global) → PASS`); return 'PASS'; }
  const lr = String(landRegion ?? '').trim().toUpperCase();
  const res = (!lr || lr !== rr) ? 'BLOCKED' : 'PASS';
  console.log(`${ruleId.padEnd(28)} rule_region=${rr} land_region=${lr || 'UNRESOLVED'} → ${res}`);
  return res;
}

// ── CultivationGate (FIX 5) — real DB-SSOT helper, no re-implementation ──────
import { cultivationLaneMatches } from '../../supabase/functions/ai-agriculture-chat/utils/observation-mapping-cache.ts';
function cultGate(ruleId: string, methods: string[] | null, landMethod: string | null) {
  const res = (!Array.isArray(methods) || methods.length === 0 || cultivationLaneMatches(methods, landMethod))
    ? 'PASS' : 'BLOCKED';
  console.log(`${ruleId.padEnd(28)} rule_methods=[${(methods ?? []).join(',')}] land_method=${landMethod || 'UNRESOLVED'} → ${res}`);
  return res;
}

// ── decision_type mapping (FIX 6) ────────────────────────────────────────────
import { __testNormalizeDecisionType } from '../../supabase/functions/ai-agriculture-chat/runtime/runtime-trace-collector.ts';

console.log('\n--- RegionGate (land IN-MH, verified from v_land_region) ---');
const g1 = regionGate('RICE_NUTR_K_DEFICIT_001', null, 'IN-MH');
const g2 = regionGate('RICE_NUTR_LCC_KL_001', 'IN-KL', 'IN-MH');
const g3 = regionGate('RICE_NUTR_N_LCC_DIFF_001', 'IN-TN', 'IN-MH');
const g4 = regionGate('SOME_MH_RULE', 'IN-MH', 'IN-MH');
const g5 = regionGate('SOME_KL_RULE_unresolved', 'IN-KL', null);

console.log('\n--- CultivationGate (land direct_seeded) ---');
const c1 = cultGate('rule_any_1878', ['any'], 'direct_seeded');
const c2 = cultGate('rule_transplanted_39', ['transplanted'], 'direct_seeded');
const c3 = cultGate('rule_both_23', ['direct_seeded', 'transplanted'], 'direct_seeded');
const c4 = cultGate('rule_dsr_only_3', ['direct_seeded'], 'direct_seeded');
const c5 = cultGate('rule_transplanted_unres', ['transplanted'], null);
const c6 = cultGate('rule_null_universal', null, null);

console.log('\n--- decision_type mapping (ai_decision_log CHECK values) ---');
for (const a of ['RECOMMEND', 'MONITOR', 'BLOCK', 'NO_ACTION_REQUIRED', 'URGENT_ACTION', 'prescription']) {
  console.log(`  ${a.padEnd(20)} → ${__testNormalizeDecisionType(a)}`);
}

console.log('\n' + JSON.stringify({
  stage: { N: r1, K: r2, LCC_KL: r3, unknown_stage: r4 },
  region: { global: g1, KL: g2, TN: g3, MH: g4, unresolved: g5 },
  cultivation: { any: c1, transplanted: c2, both: c3, dsr: c4, unresolved: c5, nulllist: c6 },
  decision_type: {
    RECOMMEND: __testNormalizeDecisionType('RECOMMEND'),
    NO_ACTION_REQUIRED: __testNormalizeDecisionType('NO_ACTION_REQUIRED'),
  },
}, null, 1));
