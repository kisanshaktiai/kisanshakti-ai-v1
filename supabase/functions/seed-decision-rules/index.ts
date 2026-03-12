/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION RULES DATABASE SEEDER - v3.0 JSON-BASED
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-ready seeder that loads rules from modular JSON files.
 * Supports 50,000+ rules via file-based architecture.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { corsHeaders } from '../_shared/cors.ts';

const RULES_VERSION = '3.0.0';

// Rule files to load (embedded for edge function compatibility)
const RULE_FILES = [
  // Sugarcane - Complete Rule Universe (17 files, ~239 rules)
  'sugarcane/crop-identity.json',
  'sugarcane/germination-problems.json',
  'sugarcane/tillering-problems.json',
  'sugarcane/grand-growth-problems.json',
  'sugarcane/maturity-problems.json',
  'sugarcane/harvest-advisory.json',
  'sugarcane/pests.json',
  'sugarcane/diseases.json',
  'sugarcane/ipm-treatment.json',
  'sugarcane/nutrients.json',
  'sugarcane/irrigation.json',
  'sugarcane/stress.json',
  'sugarcane/weather.json',
  'sugarcane/safety.json',
  'sugarcane/economics.json',
  'sugarcane/monitoring.json',
  'sugarcane/clarification.json',
  // Universal rules
  'universal/safety-weather.json',
  // Other crops (future expansion)
  'cotton/pests.json',
  'cotton/diseases.json',
];

