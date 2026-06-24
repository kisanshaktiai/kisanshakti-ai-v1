// Schema contract test — guarantees every table the chat function
// queries actually exists in the live Supabase project. Catches the class
// of bug we just fixed (fire-and-forget inserts into phantom tables).
//
// Run via: supabase functions test ai-agriculture-chat
//          (Deno's built-in test runner, --allow-net --allow-env).

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY")!;

// Every table the ai-agriculture-chat function references via supabase.from().
// Sourced by:
//   rg -No "\.from\(['\"]([a-z_]+)['\"]" supabase/functions/ai-agriculture-chat
const REFERENCED_TABLES = [
  // Created by 20260620_ai_chat_pipeline_hardening migration — guard against regression
  "agricultural_decisions",
  "scheduled_followups",
  "confidence_adjustments",
  "efficacy_updates",
  // Pipeline-critical tables
  "decision_rules",
  "decision_rules_translations_archive",
  "observation_master",
  "observation_aliases",
  "observation_translations",
  "observation_intent_master",
  "intent_observation_mapping",
  "intent_translations",
  "hypothesis_master",
  "hypothesis_conditions",
  "hypothesis_rule_mapping",
  "hypothesis_contradictions",
  "hypothesis_metrics",
  "emergency_observation_codes",
  "direct_advisory_routes",
  "cultural_strategies",
  "etl_standards",
  "canonical_group_mapping",
  "crop_stage_master",
  "crop_synonyms",
  "crop_vocabulary",
  "agro_climatic_zones",
  "weather_current",
  "weather_observations",
  "weather_forecasts",
  "weather_aggregates",
  "weather_historical",
  "soil_health",
  "lands",
  "ndvi_data",
  "farmers",
  "crop_schedules",
  "master_products",
  "chemical_regulatory_status",
  "ai_chat_sessions",
  "ai_chat_messages",
  "ai_chat_audit_logs",
  "advisory_audit_log",
  "safety_verifications",
  "expert_escalations",
  "treatment_outcomes",
  "learning_suggestions",
  "rule_performance",
];

Deno.test("schema contract: every chat-referenced table exists", async () => {
  const supa = createClient(SUPABASE_URL, SUPABASE_KEY);
  const missing: string[] = [];

  for (const tbl of REFERENCED_TABLES) {
    // HEAD + count=exact is cheap; a phantom table returns 42P01 / 404.
    const { error } = await supa
      .from(tbl)
      .select("*", { count: "exact", head: true });
    if (error && /relation .* does not exist|Not Found|PGRST20[1-2]|404/i.test(error.message)) {
      missing.push(`${tbl}: ${error.message}`);
    }
  }

  assertEquals(
    missing.length,
    0,
    `Chat function references ${missing.length} phantom table(s):\n${missing.join("\n")}`,
  );
});

Deno.test("phantom-table regression: 4 previously missing tables are present", async () => {
  const supa = createClient(SUPABASE_URL, SUPABASE_KEY);
  for (const tbl of [
    "agricultural_decisions",
    "scheduled_followups",
    "confidence_adjustments",
    "efficacy_updates",
  ]) {
    const { error } = await supa.from(tbl).select("*", { count: "exact", head: true });
    assert(!error, `${tbl} should exist post-migration; got: ${error?.message}`);
  }
});
