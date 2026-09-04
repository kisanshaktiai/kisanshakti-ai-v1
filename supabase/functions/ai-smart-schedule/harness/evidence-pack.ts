import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.0";
import type { ResolvedInputs } from "../db/resolve-inputs.ts";
import { toDas, computeTransplantOffset, type BaselineTask } from "../generator/baseline-generator.ts";
import type { StageRow, Provenance } from "../db/agronomy-repo.ts";

export type CandidateDomain =
  | "LAND_PREPARATION" | "SEED_TREATMENT" | "PLANTING" | "NUTRIENT" | "MICRONUTRIENT"
  | "ORGANIC_INPUT" | "BIOLOGICAL_INPUT" | "IRRIGATION" | "WEED" | "PEST" | "DISEASE"
  | "PGR" | "INTERCULTURAL" | "MONITORING" | "HARVEST" | "POST_HARVEST" | "MANAGEMENT";

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

const MAX_RULE_CANDIDATES = 160;
const MAX_RULES_PER_DOMAIN = 24;
const MAX_GUIDELINE_ROWS = 160;
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

function policyKind(policy: string | null | undefined): "organic_only" | "integrated" | "synthetic_allowed" | "unknown" {
  const p = norm(policy);
  if (p === "organic_only") return "organic_only";
  if (p === "integrated" || p === "organic_fertilizer") return "integrated";
  if (p === "fertilizer_pesticide" || p === "synthetic_allowed") return "synthetic_allowed";
  return "unknown";
}

export function classifyRuleDomain(category: unknown): CandidateDomain | null {
  switch (norm(category)) {
    case "nutrition": return "NUTRIENT";
    case "organic": return "ORGANIC_INPUT";
    case "weed": return "WEED";
    case "pest": case "proactive_pest": return "PEST";
    case "disease": return "DISEASE";
    case "irrigation": case "proactive_irrigation": return "IRRIGATION";
    case "monitoring": case "proactive_monitoring": return "MONITORING";
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

function taskTypeForDomain(domain: CandidateDomain): string {
  switch (domain) {
    case "NUTRIENT": case "ORGANIC_INPUT": return "nutrition";
    case "MICRONUTRIENT": return "micronutrient";
    case "BIOLOGICAL_INPUT": case "PEST": return "pest_management";
    case "DISEASE": return "disease_management";
    case "WEED": return "weed_management";
    case "IRRIGATION": return "irrigation";
    case "PGR": return "growth_regulation";
    case "MONITORING": return "monitoring";
    case "HARVEST": return "harvest";
    case "POST_HARVEST": return "post_harvest";
    case "SEED_TREATMENT": return "seed_treatment";
    case "LAND_PREPARATION": return "land_preparation";
    case "INTERCULTURAL": return "intercultural";
    default: return "advisory";
  }
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
  if (value.some((v) => ["all", "*"].includes(norm(v)))) return true;
  if (!varietyName) return false;
  const wanted = norm(varietyName);
  return value.some((v) => {
    const candidate = norm(v);
    return candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate);
  });
}

function methodApplies(value: unknown, inputs: ResolvedInputs): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.some((v) => ["any", "all", "*"].includes(norm(v)))) return true;
  const wanted = new Set([inputs.cultivationMethod, inputs.stageClockMethod].filter(Boolean).map(norm));
  return value.some((v) => wanted.has(norm(v)));
}

function regionApplies(value: unknown, regionCode: string | null): boolean {
  const r = norm(value);
  if (!r) return true;
  return !!regionCode && r === norm(regionCode);
}

function policyAllows(rule: Record<string, unknown>, domain: CandidateDomain, inputs: ResolvedInputs): boolean {
  if (rule.is_safety_block === true || rule.is_farmer_servable === false) return false;
  const canonical = norm(rule.canonical_status);
  if (["invalid", "blocked", "deprecated"].includes(canonical)) return false;

  // Monitoring/observation evidence remains usable for planning even when an application
  // is not currently authorized; the validator prevents it becoming SCHEDULED.
  if (norm(rule.trigger_class) === "observation") return true;

  const activeIngredient = norm(rule.active_ingredient);
  const synthetic = !!activeIngredient;
  const policy = policyKind(inputs.farmingPolicy);

  if (domain === "PEST" || domain === "DISEASE" || domain === "WEED" || domain === "PGR") {
    if (synthetic && norm(rule.regulatory_status) !== "approved") return false;
    if (policy === "organic_only" && synthetic) return false;
    if (policy === "integrated" && synthetic) {
      return norm(rule.verification_status) === "verified" || rule.expert_approved === true;
    }
  }
  if (domain === "NUTRIENT" || domain === "MICRONUTRIENT" || domain === "ORGANIC_INPUT") {
    if (policy === "organic_only" && synthetic) return false;
  }
  return true;
}

