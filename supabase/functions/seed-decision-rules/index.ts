/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION RULES DATABASE SEEDER - v3.0 COMPACT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Lightweight seeder that imports rules from separate data file.
 * Fixes deployment issues caused by large file size.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { CANONICAL_RULES, RULES_VERSION, RULES_COUNT, RuleDefinition } from './rules-data.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`🌱 [SeedDecisionRules v${RULES_VERSION}] Starting...`);
    console.log(`   Rules to seed: ${RULES_COUNT}`);

    // Parse request
    let clear = false;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        clear = body.clear === true;
      } catch { /* no body */ }
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Clear existing rules if requested
    if (clear) {
      console.log('🗑️ Clearing existing rules...');
      const { error: deleteError } = await supabase
        .from('decision_rules')
        .delete()
        .neq('rule_id', 'NEVER_MATCH');

      if (deleteError) {
        console.error('❌ Failed to clear rules:', deleteError);
      } else {
        console.log('✅ Existing rules cleared');
      }
    }

    // Priority normalization (1-10 range)
    const normalizePriority = (p: number): number => 
      Math.min(10, Math.max(1, Math.round(p / 10)));

    // Format rules for database
    const formatRule = (rule: RuleDefinition) => ({
      rule_id: rule.rule_id,
      crop_group: rule.crop_code || 'all',
      crop_code: rule.crop_code,
      category: rule.category,
      stage_applicable: rule.stage_applicable,
      conditions_json: { code: rule.conditionCode },
      condition_code: rule.conditionCode,
      cause: rule.cause,
      priority: normalizePriority(rule.priority),
      scientific_source: rule.scientific_source,
      scientific_basis: rule.scientific_basis || rule.scientific_source || '',
      trigger_keywords: rule.trigger_keywords || [],
      response_mr: rule.response_mr,
      response_hi: rule.response_hi,
      response_en: rule.response_en,
      action_type: rule.action_type,
      canonical_group: rule.canonical_group,
      is_active: true,
      version: RULES_VERSION,
      // New enhanced fields
      etl_threshold: rule.etl_threshold || null,
      phi_days: rule.phi_days || null,
      active_ingredient: rule.active_ingredient || null,
      organic_alternative: rule.organic_alternative || null,
      ipm_level: rule.ipm_level || null,
      bee_toxicity: rule.bee_toxicity || null,
      icar_package_ref: rule.icar_package_ref || null
    });

    // Insert rules in batches
    const batchSize = 25;
    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < CANONICAL_RULES.length; i += batchSize) {
      const batch = CANONICAL_RULES.slice(i, i + batchSize);
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
        console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}: ${data?.length || 0} rules upserted`);
      }
    }

    console.log(`\n🎉 [SeedDecisionRules] Complete!`);
    console.log(`   Total rules: ${RULES_COUNT}`);
    console.log(`   Successfully inserted: ${totalInserted}`);
    console.log(`   Errors: ${totalErrors}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Observation-based rules seeded successfully',
        stats: {
          total_rules: RULES_COUNT,
          inserted: totalInserted,
          errors: totalErrors,
          version: RULES_VERSION,
          type: 'OBSERVATION_BASED'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [SeedDecisionRules] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Seeding failed', details: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
