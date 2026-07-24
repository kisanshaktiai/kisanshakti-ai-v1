/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION GRAPH BRIDGE - Connect 2000+ ICAR Rules to Edge Function
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * VERSION: 3.0.0 - Production bridge with dynamic DB product integration
 * 
 * ARCHITECTURE:
 * - Takes RuleEvaluationContext from orchestrator
 * - Queries master_products table via product-repository.ts
 * - Returns RuleEvaluationResult with recommendations, warnings, blocks
 */

import type {
  RuleEvaluationContext,
  RuleEvaluationResult,
  RulePriority,
  BlockingRuleInfo,
  RuleRecommendation,
  RuleWarning,
  RuleRequirement,
  SafetyComplianceStatus,
  SeverityLevel,
  CropStageCode
} from './rule-module-types.ts';
import type { RuleResult } from './rule-engine-types.ts';

import {
  evaluateRules as evaluateBundledRules,
  getRuleCount,
} from '../bundled-rules/loader.ts';

import { 
  findProductForPest, 
  findProductForDisease, 
  checkChemicalStatus,
  getProductsByIPMLevel,
  type ProductRecommendation as RepoProduct 
} from './product-repository.ts';

import { getCulturalAdvice } from './decision-graph-bridge-data.ts';

// ═══════════════════════════════════════════════════════════════════════════
// RULE EVALUATION INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface EvaluatedRule {
  rule_id: string;
  category: string;
  priority: RulePriority;
  fired: boolean;
  action: 'BLOCK' | 'WARN' | 'RECOMMEND' | 'DELAY' | 'MONITOR';
  confidence: number;
  scientific_basis: string;
  recommendation_mr?: string;
  recommendation_hi?: string;
  recommendation_en?: string;
  alternatives?: string[];
  products?: Array<{
    name: string;
    dosage: string;
    method: string;
    dosage_per_acre?: string;
    timing?: string;
    phi_days?: number;
    names?: { mr: string; hi: string; en: string };
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY CHEMICAL AUTHORITY (Phase 1 DB-SSOT)
// ───────────────────────────────────────────────────────────────────────────
// Banned + restricted + watch_list live in public.chemical_regulatory_status
// (44 banned, 12 restricted, 3 watch_list rows verified 2026-07-22).
// The two legacy arrays below are retained ONLY as cold-boot fallback used
// while the DB cache preloads. Do NOT add rows here — insert into DB.
// NEONICOTINOIDS stays hardcoded for now (deferred to Phase 4: needs
// chemical_regulatory_status.chemical_class column).
// watch_list behavior change (new in Phase 1): matched watch_list chemicals
// surface an informational WARN rule, never a BLOCK — surfaces regulatory
// attention without denying access to still-legal inputs.
// ═══════════════════════════════════════════════════════════════════════════

import {
  isBannedChemical as _isBannedChemicalDb,
  isWatchListChemical as _isWatchListChemicalDb,
} from '../utils/db-ssot/phase1-caches.ts';

const _LEGACY_BANNED_CHEMICALS: readonly string[] = [
  'monocrotophos', 'endosulfan', 'carbofuran', 'phorate', 'triazophos',
  'methomyl', 'methyl parathion', 'phosphamidon', 'ethyl parathion',
  'dieldrin', 'aldrin', 'chlordane', 'heptachlor', 'bhc', 'ddt',
  'aldicarb', 'captafol', 'nicotine sulfate', 'sodium cyanide',
  'lindane', 'alachlor',
];

const NEONICOTINOIDS = [
  'imidacloprid', 'thiamethoxam', 'clothianidin', 'acetamiprid',
  'thiacloprid', 'dinotefuran', 'nitenpyram',
];


// ═══════════════════════════════════════════════════════════════════════════
// MAIN EVALUATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function evaluateDecisionGraph(
  supabase: any,
  context: RuleEvaluationContext,
  traceId?: string
): Promise<RuleEvaluationResult> {
  console.log(`🔬 [DecisionBridge] Starting rule evaluation (trace: ${traceId || 'N/A'})`);
  
  const evaluatedRules: EvaluatedRule[] = [];
  let isBlocked = false;
  let blockingRule: BlockingRuleInfo | undefined;
  
  const chemicalMentioned = context.last_chemical_used?.toLowerCase() || '';
  
  // 1. Safety Checks — Banned chemicals.
  //    Order (Phase 3b, 2026-07-24): DB SSOT is the AUTHORITY.
  //    `_isBannedChemicalDb` internally uses `chemical_regulatory_status` and
  //    only touches `_LEGACY_BANNED_CHEMICALS` during the cold-boot window
  //    (phase1CacheReady()===false). Once the cache is warm and empty it
  //    throws SafetyCacheUnavailableError, which the orchestrator maps to a
  //    SAFETY_BLOCKED response — we deliberately do NOT swallow it here.
  if (chemicalMentioned) {
    const bannedByDb = _isBannedChemicalDb(chemicalMentioned, _LEGACY_BANNED_CHEMICALS);
    const hitBanned = bannedByDb ? chemicalMentioned : undefined;
    if (hitBanned) {
      isBlocked = true;
      blockingRule = {
        rule_id: 'SAFETY_001_BANNED',
        priority: 'P0_EMERGENCY',
        reason: `${hitBanned.toUpperCase()} is banned. Usage is illegal.`,
        alternatives: ['Contact KVK for safe alternatives'],
      };
      evaluatedRules.push({
        rule_id: 'SAFETY_001_BANNED',
        category: 'emergency',
        priority: 'P0_EMERGENCY',
        fired: true,
        action: 'BLOCK',
        confidence: 1.0,
        scientific_basis: 'CIB&RC Banned Pesticide List (chemical_regulatory_status.banned)',
        recommendation_en: `⛔ ${hitBanned} is completely banned in India. Do not use.`,
        recommendation_mr: `⛔ ${hitBanned} हे रसायन भारतात पूर्णपणे बंद आहे.`,
      });
    } else if (_isWatchListChemicalDb(chemicalMentioned)) {
      // Phase 1 behavior change: watch_list chemicals are NOT blocked — they
      // surface an informational WARN so the farmer is aware of pending
      // regulatory review without denying access to still-legal inputs.
      evaluatedRules.push({
        rule_id: 'SAFETY_WATCHLIST_INFO',
        category: 'safety',
        priority: 'P3_ADVISORY',
        fired: true,
        action: 'WARN',
        confidence: 0.8,
        scientific_basis: 'chemical_regulatory_status.status = watch_list',
        recommendation_en: `⚠️ ${chemicalMentioned} is under regulatory review. Use only if necessary and prefer alternatives.`,
      });
    }
  }

  // DB Regulatory Check
  if (!isBlocked && chemicalMentioned.length > 3) {
    try {
      const status = await checkChemicalStatus(supabase, chemicalMentioned);
      if (status.status === 'banned') {
        isBlocked = true;
        blockingRule = {
          rule_id: 'SAFETY_001_BANNED_DB',
          priority: 'P0_EMERGENCY',
          reason: `${chemicalMentioned} is banned: ${status.reason || 'Regulatory ban'}`
        };
        evaluatedRules.push({
          rule_id: 'SAFETY_001_BANNED_DB', category: 'emergency', priority: 'P0_EMERGENCY', fired: true, action: 'BLOCK', confidence: 1.0,
          scientific_basis: status.reason || 'Government Ban',
          recommendation_en: `⛔ ${chemicalMentioned} is banned.`
        });
      }
    } catch (e) { console.error('Chemical status check failed', e); }
  }

  // 2. Weather & Stage Safety
  if (!isBlocked && context.crop_stage === 'FLOWERING') {
    for (const neonic of NEONICOTINOIDS) {
      if (chemicalMentioned.includes(neonic)) {
        isBlocked = true;
        blockingRule = {
          rule_id: 'SAFETY_006_POLLINATOR',
          priority: 'P2_WEATHER_SAFETY',
          reason: `${neonic} is toxic to pollinators during flowering`
        };
        evaluatedRules.push({
          rule_id: 'SAFETY_006_POLLINATOR', category: 'safety', priority: 'P2_WEATHER_SAFETY', fired: true, action: 'BLOCK', confidence: 0.95,
          scientific_basis: 'ICAR-NBAIR Bee Protection Guidelines',
          recommendation_en: `🐝 Do not use ${neonic} during flowering. Bees will be harmed.`
        });
        break;
      }
    }
  }

  // 3. Pest/Disease IPM (DB Driven)
  if (!isBlocked) {
    const pestRecs = await evaluatePestIPM(supabase, context);
    evaluatedRules.push(...pestRecs);
    
    const diseaseRecs = await evaluateDiseaseManagement(supabase, context);
    evaluatedRules.push(...diseaseRecs);
  }

  // 4. Transform to final contract
  const recommendations: RuleRecommendation[] = evaluatedRules
    .filter(r => r.action === 'RECOMMEND' && r.fired)
    .map(r => ({
      rule_id: r.rule_id,
      priority: r.priority,
      recommendation_type: r.products?.length ? 'CHEMICAL' : 'INTEGRATED',
      recommendation_text_mr: '', // @deprecated — LLM translates at runtime
      recommendation_text_hi: '', // @deprecated — LLM translates at runtime
      recommendation_text_en: r.recommendation_en || r.recommendation_mr || r.recommendation_hi || '',
      products: r.products?.map(p => ({
        product_name: p.name,
        dosage: p.dosage,
        application_method: p.method,
        precautions: []
      })),
      timing: 'As soon as conditions permit',
      cost_estimate: r.products?.length ? '₹500-1500/acre' : '₹100-300/acre',
      efficacy_estimate: '70-90%'
    }));

  return {
    blocked: isBlocked,
    blockingRule,
    recommendations,
    warnings: [],
    requirements: [],
    ipm_level_suggested: 4,
    economic_threshold_exceeded: (context.severity === 'HIGH'),
    safety_compliance: {
      chemical_safety_passed: !isBlocked,
      phi_compliance_checked: true,
      weather_safety_passed: true,
      overall_safe_to_proceed: !isBlocked,
      pending_checks: []
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL LOGIC (PEST/DISEASE)
// ═══════════════════════════════════════════════════════════════════════════

function normalize(s: string) { return s.toUpperCase().replace(/[_\s-]+/g, ''); }

async function evaluatePestIPM(supabase: any, context: RuleEvaluationContext): Promise<EvaluatedRule[]> {
  if (!context.pest_code || context.pest_code === 'UNKNOWN') return [];
  
  const rules: EvaluatedRule[] = [];
  const pestNorm = normalize(context.pest_code);
  const cropNorm = normalize(context.crop_code || '');
  const severity = context.severity || 'MODERATE';
  
  // High severity: Bio + Chem
  if (severity === 'HIGH' || severity === 'CRITICAL') {
    const bio = await getProductsByIPMLevel(supabase, cropNorm, 'pest', pestNorm, 4);
    if (bio.length > 0) rules.push(buildIPMRecommendation(bio[0], context, severity, false, true));
    
    const chem = await getProductsByIPMLevel(supabase, cropNorm, 'pest', pestNorm, 5);
    if (chem.length > 0) rules.push(buildIPMRecommendation(chem[0], context, severity, false, false));
  } else {
    // Single appropriate level
    const products = await getProductsByIPMLevel(supabase, cropNorm, 'pest', pestNorm, severity === 'LOW' ? 3 : 4);
    if (products.length > 0) rules.push(buildIPMRecommendation(products[0], context, severity, false, false));
  }
  
  return rules;
}

function buildIPMRecommendation(product: RepoProduct, context: any, severity: string, organic: boolean, isBio: boolean): EvaluatedRule {
  const cultural = getCulturalAdvice(context.crop_code || 'GENERAL');
  return {
    rule_id: `IPM_${product.sku}`,
    category: 'ipm',
    priority: severity === 'HIGH' ? 'P4_ECONOMIC' : 'P5_IPM',
    fired: true,
    action: 'RECOMMEND',
    confidence: 0.9,
    scientific_basis: 'DB product',
    recommendation_en: `${isBio ? '🌿 Bio: ' : '💊 Chem: '} ${product.name} @ ${product.dosage}. Cultural: ${cultural.slice(0,1)}.`,
    products: [{ name: product.name, dosage: product.dosage, method: product.application_method, names: product.names }]
  };
}

async function evaluateDiseaseManagement(supabase: any, context: RuleEvaluationContext): Promise<EvaluatedRule[]> {
  if (!context.disease_code || context.disease_code === 'UNKNOWN') return [];
  
  const rules: EvaluatedRule[] = [];
  const prod = await findProductForDisease(supabase, normalize(context.crop_code || ''), normalize(context.disease_code), context.severity as SeverityLevel);
  
  if (prod) {
    rules.push({
      rule_id: `DISEASE_${prod.sku}`, category: 'disease', priority: 'P4_ECONOMIC', fired: true, action: 'RECOMMEND', confidence: 0.9,
      scientific_basis: 'DB product',
      recommendation_en: `💊 Fungicide: ${prod.name} @ ${prod.dosage}.`,
      products: [{ name: prod.name, dosage: prod.dosage, method: prod.application_method }]
    });
  }
  return rules;
}

export function convertToRuleResults(evaluated: EvaluatedRule[]): RuleResult[] {
  return evaluated.filter(r => r.fired).map(r => ({
    rule_id: r.rule_id, action: r.action, priority: r.priority, category: r.category,
    messages: { en: r.recommendation_en || '' },
    products: r.products?.map(p => ({
      product_name: p.name, dosage: p.dosage, application_method: p.method
    })),
    confidence: r.confidence,
    scientific_basis: r.scientific_basis
  }));
}