function ruleTask(rule: Record<string, unknown>, stage: StageRow, das: number, domain: CandidateDomain, status: CandidateStatus): BaselineTask {
  const ruleId = String(rule.rule_id);
  const condition = String(rule.condition_code ?? "").trim();
  const trigger = String(rule.trigger_class ?? "").trim();
  const actionText = String(rule.action_text ?? "").trim();
  const technical: string[] = [];
  if (condition) technical.push(`Condition: ${condition}`);
  if (trigger) technical.push(`Trigger: ${trigger}`);
  if (rule.etl_threshold) technical.push(`ETL: ${String(rule.etl_threshold)}`);
  if (rule.etl_value_min != null || rule.etl_value_max != null) technical.push(`ETL range: ${rule.etl_value_min ?? ""}–${rule.etl_value_max ?? ""} ${rule.etl_unit_type ?? ""}`.trim());
  if (rule.active_ingredient) technical.push(`Active ingredient: ${rule.active_ingredient}`);
  if (rule.dosage_per_acre) technical.push(`Dose/acre: ${rule.dosage_per_acre}`);
  if (rule.application_method) technical.push(`Application method: ${rule.application_method}`);
  if (rule.phi_days != null) technical.push(`PHI: ${rule.phi_days} days`);
  if (rule.regulatory_status) technical.push(`Regulatory status: ${rule.regulatory_status}`);

  return {
    task_name: `${String(rule.category ?? domain).replace(/_/g, " ")} — ${String(stage.growth_stage || stage.stage_code || "stage").replace(/_/g, " ")}`.slice(0, 60),
    task_type: taskTypeForDomain(domain),
    task_description: actionText || (condition ? `Follow the validated rule when ${condition} is confirmed.` : "Follow the validated agronomic rule."),
    days_from_sowing: das,
    anchor_type: "STAGE",
    anchor_stage: stage.stage_code || stage.growth_stage,
    gdd_target: stage.gdd_min ?? null,
    stage_key: stage.stage_code,
    stage_uuid: stage.id,
    stage_name: stage.growth_stage,
    stage_order: Number(stage.das_min ?? 0),
    priority: Number(rule.priority ?? 50) >= 90 ? "critical" : Number(rule.priority ?? 50) >= 70 ? "high" : Number(rule.priority ?? 50) >= 40 ? "medium" : "low",
    weather_dependent: !!rule.weather_dependency || ["PEST", "DISEASE", "WEED", "PGR"].includes(domain),
    nutrient: domain === "NUTRIENT" ? condition || null : null,
    quantity: null,
    estimated_cost: rule.total_cost_estimated != null ? Number(rule.total_cost_estimated) : null,
    rule_ids: [ruleId],
    confidence: rule.confidence_score != null ? Number(rule.confidence_score) : null,
    source_refs: [{ table: "decision_rules", row_id: ruleId, source: rule.scientific_source ?? null, authority: rule.icar_package ?? rule.university_source ?? null, confidence: rule.confidence_score != null ? Number(rule.confidence_score) : null }],
    instructions: [],
    precautions: Array.isArray(rule.contraindications) ? rule.contraindications.map(String).filter(Boolean) : [],
    technical_details: technical,
    resources: {
      requirement_semantics: status === "CONDITIONAL" ? "CONDITIONAL_RULE" : "RULE_ACTION",
      planning_status: status,
      trigger_class: trigger || null,
      condition_code: condition || null,
      evidence_tier: rule.expert_approved ? "EXPERT_APPROVED" : rule.data_authority_rank != null ? `AUTHORITY_RANK_${rule.data_authority_rank}` : "DB_RULE",
      regulatory_status: rule.regulatory_status ?? null,
      verification_status: rule.verification_status ?? null,
      mutually_exclusive_with: rule.mutually_exclusive_with ?? [],
      sequence_after: rule.sequence_after ?? [],
      prerequisite_rule_ids: rule.prerequisite_rule_ids ?? [],
      enables_rule_ids: rule.enables_rule_ids ?? [],
      blocks_rule_ids: rule.blocks_rule_ids ?? [],
    },
  };
}

