/**
 * Structured, language-independent treatment safety for scouting (monitoring) cards — pure.
 *
 * 2026-11-12 — replaces the English/Marathi keyword regex (`isTreatmentInstruction`). A keyword
 * list cannot be correct in 14 languages and it also deleted every verified "if seen" action.
 * Authorization is now decided ONCE, from the decision_rules row's own typed fields, before any
 * text exists; text is only ever rendered from an authorized structure. Composition into the
 * farmer's language is separately bound by the numeric fact boundary (compose-farmer-text.ts).
 */
const text = (v: unknown) => String(v ?? "").trim();
const lower = (v: unknown) => text(v).toLowerCase();

export interface TreatmentAuthorization {
  /** The rule prescribes a material input (product, dose or applied treatment). */
  carriesInput: boolean;
  authorized: boolean;
  reason: string | null;
}

const INPUT_ACTION_TYPES = new Set(["apply_treatment", "release_biocontrol"]);

export function treatmentAuthorization(rule: Record<string, unknown>, bannedChemicalClasses: ReadonlySet<string> = new Set()): TreatmentAuthorization {
  const carriesInput = !!text(rule.active_ingredient) || !!text(rule.dosage_per_acre) || !!text(rule.chemical_class) ||
    INPUT_ACTION_TYPES.has(lower(rule.action_type));
  if (rule.is_safety_block === true) return { carriesInput, authorized: false, reason: "safety_block" };
  if (rule.is_farmer_servable === false) return { carriesInput, authorized: false, reason: "not_farmer_servable" };
  if (["invalid", "blocked", "deprecated"].includes(lower(rule.canonical_status))) return { carriesInput, authorized: false, reason: "rule_status_blocked" };
  if (!carriesInput) return { carriesInput, authorized: true, reason: null };
  if (rule.expert_approved !== true) return { carriesInput, authorized: false, reason: "pending_expert_approval" };
  const chem = lower(rule.chemical_class);
  if (chem && bannedChemicalClasses.has(chem)) return { carriesInput, authorized: false, reason: "banned_chemical_class" };
  const regulatory = lower(rule.regulatory_status);
  if (text(rule.active_ingredient) && regulatory && regulatory !== "approved") return { carriesInput, authorized: false, reason: "regulatory_status_not_approved" };
  return { carriesInput, authorized: true, reason: null };
}

export interface WatchBrief {
  rule_id: string;
  category: string;
  /** The observation code the rule is conditioned on (the key into the symptom catalog). */
  condition_code?: string | null;
  watch_for: string;
  /** Rendered ONLY when treatment_authorized; null otherwise. */
  if_seen: string | null;
  treatment_authorized: boolean;
  carries_input: boolean;
  withheld_reason: string | null;
  treatment: { active_ingredient: string | null; dosage_per_acre: string | null; application_method: string | null; phi_days: number | null } | null;
}

export function buildWatchBrief(rule: Record<string, unknown>, bannedChemicalClasses: ReadonlySet<string> = new Set()): WatchBrief {
  const auth = treatmentAuthorization(rule, bannedChemicalClasses);
  const etl = text(rule.etl_threshold), cond = text(rule.condition_code);
  const ai = text(rule.active_ingredient), dose = text(rule.dosage_per_acre), method = text(rule.application_method);
  const phiDays = rule.phi_days != null && text(rule.phi_days) !== "" && Number.isFinite(Number(rule.phi_days)) ? Number(rule.phi_days) : null;
  let ifSeen: string | null = null;
  if (auth.authorized) {
    ifSeen = ai || dose || method
      ? `Apply ${[ai, dose ? `${dose} per acre` : "", method ? `by ${method}` : ""].filter(Boolean).join(", ")}.${phiDays != null ? ` Wait ${phiDays} days before harvest.` : ""}`
      : (text(rule.action_text) || null);
  }
  return {
    rule_id: text(rule.rule_id), category: text(rule.category), condition_code: cond || null,
    watch_for: etl || cond || text(rule.category) || "problem",
    if_seen: ifSeen, treatment_authorized: auth.authorized, carries_input: auth.carriesInput,
    withheld_reason: auth.authorized ? null : auth.reason,
    treatment: auth.authorized && auth.carriesInput ? { active_ingredient: ai || null, dosage_per_acre: dose || null, application_method: method || null, phi_days: phiDays } : null,
  };
}

/** Farmer line for one brief. An unauthorized brief renders the observation only. */
export const watchLine = (b: Pick<WatchBrief, "watch_for" | "if_seen" | "treatment_authorized">): string =>
  b.treatment_authorized && b.if_seen ? `Watch for ${b.watch_for}; if seen: ${b.if_seen}` : `Watch for ${b.watch_for}; record what you see and report it before treating.`;

interface MonitoringTaskLike {
  task_type: string;
  quantity?: unknown;
  nutrient?: unknown;
  water_volume?: unknown;
  resources?: Record<string, unknown>;
}

/** Structural violations of "a scouting card is observation, never a standing prescription". */
export function monitoringViolations(task: MonitoringTaskLike): string[] {
  if (task.task_type !== "monitoring") return [];
  const out: string[] = [];
  if (task.quantity != null) out.push("MONITORING_CARRIES_QUANTITY");
  if (task.nutrient != null && text(task.nutrient) !== "") out.push("MONITORING_CARRIES_NUTRIENT");
  if (task.water_volume != null) out.push("MONITORING_CARRIES_WATER_VOLUME");
  const list = Array.isArray(task.resources?.watch_list) ? task.resources!.watch_list as Array<Record<string, unknown>> : [];
  for (const b of list) {
    if (b?.treatment_authorized === true) continue;
    if (b?.if_seen != null || b?.treatment != null) { out.push("MONITORING_UNAUTHORIZED_TREATMENT"); break; }
  }
  return out;
}

/** Enforce the structure in place; returns how many unauthorized treatments were withheld. */
export function enforceMonitoringStructure(task: MonitoringTaskLike): number {
  if (task.task_type !== "monitoring") return 0;
  let withheld = 0;
  const list = Array.isArray(task.resources?.watch_list) ? task.resources!.watch_list as Array<Record<string, unknown>> : [];
  for (const b of list) {
    if (b?.treatment_authorized === true) continue;
    if (b.if_seen != null || b.treatment != null) withheld += 1;
    b.if_seen = null; b.treatment = null; b.treatment_authorized = false;
  }
  return withheld;
}
