import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.0";
import type { ResolvedInputs } from "../db/resolve-inputs.ts";
import { toDas, computeTransplantOffset, type BaselineTask } from "../generator/baseline-generator.ts";
import type { StageRow, Provenance } from "../db/agronomy-repo.ts";

export type CandidateDomain =
  | "LAND_PREPARATION"
  | "SEED_TREATMENT"
  | "PLANTING"
  | "NUTRIENT"
  | "MICRONUTRIENT"
  | "ORGANIC_INPUT"
  | "BIOLOGICAL_INPUT"
  | "IRRIGATION"
  | "WEED"
  | "PEST"
  | "DISEASE"
  | "PGR"
  | "INTERCULTURAL"
  | "MONITORING"
  | "HARVEST"
  | "POST_HARVEST"
  | "MANAGEMENT";

export type CandidateStatus = "SCHEDULED" | "CONDITIONAL" | "MONITOR" | "INSUFFICIENT_DATA";

export interface HarnessCandidate {
  id: string;
  task: BaselineTask;
  kind: "RULE_ACTION" | "GUIDELINE_EVIDENCE";
  domain: CandidateDomain;
  required: boolean;
  materializable: boolean;
  default_status: CandidateStatus;
  trigger_class: string | null;
  condition_code: string | null;
  evidence: Record<string, unknown>;
}

export interface AgronomicEvidencePack {
  candidates: HarnessCandidate[];
  domain_summary: Record<string, { candidates: number; actionable: number; evidence_only: number }>;
  gaps: string[];
}

const MAX_RULE_CANDIDATES = 96;
const MAX_RULES_PER_DOMAIN = 16;
const MAX_GUIDELINE_ROWS = 80;

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function classifyRuleDomain(category: unknown): CandidateDomain | null {
  switch (norm(category)) {
    case "nutrition": return "NUTRIENT";
    case "organic": return "ORGANIC_INPUT";
    case "weed": return "WEED";
    case "pest":
    case "proactive_pest": return "PEST";
    case "disease": return "DISEASE";
    case "irrigation":
    case "proactive_irrigation": return "IRRIGATION";
    case "monitoring":
    case "proactive_monitoring": return "MONITORING";
    case "physiology": return "PGR";
    case "management": return "MANAGEMENT";
    case "land_preparation": return "LAND_PREPARATION";
    case "seed_treatment": return "SEED_TREATMENT";
    case "harvest": return "HARVEST";
    case "post_harvest": return "POST_HARVEST";
    case "intercultural": return "INTERCULTURAL";
    default: return null;
  }
}

function statusForRule(triggerClass: unknown, actionType: unknown): CandidateStatus {
  const trigger = norm(triggerClass);
  const action = norm(actionType);
  if (trigger === "observation") return action === "monitor" ? "MONITOR" : "CONDITIONAL";
  return action === "monitor" ? "MONITOR" : "SCHEDULED";
}

function taskTypeForDomain(domain: CandidateDomain, actionType: unknown): string {
  if (domain === "NUTRIENT") return "nutrition";
  if (domain === "MICRONUTRIENT") return "micronutrient";
  if (domain === "ORGANIC_INPUT") return "nutrition";
  if (domain === "BIOLOGICAL_INPUT") return "pest_management";
  if (domain === "IRRIGATION") return "irrigation";
  if (domain === "WEED") return "weed_management";
  if (domain === "PEST") return "pest_management";
  if (domain === "DISEASE") return "disease_management";
  if (domain === "PGR") return "growth_regulation";
  if (domain === "MONITORING") return "monitoring";
  if (domain === "HARVEST") return "harvest";
  if (domain === "POST_HARVEST") return "post_harvest";
  if (domain === "SEED_TREATMENT") return "seed_treatment";
  if (domain === "LAND_PREPARATION") return "land_preparation";
  if (domain === "INTERCULTURAL") return "intercultural";
  return norm(actionType) === "monitor" ? "monitoring" : "advisory";
}