export async function buildAgronomicEvidencePack(supabase: SupabaseClient, inputs: ResolvedInputs, stages: StageRow[], existingTasks: BaselineTask[]): Promise<AgronomicEvidencePack> {
  const gaps: string[] = [];
  const candidates: HarnessCandidate[] = [];
  const existingRuleIds = new Set(existingTasks.flatMap((t) => t.rule_ids));
  const transplantOffset = computeTransplantOffset(stages, inputs.sowingDate, inputs.transplantDate);

  const ruleQuery = await supabase.from("decision_rules")
    .select("rule_id,category,action_type,treatment_type,trigger_class,stage_applicable,condition_code,etl_threshold,etl_value_min,etl_value_max,etl_unit_type,active_ingredient,chemical_class,dosage_per_acre,application_method,phi_days,action_text,scientific_source,icar_package,university_source,confidence_score,priority,expert_approved,data_authority_rank,regulatory_status,verification_status,variety_applicable,cultivation_method_applicable,region_code,soil_type_applicable,climate_zone_applicable,weather_dependency,total_cost_estimated,organic_alternative,sequence_after,prerequisite_rule_ids,enables_rule_ids,blocks_rule_ids,mutually_exclusive_with,requires_field_action,canonical_status,is_safety_block,is_farmer_servable")
    .eq("is_active", true)
    .in("trigger_class", ["CONTEXT_SCHEDULE", "OBSERVATION"])
    .in("category", ["nutrition", "organic", "weed", "pest", "disease", "irrigation", "management", "physiology", "proactive_pest", "proactive_irrigation", "proactive_monitoring"])
    .or(`crop_code.ilike.${inputs.cropCode},crop_code.ilike.ALL`)
    .limit(2000);
  if (ruleQuery.error) gaps.push(`evidence_rule_query_failed:${ruleQuery.error.message}`);

  const rows = (ruleQuery.data || []) as Array<Record<string, unknown>>;
  const filtered = rows
    .filter((r) => !r.is_safety_block && r.is_farmer_servable !== false)
    .filter((r) => !["invalid", "blocked", "deprecated"].includes(norm(r.canonical_status)))
    .filter((r) => varietyApplies(r.variety_applicable, inputs.varietyName))
    .filter((r) => methodApplies(r.cultivation_method_applicable, inputs))
    .filter((r) => regionApplies(r.region_code, inputs.regionCode))
    .filter((r) => policyAllows(r, classifyRuleDomain(r.category) ?? "MANAGEMENT", inputs))
    .filter((r) => {
      const type = norm(r.action_type);
      return ["recommend", "apply_treatment", "release_biocontrol", "monitor", "urgent_action", "immediate_action"].includes(type);
    })
    .filter((r) => !existingRuleIds.has(String(r.rule_id)))
    .sort((a, b) => Number(b.data_authority_rank ?? 0) - Number(a.data_authority_rank ?? 0) || Number(b.priority ?? 0) - Number(a.priority ?? 0) || String(a.rule_id).localeCompare(String(b.rule_id)));

  const byDomain = new Map<CandidateDomain, number>();
  let capped = false;
  for (const rule of filtered) {
    if (candidates.length >= MAX_RULE_CANDIDATES) { capped = true; break; }
    const domain = classifyRuleDomain(rule.category);
    if (!domain) continue;
    const count = byDomain.get(domain) ?? 0;
    if (count >= MAX_RULES_PER_DOMAIN) { capped = true; continue; }
    const matched = firstStageMatch(stages, rule.stage_applicable, transplantOffset);
    if (!matched) continue;
    const status = statusForRule(rule.trigger_class, rule.action_type);
    const materializable = status !== "MONITOR" && rule.requires_field_action !== false;
    const task = ruleTask(rule, matched.stage, matched.das, domain, status);
    const id = `rule_${String(rule.rule_id).replace(/[^a-zA-Z0-9_]+/g, "_")}`;
    candidates.push({
      id, task, kind: "RULE_ACTION", domain, required: false,
      materializable, default_status: status,
      trigger_class: String(rule.trigger_class ?? "") || null,
      condition_code: String(rule.condition_code ?? "") || null,
      evidence: {
        rule_id: rule.rule_id, action_type: rule.action_type, treatment_type: rule.treatment_type,
        active_ingredient: rule.active_ingredient, dosage_per_acre: rule.dosage_per_acre,
        application_method: rule.application_method, phi_days: rule.phi_days,
        verification_status: rule.verification_status, expert_approved: rule.expert_approved,
        regulatory_status: rule.regulatory_status, data_authority_rank: rule.data_authority_rank,
        requires_field_action: rule.requires_field_action, farmer_servable: rule.is_farmer_servable,
        sequence_after: rule.sequence_after ?? [], prerequisite_rule_ids: rule.prerequisite_rule_ids ?? [],
        enables_rule_ids: rule.enables_rule_ids ?? [], blocks_rule_ids: rule.blocks_rule_ids ?? [],
        mutually_exclusive_with: rule.mutually_exclusive_with ?? [],
      },
    });
    byDomain.set(domain, count + 1);
  }

  const guidelineQuery = await supabase.from("crop_baseline_guidelines_v2")
    .select("id,crop_code,growth_stage,das_start,das_end,nitrogen_optimal,phosphorus_optimal,potassium_optimal,sulphur_optimal,zinc_optimal,iron_optimal,source_reference,variety_id,stage_master_id,das_authoritative")
    .ilike("crop_code", inputs.cropCode).eq("is_active", true).limit(MAX_GUIDELINE_ROWS);
  if (guidelineQuery.error) gaps.push(`guideline_evidence_query_failed:${guidelineQuery.error.message}`);

  const stageIds = new Set(stages.map((s) => s.id));
  for (const row of ((guidelineQuery.data || []) as Array<Record<string, unknown>>)) {
    if (row.stage_master_id && !stageIds.has(String(row.stage_master_id))) continue;
    if (row.variety_id && inputs.varietyId && String(row.variety_id) !== String(inputs.varietyId)) continue;
    const micro = [["S", row.sulphur_optimal], ["Zn", row.zinc_optimal], ["Fe", row.iron_optimal]].filter(([,v]) => v != null && Number.isFinite(Number(v)));
    if (!micro.length) continue;
    const stage = row.stage_master_id ? stages.find((s) => s.id === String(row.stage_master_id)) : null;
    if (!stage) continue;
    for (const [element,value] of micro) {
      candidates.push({
        id: `guideline_micro_${String(row.id).replace(/[^a-zA-Z0-9]+/g, "_")}_${element}`,
        kind: "GUIDELINE_EVIDENCE", domain: "MICRONUTRIENT", required: false, materializable: false,
        default_status: "INSUFFICIENT_DATA", trigger_class: null, condition_code: null,
        evidence: { source_table: "crop_baseline_guidelines_v2", row_id: row.id, stage_uuid: stage.id, stage_name: stage.growth_stage, element, guideline_value: Number(value), value_semantics: "STAGE_GUIDELINE_INDICATOR", source_reference: row.source_reference ?? null, das_authoritative: row.das_authoritative ?? null, warning: "Requirement indicator is not an application dose/form; no task is materialized from this evidence-only candidate." },
        task: {
          task_name: `${element} nutrient review — ${String(stage.growth_stage || "stage")}`.slice(0, 60), task_type: "micronutrient",
          task_description: `Review the ${element} requirement recorded for this crop stage using field/soil evidence before deciding on an application.`,
          days_from_sowing: toDas(stage, stage.das_min, transplantOffset) ?? 0, anchor_type: "STAGE",
          anchor_stage: stage.stage_code || stage.growth_stage, gdd_target: stage.gdd_min ?? null,
          stage_key: stage.stage_code, stage_uuid: stage.id, stage_name: stage.growth_stage,
          stage_order: Number(stage.das_min ?? 0), priority: "medium", weather_dependent: false,
          nutrient: element, quantity: null, estimated_cost: null, rule_ids: [], confidence: null,
          source_refs: [{table:"crop_baseline_guidelines_v2",row_id:String(row.id),source:String(row.source_reference ?? "") || null} as Provenance],
          instructions: [], precautions: [],
          technical_details: [`Guideline indicator: ${element}=${Number(value)}`, "Application dose/form not supplied by the guideline row."],
          resources: {requirement_semantics:"EVIDENCE_ONLY",planning_status:"INSUFFICIENT_DATA"},
        },
      });
    }
  }

  const domainSummary: AgronomicEvidencePack["domain_summary"] = {};
  for (const c of candidates) {
    const s = domainSummary[c.domain] ?? {candidates:0,actionable:0,evidence_only:0};
    s.candidates++; if (c.materializable) s.actionable++; else s.evidence_only++; domainSummary[c.domain]=s;
  }
  if (capped) gaps.push("evidence_pack_candidate_cap_reached");
  return {candidates,domain_summary:domainSummary,gaps};
}