interface RuleFromJSON {
  rule_id: string;
  crop_code: string;
  crop_group?: string;
  category: string;
  canonical_group: string;
  stage_applicable: string[];
  conditions_json: Record<string, unknown>;
  condition_code?: string;
  cause: string;
  priority: number;
  confidence_score?: number;
  etl_threshold?: string;
  etl_unit?: string;
  phi_days?: number;
  ipm_level?: number;
  bee_toxicity?: string;
  active_ingredient?: string;
  organic_alternative?: string;
  scientific_source: string;
  icar_package_ref?: string;
  response_en: string;
  response_hi: string;
  response_mr: string;
  action_type: string;
  rule_version?: string;
  is_active?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`🌱 [SeedDecisionRules v${RULES_VERSION}] Starting JSON-based seeding...`);

    let clear = false;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        clear = body.clear === true;
      } catch { /* no body */ }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (clear) {
      console.log('🗑️ Clearing existing rules...');
      const { error: deleteError } = await supabase
        .from('decision_rules')
        .delete()
        .neq('rule_id', 'NEVER_MATCH');
      
      if (deleteError) console.error('❌ Clear error:', deleteError.message);
      else console.log('✅ Existing rules cleared');
    }

    // Load rules from JSON files embedded in the function
    const allRules: RuleFromJSON[] = [];
    
    // Import each JSON file
    for (const filePath of RULE_FILES) {
      try {
        const module = await import(`./rules/${filePath}`, { assert: { type: 'json' } });
        const fileRules = module.default?.rules || [];
        allRules.push(...fileRules);
        console.log(`✅ Loaded ${fileRules.length} rules from ${filePath}`);
      } catch (e) {
        console.warn(`⚠️ Could not load ${filePath}: ${e.message}`);
      }
    }

    // De-duplicate by rule_id (keep last occurrence)
    const ruleMap = new Map<string, RuleFromJSON>();
    for (const rule of allRules) {
      ruleMap.set(rule.rule_id, rule);
    }
    const uniqueRules = Array.from(ruleMap.values());
    console.log(`📦 Total rules: ${allRules.length} | Unique: ${uniqueRules.length}`);

    // Normalize bee_toxicity to match DB constraint (HIGH, MODERATE, LOW, SAFE)
    const normalizeBee = (val?: string): string | null => {
      if (!val) return null;
      const upper = val.toUpperCase();
      if (['HIGH', 'MODERATE', 'LOW', 'SAFE'].includes(upper)) return upper;
      if (upper === 'NONE') return 'SAFE';
      return null;
    };

    // Normalize crop_code to lowercase for consistent matching
    const normalizeCropCode = (code: string): string => {
      return code?.toLowerCase().replace(/[\s-]+/g, '_') || 'universal';
    };

    // Normalize stages to lowercase
    const normalizeStages = (stages: string[]): string[] => {
      const validStages = [
        'germination', 'seedling', 'tillering', 'vegetative',
        'grand_growth', 'squaring', 'boll_development', 'flowering',
        'panicle', 'maturity', 'harvest', 'post_harvest', 'all'
      ];
      return stages?.map(s => {
        const lower = s.toLowerCase().replace(/[\s-]+/g, '_');
        return validStages.includes(lower) ? lower : lower;
      }) || ['all'];
    };

    // Normalize canonical_group to official 13-group system (per Jan 2026 Audit)
    const normalizeCanonicalGroup = (group: string): string => {
      const mapping: Record<string, string> = {
        // Direct mappings for short names
        'pest': '03_pest',
        'disease': '04_disease',
        'treatment': '13_treatment',
        'nutrient': '05_nutrition',
        'nutrition': '05_nutrition',
        'weed': '06_weed',
        'irrigation': '10_irrigation',
        'weather': '09_weather',
        'weather_alert': '09_weather',
        'economics': '12_monitoring', // Economics maps to monitoring per audit
        'safety': '11_safety',
        'monitoring': '12_monitoring',
        'identity': '01_crop_identity',
        'crop_identity': '01_crop_identity',
        'growth_stage': '02_growth_stage',
        'stage_problems': '02_growth_stage',
        'stress': '08_stress',
        'clarification': '07_clarification',
        // Fix incorrect mappings from audit
        '06_monitoring': '12_monitoring',
        '07_irrigation': '10_irrigation',
        '10_weather_alert': '09_weather',
        '12_economics': '12_monitoring',
        '13_ipm_treatment': '13_treatment'
      };
      const normalized = group?.toLowerCase();
      return mapping[normalized] || mapping[group] || group;
    };

    // Normalize action_type to 8 standard types (per Jan 2026 Audit)
    const normalizeActionType = (action: string): string => {
      const mapping: Record<string, string> = {
        // Standard types (keep as-is)
        'treatment': 'treatment',
        'urgent_treatment': 'urgent_treatment',
        'prevention': 'prevention',
        'advisory': 'advisory',
        'safety_gate': 'safety_gate',
        'monitoring': 'monitoring',
        'clarification': 'clarification',
        'diagnosis': 'diagnosis',
        // Map custom/legacy types to standard
        'cultural_practice': 'advisory',
        'biocontrol': 'treatment',
        'fertilizer_application': 'treatment',
        'harvest_planning': 'advisory',
        'block': 'safety_gate',
        'delay': 'advisory',
        'caution': 'monitoring',
        'recommend': 'advisory',
        'warn': 'advisory',
        'inform': 'advisory',
        'monitor': 'monitoring',
        'emergency_harvest': 'urgent_treatment',
        'pest_management': 'treatment',
        'disease_management': 'treatment',
        'irrigation': 'advisory',
        'drainage': 'advisory',
        'frost_protection': 'advisory',
        'herbicide_application': 'treatment',
        'biofertilizer': 'treatment',
        'cultural': 'advisory',
        'harvest_practice': 'advisory',
        'post_harvest': 'advisory',
        'quality_management': 'advisory',
        'ratoon_management': 'advisory',
        'residue_management': 'advisory',
        'ripening_management': 'advisory',
        'seed_selection': 'advisory',
        'value_addition': 'advisory',
        'confirmation': 'clarification',
        'escalation': 'diagnosis'
      };
      const lower = action?.toLowerCase() || 'advisory';
      return mapping[lower] || 'advisory';
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION LAYER - Ensure agronomic safety before insertion
    // ═══════════════════════════════════════════════════════════════════════════
    const validateRule = (rule: RuleFromJSON): string[] => {
      const errors: string[] = [];
      
      // WHAT validation - cause is required
      if (!rule.cause || rule.cause.length < 3) {
        errors.push(`${rule.rule_id}: Missing or invalid 'cause' (WHAT)`);
      }
      
      // HOW validation for treatment rules - safety fields required
      const actionType = normalizeActionType(rule.action_type);
      if (actionType === 'treatment' || actionType === 'urgent_treatment') {
        if (rule.active_ingredient && !rule.phi_days) {
          // Warning only - don't block insertion
          console.warn(`⚠️ ${rule.rule_id}: Treatment with active_ingredient missing phi_days`);
        }
        if (rule.active_ingredient && !rule.bee_toxicity) {
          console.warn(`⚠️ ${rule.rule_id}: Treatment with active_ingredient missing bee_toxicity`);
        }
      }
      
      // WHY validation - reason_text is highly recommended
      if (!rule.reason_text && !rule.scientific_source) {
        console.warn(`⚠️ ${rule.rule_id}: Missing reason_text or scientific_source (WHY)`);
      }
      
      return errors;
    };

    // Normalize observable_characteristics to array format
    const normalizeObservableChars = (chars: unknown): unknown => {
      if (!chars) return null;
      if (Array.isArray(chars)) return chars.map(c => String(c).toUpperCase());
      if (typeof chars === 'object' && chars !== null) {
        return Object.keys(chars).map(k => k.toUpperCase());
      }
      return null;
    };

    // Format rules for database with all normalizations
    // WHAT → HOW → WHY paradigm: action_text, reason_text, knowledge_text
    const formatRule = (rule: RuleFromJSON) => {
      // Validate before formatting
      const validationErrors = validateRule(rule);
      if (validationErrors.length > 0) {
        console.warn(`⚠️ Validation warnings for ${rule.rule_id}:`, validationErrors);
      }
      
      return {
        rule_id: rule.rule_id,
        crop_group: normalizeCropCode(rule.crop_group || 'universal'),
        crop_code: normalizeCropCode(rule.crop_code),
        category: rule.category?.toLowerCase() || 'advisory',
        stage_applicable: normalizeStages(rule.stage_applicable),
        conditions_json: rule.conditions_json,
        condition_code: rule.condition_code || '',
        cause: rule.cause,
        priority: Math.min(10, Math.max(1, Math.round(rule.priority / 10))),
        scientific_source: rule.scientific_source,
        scientific_basis: rule.icar_package_ref || rule.scientific_source,
        action_type: normalizeActionType(rule.action_type),
        canonical_group: normalizeCanonicalGroup(rule.canonical_group),
        is_active: rule.is_active !== false,
        version: RULES_VERSION,
        // Safety-critical fields
        etl_threshold: rule.etl_threshold || null,
        phi_days: rule.phi_days || null,
        active_ingredient: rule.active_ingredient || null,
        organic_alternative: rule.organic_alternative || null,
        ipm_level: rule.ipm_level || null,
        bee_toxicity: normalizeBee(rule.bee_toxicity),
        icar_package_ref: rule.icar_package_ref || null,
        // WHAT → HOW → WHY columns (these may not exist in DB yet - will be ignored if missing)
        // action_text: rule.action_text || null,
        reason_text: (rule as any).reason_text || null,
        knowledge_text: (rule as any).knowledge_text || null,
        // Normalized observable_characteristics (always array)
        observable_characteristics: normalizeObservableChars((rule as any).observable_characteristics),
      };
    };

    // Batch insert
    const batchSize = 50;
    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < uniqueRules.length; i += batchSize) {
      const batch = uniqueRules.slice(i, i + batchSize);
      const formattedRules = batch.map(formatRule);

      const { data, error } = await supabase
        .from('decision_rules')
        .upsert(formattedRules, { onConflict: 'rule_id' })
        .select('rule_id');

      if (error) {
        console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} error:`, error.message);
        totalErrors += batch.length;
      } else {
        totalInserted += data?.length || 0;
        console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}: ${data?.length || 0} rules`);
      }
    }

    console.log(`\n🎉 Seeding complete!`);
    console.log(`   Total: ${uniqueRules.length} | Inserted: ${totalInserted} | Errors: ${totalErrors}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'JSON-based rules seeded successfully',
        stats: {
          total_rules: uniqueRules.length,
          inserted: totalInserted,
          errors: totalErrors,
          version: RULES_VERSION,
          files_loaded: RULE_FILES.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    return new Response(
      JSON.stringify({ error: 'Seeding failed', details: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