function stageMatches(stage: StageRow, token: string): boolean {
  const t = norm(token);
  if (!t || t === "all") return false;
  const code = norm(stage.stage_code);
  const growth = norm(stage.growth_stage);
  return code === t || growth === t || (!!code && code.endsWith(`_${t}`));
}

function firstStageMatch(stages: StageRow[], tokens: unknown, transplantOffset: number | null): { stage: StageRow; das: number } | null {
  const list = Array.isArray(tokens) ? tokens.map(String) : tokens ? [String(tokens)] : [];
  const matched = stages
    .filter((s) => list.some((token) => stageMatches(s, token)))
    .map((stage) => ({ stage, das: toDas(stage, stage.das_min, transplantOffset) }))
    .filter((x): x is { stage: StageRow; das: number } => x.das != null)
    .sort((a, b) => a.das - b.das || String(a.stage.stage_code ?? "").localeCompare(String(b.stage.stage_code ?? "")));
  return matched[0] ?? null;
}

function varietyApplies(value: unknown, varietyName: string | null): boolean {
  if (!Array.isArray(value) || value.length === 0) return true;
  if (value.some((v) => norm(v) === "all")) return true;
  if (!varietyName) return false;
  const wanted = norm(varietyName);
  return value.some((v) => norm(v) === wanted);
}

function cleanTechnical(lines: unknown[]): string[] {
  return lines.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

function makeRuleTask(
  rule: Record<string, unknown>,
  stage: StageRow,
  das: number,
  domain: CandidateDomain,
  defaultStatus: CandidateStatus,
): BaselineTask {
  const ruleId = String(rule.rule_id);
  const actionType = String(rule.action_type ?? "recommend");
  const label = String(rule.category ?? domain).replace(/_/g, " ").trim();
  const actionText = String(rule.action_text ?? "").trim();
  const activeIngredient = String(rule.active_ingredient ?? "").trim();
  const dose = String(rule.dosage_per_acre ?? "").trim();
  const condition = String(rule.condition_code ?? "").trim();
  const trigger = String(rule.trigger_class ?? "").trim();
  const technical: string[] = [];
  if (condition) technical.push(`Condition: ${condition}`);
  if (trigger) technical.push(`Trigger: ${trigger}`);
  if (rule.etl_threshold) technical.push(`ETL: ${String(rule.etl_threshold)}`);
  if (rule.etl_value_min != null || rule.etl_value_max != null) {
    technical.push(`ETL range: ${rule.etl_value_min ?? ""}–${rule.etl_value_max ?? ""} ${rule.etl_unit_type ?? ""}`.trim());
  }
  if (activeIngredient) technical.push(`Active ingredient: ${activeIngredient}`);
  if (dose) technical.push(`Dose/acre: ${dose}`);
  if (rule.application_method) technical.push(`Application method: ${String(rule.application_method)}`);
  if (rule.phi_days != null) technical.push(`PHI: ${String(rule.phi_days)} days`);
  if (rule.regulatory_status) technical.push(`Regulatory status: ${String(rule.regulatory_status)}`);

  const taskType = taskTypeForDomain(domain, actionType);
  const description = actionText || (condition ? `Follow the validated rule when ${condition} is confirmed.` : "Follow the validated agronomic rule.");
  return {
    task_name: `${label} — ${String(stage.growth_stage || stage.stage_code || "stage").replace(/_/g, " ")}`.slice(0, 60),
    task_type: taskType,
    task_description: description,
    days_from_sowing: das,
    anchor_type: "STAGE",
    anchor_stage: stage.stage_code || stage.growth_stage,
    gdd_target: stage.gdd_min ?? null,
    stage_key: stage.stage_code,
    stage_uuid: stage.id,
    stage_name: stage.growth_stage,
    stage_order: 0,
    priority: Number(rule.priority ?? 50) >= 90 ? "critical" : Number(rule.priority ?? 50) >= 70 ? "high" : Number(rule.priority ?? 50) >= 40 ? "medium" : "low",
    weather_dependent: !!rule.weather_dependency || domain === "PEST" || domain === "DISEASE" || domain === "WEED" || domain === "PGR",
    nutrient: domain === "NUTRIENT" ? String(rule.condition_code ?? "") || null : null,
    quantity: null,
    estimated_cost: rule.total_cost_estimated != null ? Number(rule.total_cost_estimated) : null,
    rule_ids: [ruleId],
    confidence: rule.confidence_score != null ? Number(rule.confidence_score) : null,
    source_refs: [{
      table: "decision_rules",
      row_id: ruleId,
      source: rule.scientific_source ?? null,
      authority: rule.icar_package ?? rule.university_source ?? null,
      confidence: rule.confidence_score != null ? Number(rule.confidence_score) : null,
    }],
    instructions: [],
    precautions: Array.isArray(rule.contraindications) ? rule.contraindications.map(String).filter(Boolean) : [],
    technical_details: cleanTechnical(technical),
    resources: {
      requirement_semantics: defaultStatus === "CONDITIONAL" ? "CONDITIONAL_RULE" : "RULE_ACTION",
      planning_status: defaultStatus,
      trigger_class: trigger || null,
      condition_code: condition || null,
      evidence_tier: rule.expert_approved ? "EXPERT_APPROVED" : rule.data_authority_rank != null ? `AUTHORITY_RANK_${rule.data_authority_rank}` : "DB_RULE",
      regulatory_status: rule.regulatory_status ?? null,
      mutually_exclusive_with: rule.mutually_exclusive_with ?? [],
      sequence_after: rule.sequence_after ?? [],
      prerequisite_rule_ids: rule.prerequisite_rule_ids ?? [],
      enables_rule_ids: rule.enables_rule_ids ?? [],
      blocks_rule_ids: rule.blocks_rule_ids ?? [],
    },
  };
}

export async function buildAgronomicEvidencePack(
  supabase: SupabaseClient,
  inputs: ResolvedInputs,
  stages: StageRow[],
  existingTasks: BaselineTask[],
): Promise<AgronomicEvidencePack> {
  const gaps: string[] = [];
  const candidates: HarnessCandidate[] = [];
  const existingRuleIds = new Set(existingTasks.flatMap((t) => t.rule_ids));
  const transplantOffset = computeTransplantOffset(stages, inputs.sowingDate, inputs.transplantDate);

  const ruleQuery = await supabase
    .from("decision_rules")
    .select([
      "rule_id", "category", "action_type", "treatment_type", "trigger_class", "stage_applicable",
      "condition_code", "etl_threshold", "etl_value_min", "etl_value_max", "etl_unit_type",
      "active_ingredient", "chemical_class", "dosage_per_acre", "application_method", "phi_days",
      "action_text", "scientific_source", "icar_package", "university_source", "confidence_score",
      "priority", "expert_approved", "data_authority_rank", "regulatory_status", "verification_status",
      "variety_applicable", "cultivation_method_applicable", "region_code", "soil_type_applicable",
      "climate_zone_applicable", "weather_dependency", "total_cost_estimated", "organic_alternative",
      "sequence_after", "prerequisite_rule_ids", "enables_rule_ids", "blocks_rule_ids", "mutually_exclusive_with",
      "requires_field_action", "canonical_status", "is_safety_block", "is_farmer_servable"
    ].join(", "))
    .eq("is_active", true)
    .in("trigger_class", ["CONTEXT_SCHEDULE", "OBSERVATION"])
    .in("category", ["nutrition", "organic", "weed", "pest", "disease", "irrigation", "management", "physiology", "proactive_pest", "proactive_irrigation", "proactive_monitoring"])
    .or(`crop_code.ilike.${inputs.cropCode},crop_code.ilike.ALL`)
    .or(inputs.regionCode ? `region_code.is.null,region_code.eq.${inputs.regionCode}` : "region_code.is.null")
    .limit(1500);

  if (ruleQuery.error) gaps.push(`evidence_rule_query_failed:${ruleQuery.error.message}`);

  const domainCounts = new Map<CandidateDomain, number>();
  const sortedRules = ((ruleQuery.data || []) as Array<Record<string, unknown>>)
    .filter((rule) => !rule.is_safety_block)
    .filter((rule) => rule.is_farmer_servable !== false)
    .filter((rule) => String(rule.canonical_status ?? "").toLowerCase() !== "invalid")
    .filter((rule) => varietyApplies(rule.variety_applicable, inputs.varietyName))
    .filter((rule) => {
      const methods = Array.isArray(rule.cultivation_method_applicable) ? rule.cultivation_method_applicable : null;
      if (!methods || methods.length === 0 || methods.some((m) => norm(m) === "any")) return true;
      const allowed = new Set([inputs.cultivationMethod, inputs.stageClockMethod].filter(Boolean).map(norm));
      return methods.some((m) => allowed.has(norm(m)));
    })
    .filter((rule) => {
      const type = norm(rule.action_type);
      return ["recommend", "apply_treatment", "release_biocontrol", "monitor", "urgent_action", "immediate_action"].includes(type);
    })
    .filter((rule) => !existingRuleIds.has(String(rule.rule_id)))
    .sort((a, b) => Number(b.data_authority_rank ?? 0) - Number(a.data_authority_rank ?? 0) || Number(b.priority ?? 0) - Number(a.priority ?? 0) || String(a.rule_id).localeCompare(String(b.rule_id)));

  for (const rule of sortedRules) {
    if (candidates.length >= MAX_RULE_CANDIDATES) break;
    const domain = classifyRuleDomain(rule.category);
    if (!domain) continue;
    const count = domainCounts.get(domain) ?? 0;
    if (count >= MAX_RULES_PER_DOMAIN) continue;
    const matched = firstStageMatch(stages, rule.stage_applicable, transplantOffset);
    if (!matched) continue;

    const status = statusForRule(rule.trigger_class, rule.action_type);
    const task = makeRuleTask(rule, matched.stage, matched.das, domain, status);
    const candidateId = `rule_${String(rule.rule_id).replace(/[^a-zA-Z0-9_]+/g, "_")}`;
    candidates.push({
      id: candidateId,
      task,
      kind: "RULE_ACTION",
      domain,
      required: false,
      materializable: true,
      default_status: status,
      trigger_class: String(rule.trigger_class ?? "") || null,
      condition_code: String(rule.condition_code ?? "") || null,
      evidence: {
        rule_id: rule.rule_id,
        action_type: rule.action_type,
        treatment_type: rule.treatment_type,
        active_ingredient: rule.active_ingredient,
        dosage_per_acre: rule.dosage_per_acre,
        application_method: rule.application_method,
        phi_days: rule.phi_days,
        verification_status: rule.verification_status,
        expert_approved: rule.expert_approved,
        regulatory_status: rule.regulatory_status,
        data_authority_rank: rule.data_authority_rank,
        sequence_after: rule.sequence_after ?? [],
        prerequisite_rule_ids: rule.prerequisite_rule_ids ?? [],
        enables_rule_ids: rule.enables_rule_ids ?? [],
        blocks_rule_ids: rule.blocks_rule_ids ?? [],
        mutually_exclusive_with: rule.mutually_exclusive_with ?? [],
      },
    });
    domainCounts.set(domain, count + 1);
  }

  // Guideline rows expose micronutrient requirements even where no application dose/form exists.
  // These are evidence-only candidates: Harness may classify the domain as insufficient/conditional,
  // but the system will never turn a requirement indicator into an invented application dose.
  const guidelineQuery = await supabase
    .from("crop_baseline_guidelines_v2")
    .select("id,crop_code,growth_stage,das_start,das_end,nitrogen_optimal,phosphorus_optimal,potassium_optimal,sulphur_optimal,zinc_optimal,iron_optimal,source_reference,variety_id,stage_master_id,das_authoritative")
    .ilike("crop_code", inputs.cropCode)
    .eq("is_active", true)
    .limit(MAX_GUIDELINE_ROWS);
  if (guidelineQuery.error) gaps.push(`guideline_evidence_query_failed:${guidelineQuery.error.message}`);

  const stageIds = new Set(stages.map((s) => s.id));
  for (const row of ((guidelineQuery.data || []) as Array<Record<string, unknown>>)) {
    if (row.stage_master_id && !stageIds.has(String(row.stage_master_id))) continue;
    if (row.variety_id && inputs.varietyId && String(row.variety_id) !== String(inputs.varietyId)) continue;
    const micro = [
      ["S", row.sulphur_optimal], ["Zn", row.zinc_optimal], ["Fe", row.iron_optimal],
    ].filter(([, value]) => value != null && Number.isFinite(Number(value)));
    if (!micro.length) continue;
    const stage = row.stage_master_id ? stages.find((s) => s.id === String(row.stage_master_id)) : null;
    if (!stage) continue;
    for (const [element, value] of micro) {
      const id = `guideline_micro_${String(row.id).replace(/[^a-zA-Z0-9]+/g, "_")}_${element}`;
      candidates.push({
        id,
        kind: "GUIDELINE_EVIDENCE",
        domain: "MICRONUTRIENT",
        required: false,
        materializable: false,
        default_status: "INSUFFICIENT_DATA",
        trigger_class: null,
        condition_code: null,
        evidence: {
          source_table: "crop_baseline_guidelines_v2",
          row_id: row.id,
          stage_uuid: stage.id,
          stage_name: stage.growth_stage,
          element,
          guideline_value: Number(value),
          value_semantics: "STAGE_GUIDELINE_INDICATOR",
          source_reference: row.source_reference ?? null,
          das_authoritative: row.das_authoritative ?? null,
          warning: "Requirement indicator is not an application dose/form; no task is materialized from this evidence-only candidate.",
        },
        task: {
          task_name: `${element} nutrient review — ${String(stage.growth_stage || "stage")}`.slice(0, 60),
          task_type: "micronutrient",
          task_description: `Review the ${element} requirement recorded for this crop stage using field/soil evidence before deciding on an application.`,
          days_from_sowing: toDas(stage, stage.das_min, transplantOffset) ?? 0,
          anchor_type: "STAGE",
          anchor_stage: stage.stage_code || stage.growth_stage,
          gdd_target: stage.gdd_min ?? null,
          stage_key: stage.stage_code,
          stage_uuid: stage.id,
          stage_name: stage.growth_stage,
          stage_order: 0,
          priority: "medium",
          weather_dependent: false,
          nutrient: element,
          quantity: null,
          estimated_cost: null,
          rule_ids: [],
          confidence: null,
          source_refs: [{ table: "crop_baseline_guidelines_v2", row_id: String(row.id), source: String(row.source_reference ?? "") || null } as Provenance],
          instructions: [],
          precautions: [],
          technical_details: [`Guideline indicator: ${element}=${Number(value)}`, "Application dose/form not supplied by the guideline row."],
          resources: { requirement_semantics: "EVIDENCE_ONLY", planning_status: "INSUFFICIENT_DATA" },
        },
      });
    }
  }

  const domainSummary: AgronomicEvidencePack["domain_summary"] = {};
  for (const c of candidates) {
    const k = c.domain;
    const s = domainSummary[k] ?? { candidates: 0, actionable: 0, evidence_only: 0 };
    s.candidates += 1;
    if (c.materializable) s.actionable += 1; else s.evidence_only += 1;
    domainSummary[k] = s;
  }

  return { candidates, domain_summary: domainSummary, gaps };
}
