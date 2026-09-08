// CHANGE LOG
// 2026-09-07 — CALENDAR SHAPE (learned from a real rice crop calendar): (1) every task carries
//   resources.window {from_das,to_das,clock} — an activity is due in a range, not on a point; the
//   card can say "between 24 and 31 Jan" and the reconciler defers inside that range; (2) the
//   schedule carries generation_params.plan_summary — the "season plan" header a calendar opens
//   with: variety, method, seed, fertilizer plan (every split with its window), water strategy,
//   weed/pest/disease strategy, harvest, post-harvest, and how each domain was covered;
//   (3) pre-season tasks (negative days on the sowing clock) are dated before sowing.
// 2026-09-07 — LLM ENRICHMENT TIER wired in (harness/llm-candidates.ts). After the DB evidence
//   pack, the schedule model is asked ONLY for the agronomic domains the database left empty for
//   this crop/method/region; each proposal is governance-gated, RAG-corroborated and (for anything
//   a farmer would buy and spray) second-opinion checked. Verified proposals join the candidate
//   graph and are planned/dated by the Harness like DB rules; unverified ones are never shown and
//   go to schedule_llm_proposals for agronomist promotion. Time plan: enrichment ≤35 s,
//   Harness ≤30 s, narration keeps its guaranteed slice. Trace under generation_params.enrichment.
// 2026-09-07 — PERSIST FIRST, NARRATE DURABLY. Live measurement: a complete rice schedule is now
//   91 tasks; synchronous narration of 91 Marathi tasks cannot fit one request, so the
//   fail-closed rule (no persist until every task is narrated) meant NO schedule at all, and the
//   app's regenerate-retry loop repeated the same 100-second failure three times. New contract:
//   (1) the schedule is persisted as soon as its agronomy is ready; tasks narrated within the
//       request carry the farmer language, the rest carry language=NULL + needs_translation
//       (the frontend shows localized stage labels for those — never English as if it were
//       Marathi);
//   (2) narration continues in-process with the time left, then via `action=narrate`
//       (app follow-up + periodic sweep) until generation_params.narration.status = COMPLETE;
//   (3) the response reports narrationStatus / narratedCount / totalCount / pendingCount so the
//       app can show "translating…" instead of "failed". English schedules are unaffected.
// 2026-09-06 — hard gate: CULTIVATION_METHOD_UNRESOLVED (422) when the resolver returns no
//   method; the persisted schedule is the crop-cycle SSOT for the phenology resolver, so it must
//   never carry a NULL method.
// 2026-09-05 — Completeness + time plan. (1) The Harness planner is given a bounded budget
//   (HARNESS_MAX_MS) derived from the single request deadline so it can no longer consume the
//   narration slice — on the audited schedules it did, every run fell to deterministic_fallback
//   and narration was skipped. (2) Evidence-pack gaps (NO_AUTHORITATIVE_RULE:<DOMAIN>, micronutrient
//   status, context mismatches) are merged into the persisted gap list so the schedule states what
//   it could not evaluate. Narration fail-closed semantics below are unchanged.
// 2026-09-05 15:45 UTC — Reserve narration time and return retryable pending state on timeout.
// 2026-09-05 — Farmer-language root fix: non-English schedules now fail closed when
//   narration is unavailable/partial. A schedule tagged Marathi must never persist
//   deterministic English source text as if it were localized. Language is normalized
//   to the base ISO code at the edge boundary.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  resolveInputs,
  AMBIGUOUS_CULTIVATION_METHOD,
  AMBIGUOUS_CROP_CYCLE,
  getCultivationMethodOptions,
  getCropCycleOptions,
} from "./db/resolve-inputs.ts";
import { generateBaseline, GENERATOR_VERSION, toDas, computeTransplantOffset } from "./generator/baseline-generator.ts";
import { narrateTasks } from "./generator/narrate.ts";
import { narratePendingSchedules, narrateScheduleTasks } from "./generator/narrate-pending.ts";
import { sanitizeTaskText, hasFarmerText } from "./generator/farmer-text.ts";
import { loadLandContext } from "./db/land-context.ts";
import { attachRagEvidence, type RagEvidenceSummary } from "./db/rag-evidence.ts";
import { isFlagEnabled } from "../_shared/featureFlags.ts";
import { applyScheduleHarness } from "./harness/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token, x-ai-provider",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startTime = Date.now();
  let landId: string | null = null;
  let cropName: string | null = null;
  let farmerId: string | null = null;
  let tenantId: string | null = null;
  let resolvedCropCode: string | null = null;
  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", serviceRoleKey);
    const body = await req.json();
    tenantId = req.headers.get("x-tenant-id") || "";
    farmerId = req.headers.get("x-farmer-id") || "";

    // ── action=narrate: finish pending farmer-language narration (no generation) ──
    if (body?.action === "narrate") {
      const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const sweep = Boolean(serviceRoleKey) && bearer === serviceRoleKey;
      const outcome = await narratePendingSchedules(supabase, { scheduleId: body?.scheduleId ?? body?.schedule_id ?? null, tenantId: tenantId || null, farmerId: farmerId || null, sweep, limit: body?.limit ?? null, deadlineAt: startTime + 110_000 });
      try { await supabase.from("edge_invocation_logs").insert({ function_name: "ai-smart-schedule", user_id: sweep ? null : (farmerId || null), payload: { action: "narrate", mode: sweep ? "sweep" : "farmer", http_status: outcome.status, ...outcome.body, execution_time_ms: Date.now() - startTime } }); } catch (logErr) { console.warn("[ai-smart-schedule] edge_invocation_logs insert failed:", logErr); }
      return json(outcome.body, outcome.status);
    }

    landId = body?.landId ?? null;
    cropName = body?.cropName ?? null;
    const cropVariety = body?.cropVariety ?? null;
    const cultivationMethod = body?.cultivationMethod ?? null;
    const isReadyMadePlant = body?.isReadyMadePlant === true;
    const cropCycle = body?.cropCycle ?? null;
    const sowingDate = body?.sowingDate ?? null;
    const transplantDate = body?.transplantDate ?? null;
    const farmingType = body?.farmingType ?? null;
    const backdatedConsent = body?.backdatedConsent ?? false;
    const language = String(body?.language ?? "en").trim().toLowerCase().split("-")[0] || "en";

    if (!landId || !cropName) return json({ error: "landId and cropName are required" }, 400);
    if (!tenantId || !farmerId) return json({ error: "Missing tenant/farmer context" }, 401);

    const { data: ownedLand } = await supabase
      .from("lands")
      .select("id, farmer_id, tenant_id, lifecycle_status, active_schedule_id, current_crop, current_crop_id")
      .eq("id", landId)
      .maybeSingle();
    if (!ownedLand) return json({ error: "Land not found" }, 404);
    if (ownedLand.farmer_id !== farmerId || ownedLand.tenant_id !== tenantId) return json({ error: "Land does not belong to this farmer" }, 403);
    if (ownedLand.lifecycle_status === "CROP_ACTIVE") return json({ success: false, error: "This land already has an active crop. Confirm the previous harvest before starting a new crop schedule.", code: "LAND_NOT_AVAILABLE", landId, currentCrop: ownedLand.current_crop ?? null, activeScheduleId: ownedLand.active_schedule_id ?? null }, 200);

    const inputs = await resolveInputs(supabase, { landId, cropName, cropVariety, cultivationMethod, isReadyMadePlant, cropCycle, sowingDate, transplantDate, language, farmingType });
    inputs.language = language;
    const landContext = await loadLandContext(supabase, landId);
    if (landContext.gaps.length) inputs.gaps.push(...landContext.gaps);
    resolvedCropCode = inputs.cropCode || null;

    const { data: otherActive } = await supabase.from("crop_schedules").select("id, crop_name, status").eq("land_id", landId).or("status.eq.active,is_active.eq.true");
    const normName = (s: unknown) => String(s ?? "").trim().toLowerCase();
    const requestedNames = new Set([inputs.cropLabel, cropName, inputs.cropCode].filter(Boolean).map(normName));
    const conflictingSchedules = (otherActive || []).filter((s: Record<string, unknown>) => !requestedNames.has(normName(s.crop_name)));
    let landCropConflict: string | null = null;
    if (ownedLand.current_crop_id && inputs.cropId && String(ownedLand.current_crop_id) !== String(inputs.cropId)) landCropConflict = String(ownedLand.current_crop_id);
    if (conflictingSchedules.length || landCropConflict) return json({ success: false, error: "Land crop identity conflicts with the requested schedule. Establish the land's crop first — nothing was generated or overwritten.", code: "CROP_IDENTITY_CONFLICT", landId, requestedCropId: inputs.cropId, requestedCrop: inputs.cropLabel || cropName, landCurrentCropId: ownedLand.current_crop_id ?? null, conflictingActiveSchedules: conflictingSchedules.map((s: Record<string, unknown>) => ({ id: s.id, crop_name: s.crop_name })) }, 200);

    if (!inputs.cropCode) return json({ error: "Crop could not be resolved to the crop master", cropName, gaps: inputs.gaps }, 422);
    if (!inputs.sowingDate) return json({ error: "Sowing date is required and was not found", gaps: inputs.gaps }, 422);
    if (inputs.cultivationMethod === AMBIGUOUS_CULTIVATION_METHOD) return json({ error: "Cultivation method is required for this crop", code: "CULTIVATION_METHOD_REQUIRED", cropCode: inputs.cropCode, options: await getCultivationMethodOptions(supabase, inputs.cropCode), gaps: inputs.gaps }, 422);
    // 2026-09-06 — a schedule is never persisted without a resolved cultivation method: the
    // method selects the stage graph, and the phenology resolver now refuses to guess it. This
    // closes the path that produced the legacy NULL-method schedule (b9f15e9e, generator 1.0.0).
    if (!inputs.cultivationMethod) return json({ error: "Cultivation method could not be resolved for this crop", code: "CULTIVATION_METHOD_UNRESOLVED", cropCode: inputs.cropCode, options: await getCultivationMethodOptions(supabase, inputs.cropCode), gaps: inputs.gaps }, 422);
    if (inputs.cropCycle === AMBIGUOUS_CROP_CYCLE) return json({ error: "Crop cycle is required for this crop", code: "CROP_CYCLE_REQUIRED", cropCode: inputs.cropCode, options: await getCropCycleOptions(supabase, inputs.cropCode), gaps: inputs.gaps }, 422);

    const baseline = await generateBaseline(supabase, inputs);
    if (!baseline.tasks.length) return json({ error: "No schedule could be produced from the agronomic database for this crop", cropCode: inputs.cropCode, gaps: baseline.gaps, coverage: baseline.coverage }, 422);
    if (!baseline.coverage.stages) return json({ error: "No growth-stage graph is available for this crop and cultivation method", code: "STAGE_COVERAGE_MISSING", cropCode: inputs.cropCode, cultivationMethod: inputs.cultivationMethod, stageClockMethod: inputs.stageClockMethod, options: await getCultivationMethodOptions(supabase, inputs.cropCode), gaps: baseline.gaps, coverage: baseline.coverage }, 422);
    if (baseline.validation && baseline.validation.violations.length) return json({ error: "Generated schedule failed structural validation and was not persisted", code: "SCHEDULE_VALIDATION_FAILED", violations: baseline.validation.violations, warnings: baseline.validation.warnings, gaps: baseline.gaps }, 422);
    if (baseline.validation && baseline.validation.warnings.length) for (const w of baseline.validation.warnings) baseline.gaps.push(`validation_warning: ${w}`);

    // ── Time plan: one deadline, explicit slices ─────────────────────────────
    const HARD_DEADLINE_MS = 110_000;
    const PERSIST_RESERVE_MS = 12_000;
    const NARRATION_MIN_MS = 45_000;
    const HARNESS_MAX_MS = 30_000;
    const ENRICH_MAX_MS = 35_000;
    const remainingMs = () => HARD_DEADLINE_MS - (Date.now() - startTime);
    const enrichBudgetMs = Math.max(0, Math.min(ENRICH_MAX_MS, remainingMs() - HARNESS_MAX_MS - NARRATION_MIN_MS - PERSIST_RESERVE_MS));
    const timePlan: Record<string, number | null> = { hard_deadline_ms: HARD_DEADLINE_MS, enrich_budget_ms: enrichBudgetMs, harness_budget_ms: null, narration_budget_ms: null };

    let harnessTrace: Record<string, unknown> | null = null;
    let enrichmentTrace: Record<string, unknown> | null = null;
    let enrichmentProposals: import("./harness/llm-candidates.ts").ProposalRecord[] = [];
    try {
      const harnessFlag = await isFlagEnabled(supabase, "crop_schedule_harness_v2", { tenantId, farmerId });
      if (harnessFlag.enabled) {
        const evidencePack = await (async () => {
          const { buildAgronomicEvidencePack } = await import("./harness/evidence-pack.ts");
          const { getStages } = await import("./db/agronomy-repo.ts");
          const stages = await getStages(supabase, inputs.cropCode!, inputs.cropCycle, inputs.stageClockMethod ?? inputs.cultivationMethod);
          return buildAgronomicEvidencePack(supabase, inputs, stages, baseline.tasks);
        })();
        // ── LLM enrichment tier: fill only what the DB left empty, verified before it is ever shown ──
        if (enrichBudgetMs >= 20_000) {
          try {
            const { proposeAndVerifyCandidates } = await import("./harness/llm-candidates.ts");
            const { getStages } = await import("./db/agronomy-repo.ts");
            const stages = await getStages(supabase, inputs.cropCode!, inputs.cropCycle, inputs.stageClockMethod ?? inputs.cultivationMethod);
            const enrichment = await proposeAndVerifyCandidates(supabase, inputs, stages, baseline.tasks, evidencePack, { tenantId, farmerId, landId, deadlineAt: Date.now() + enrichBudgetMs, landContext });
            for (const c of enrichment.candidates) {
              evidencePack.candidates.push(c);
              const d = evidencePack.domain_summary[c.domain] ?? (evidencePack.domain_summary[c.domain] = { candidates: 0, actionable: 0, evidence_only: 0 });
              d.candidates += 1; d.actionable += 1;
            }
            const filled = new Set(enrichment.candidates.map((c) => c.domain));
            evidencePack.gaps = evidencePack.gaps.filter((g) => !(g.startsWith("NO_AUTHORITATIVE_RULE:") && filled.has(g.split(":")[1])));
            evidencePack.gaps.push(...enrichment.gaps);
            enrichmentTrace = enrichment.trace; enrichmentProposals = enrichment.proposals;
          } catch (enrichErr) { console.warn("[ai-smart-schedule] enrichment failed (non-fatal, DB tiers continue):", enrichErr); enrichmentTrace = { version: "llm-enrichment", skipped: `error:${(enrichErr as Error).message}` }; }
        } else enrichmentTrace = { version: "llm-enrichment", skipped: "time_budget", enrich_budget_ms: enrichBudgetMs };
        const harnessBudgetMs = Math.max(0, Math.min(HARNESS_MAX_MS, remainingMs() - NARRATION_MIN_MS - PERSIST_RESERVE_MS));
        timePlan.harness_budget_ms = harnessBudgetMs;
        for (const g of evidencePack.gaps) if (!baseline.gaps.includes(g)) baseline.gaps.push(g);
        const harnessed = await applyScheduleHarness(baseline.tasks, { cropCode: inputs.cropCode, cultivationMethod: inputs.cultivationMethod, cropCycle: inputs.cropCycle, gaps: baseline.gaps, resolvedInputs: inputs, landContext, evidencePack, budgetMs: harnessBudgetMs });
        if (!harnessed.result.applied || harnessed.result.status !== "READY") return json({ error: "Schedule harness failed closed before persistence", code: "HARNESS_VALIDATION_FAILED", trace: harnessed.result.trace }, 422);
        baseline.tasks.splice(0, baseline.tasks.length, ...harnessed.tasks);
        harnessTrace = harnessed.result.trace;
      }
    } catch (error) {
      console.error("[ai-smart-schedule] harness failed:", error);
      return json({ error: "Schedule harness execution failed before persistence", code: "HARNESS_FAILURE" }, 422);
    }

    // ── Calendar shape: timing window on every task, then the season-plan header ──────────
    try {
      const { getStages } = await import("./db/agronomy-repo.ts");
      const stageRows = await getStages(supabase, inputs.cropCode!, inputs.cropCycle, inputs.stageClockMethod ?? inputs.cultivationMethod);
      const tpOffset = computeTransplantOffset(stageRows, inputs.sowingDate, inputs.transplantDate);
      const byId = new Map(stageRows.map((r) => [r.id, r]));
      for (const t of baseline.tasks) {
        const r = (t.resources ??= {}) as Record<string, unknown>;
        if (r.window) continue;
        const st = t.stage_uuid ? byId.get(t.stage_uuid) : undefined;
        const rec = t.recurrence ?? null;
        r.window = rec
          ? { from_das: rec.window_start, to_das: rec.window_end, clock: "sowing" }
          : st ? { from_das: toDas(st, st.das_min, tpOffset) ?? t.days_from_sowing, to_das: toDas(st, st.das_max, tpOffset) ?? t.days_from_sowing, clock: String(st.das_reference ?? "sowing") }
          : { from_das: t.days_from_sowing, to_das: t.days_from_sowing, clock: "sowing" };
        if (!r.phase) r.phase = t.days_from_sowing < 0 ? "PRE_SEASON" : t.task_type === "harvest" ? "HARVEST" : t.task_type === "post_harvest" || t.task_type === "residue_management" ? "POST_HARVEST" : null;
      }
    } catch (winErr) { console.warn("[ai-smart-schedule] window backfill skipped:", winErr); }
    const planSummary = (() => {
      const byType = (type: string) => baseline.tasks.filter((t) => t.task_type === type);
      const line = (t: typeof baseline.tasks[number]) => ({ task: t.task_name, das: t.days_from_sowing, window: (t.resources as Record<string, unknown> | undefined)?.window ?? null, quantity: t.quantity ?? null, conditional: (t.resources as Record<string, unknown> | undefined)?.requirement_semantics === "CONDITIONAL_RULE", provenance: (t.resources as Record<string, unknown> | undefined)?.provenance ?? "db" });
      return {
        crop: inputs.cropLabel || cropName, variety: inputs.varietyName, cultivation_method: inputs.cultivationMethod, stage_clock_method: inputs.stageClockMethod, crop_cycle: inputs.cropCycle,
        sowing_date: inputs.sowingDate, transplant_date: inputs.transplantDate, land_area_acres: inputs.landAreaAcres, farming_policy: farmingType,
        seed: { quantity_kg: baseline.totals.seed_kg }, fertilizer: { n_kg: baseline.totals.n_kg, p_kg: baseline.totals.p_kg, k_kg: baseline.totals.k_kg, applications: [...byType("nutrition"), ...byType("micronutrient")].map(line) },
        water: byType("irrigation").map(line), weeds: byType("weed_management").map(line), pests: byType("pest_management").map(line), diseases: byType("disease_management").map(line),
        growth_regulation: byType("growth_regulation").map(line), pre_season: baseline.tasks.filter((t) => t.days_from_sowing < 0 || ["land_preparation", "seed_treatment", "nursery"].includes(t.task_type)).map(line),
        harvest: byType("harvest").map(line), post_harvest: [...byType("post_harvest"), ...byType("residue_management")].map(line),
        domain_coverage: (harnessTrace as Record<string, unknown> | null)?.domain_coverage ?? null, gaps: baseline.gaps,
      };
    })();

    let ragEvidence: RagEvidenceSummary | null = null;
    try {
      const ragFlag = await isFlagEnabled(supabase, "rag_schedule_evidence", { tenantId, farmerId });
      if (ragFlag.enabled) {
        ragEvidence = await attachRagEvidence(supabase, baseline.tasks, { cropCode: inputs.cropCode, cropLabel: inputs.cropLabel || cropName, regionCode: inputs.regionCode, tenantId, farmerId });
        baseline.coverage.rag_evidence = ragEvidence.tasks_evidenced > 0 && ragEvidence.tasks_no_evidence === 0 && ragEvidence.tasks_not_evaluated === 0;
        if (ragEvidence.tasks_no_evidence > 0) baseline.gaps.push(`rag_evidence: ${ragEvidence.tasks_no_evidence} task(s) have no corpus evidence (explicit NO_EVIDENCE)`);
      }
    } catch (e) { console.error("rag-evidence attachment failed (non-fatal):", e); }

    const sanitized = baseline.tasks.map((t) => sanitizeTaskText({ task_name: t.task_name, task_description: t.task_description, instructions: t.instructions, technical_details: t.technical_details }));
    baseline.tasks.forEach((t, i) => { t.task_name = sanitized[i].task_name || t.task_name; t.task_description = sanitized[i].task_description; t.instructions = sanitized[i].instructions; if (!hasFarmerText(sanitized[i])) baseline.gaps.push(`task_without_farmer_text:${t.task_type}`); });
    const narrationBudgetMs = Math.max(20_000, Math.min(60_000, HARD_DEADLINE_MS - (Date.now() - startTime) - PERSIST_RESERVE_MS));
    timePlan.narration_budget_ms = narrationBudgetMs;
    const narration = await narrateTasks(baseline.tasks.map((t) => ({ task_name: t.task_name, task_description: t.task_description, instructions: t.instructions })), language, narrationBudgetMs);
    const narrated = narration.tasks;
    // Narration outcome only annotates coverage; it never blocks persistence. Un-narrated tasks
    // are persisted with language=NULL + needs_translation and completed afterwards (see below).
    if (!narration.narrated) { baseline.gaps.push(`narration_unavailable: ${narration.reason ?? "unknown"}`); baseline.coverage.narration = false; }
    else if (narration.narratedCount < narration.totalCount) { baseline.gaps.push(`narration_partial: ${narration.narratedCount}/${narration.totalCount}`); baseline.coverage.narration = false; }
    else baseline.coverage.narration = true;
    if (language === "en") baseline.coverage.narration = true;

    const sow = new Date(inputs.sowingDate);
    const durationDays = baseline.totals.duration_days;
    const harvestDateStr = durationDays ? new Date(sow.getTime() + durationDays * 86400000).toISOString().split("T")[0] : null;
    const narratedIdx = new Set(narration.appliedIndices);
    const tasksToPersist = baseline.tasks.map((t, idx) => ({
      farmer_id: farmerId, tenant_id: tenantId,
      task_name: narrated[idx]?.task_name || t.task_name,
      task_description: narrated[idx]?.task_description || t.task_description,
      task_type: t.task_type,
      task_date: new Date(sow.getTime() + t.days_from_sowing * 86400000).toISOString().split("T")[0],
      projected_date: new Date(sow.getTime() + t.days_from_sowing * 86400000).toISOString().split("T")[0],
      days_from_sowing: t.days_from_sowing, anchor_type: t.anchor_type, anchor_stage: t.anchor_stage, gdd_target: t.gdd_target,
      stage_key: t.stage_key, stage_uuid: t.stage_uuid ?? null, stage_name: t.stage_name, stage_order: t.stage_order, priority: t.priority,
      weather_dependent: t.weather_dependent, status: "pending", sequence_order: idx + 1,
      instructions: narrated[idx]?.instructions || t.instructions, precautions: t.precautions ?? [],
      resources: { ...(t.resources ?? {}), ...(t.quantity ? { quantity: t.quantity } : {}), ...(t.recurrence ? { recurrence: t.recurrence } : {}), ...(sanitized[idx]?.technical_details?.length ? { technical_details: sanitized[idx].technical_details } : {}), ...(narratedIdx.has(idx) ? {} : { needs_translation: true, source_language: null, target_language: language }) },
      estimated_cost: t.estimated_cost, currency: "INR", rule_ids: t.rule_ids, trigger_rule_id: t.rule_ids[0] || null, confidence: t.confidence,
      source_refs: t.source_refs, language: narratedIdx.has(idx) ? language : null, is_pinned: false,
    }));
    const schedulePayload = {
      land_id: landId, farmer_id: farmerId, tenant_id: tenantId, crop_name: inputs.cropLabel || cropName, crop_variety: inputs.varietyName,
      variety_id: inputs.varietyId, cultivation_method: inputs.stageClockMethod ?? inputs.cultivationMethod, crop_cycle: inputs.cropCycle,
      sowing_date: inputs.sowingDate, transplant_date: inputs.transplantDate, expected_harvest_date: harvestDateStr, is_active: true, status: "active",
      generation_language: language, ai_model: narration.narrated ? `${narration.provider ?? "unknown"}/${narration.model ?? "unknown"} (narration only)` : "none",
      input_soil_data: landContext.soil, input_weather_data: landContext.weather, input_land_coordinates: landContext.coordinates, agro_climatic_zone: landContext.agroClimaticZone,
      calculated_for_area_acres: inputs.landAreaAcres, total_duration_days: durationDays, seed_quantity_kg: baseline.totals.seed_kg,
      fertilizer_n_kg: baseline.totals.n_kg, fertilizer_p_kg: baseline.totals.p_kg, fertilizer_k_kg: baseline.totals.k_kg, total_estimated_cost: baseline.totals.estimated_cost,
      state_region: inputs.state, district_name: inputs.district, farming_type: farmingType, tasks_total_count: baseline.tasks.length, tasks_completed_count: 0,
      backdated_consent: !!backdatedConsent, backdated_consent_at: backdatedConsent ? new Date().toISOString() : null,
      generation_params: { generator_version: GENERATOR_VERSION, resolved_inputs: inputs, harness: harnessTrace, enrichment: enrichmentTrace, plan_summary: planSummary, narration: { status: language === "en" || narration.narrated ? "COMPLETE" : "PENDING", requested_language: language, persisted_language: language, applied: narration.narrated, narrated_count: narration.narratedCount, total_count: narration.totalCount, pending_count: language === "en" ? 0 : narration.totalCount - narration.narratedCount, reason: narration.reason ?? null, attempts: 1, last_attempt_at: new Date().toISOString() }, farming_policy: farmingType, land_context_gaps: landContext.gaps, ndvi_context: landContext.ndvi, time_plan: { ...timePlan, elapsed_before_persist_ms: Date.now() - startTime } },
      metadata: { coverage: baseline.coverage, missing_sections: Object.entries(baseline.coverage).filter(([, ok]) => ok === false).map(([k]) => k), gaps: baseline.gaps, provenance: baseline.provenance, rag_evidence: ragEvidence },
    };
    const landPayload = { current_crop: inputs.cropLabel || cropName, current_crop_variety_id: inputs.varietyId, planting_date: inputs.sowingDate, transplant_date: inputs.transplantDate, gdd_anchor_type: inputs.transplantDate ? "transplant" : "planting", gdd_anchor_date: inputs.transplantDate ?? inputs.sowingDate, current_gdd: null, gdd_last_computed_at: null, expected_harvest_date: harvestDateStr, crop_cycle: inputs.cropCycle };
    const { data: persisted, error: persistError } = await supabase.rpc("persist_ai_crop_schedule_atomic", { p_schedule: schedulePayload, p_tasks: tasksToPersist, p_land: landPayload }).single();
    if (persistError || !persisted?.schedule_id) throw new Error(`Failed to persist schedule atomically: ${persistError?.message ?? "missing schedule result"}`);
    if (Number(persisted.task_count) !== tasksToPersist.length) throw new Error(`Atomic persistence task count mismatch: expected ${tasksToPersist.length}, got ${persisted.task_count}`);
    const savedSchedule = { id: persisted.schedule_id };
    if (enrichmentProposals.length) { try { const { recordProposals } = await import("./harness/llm-candidates.ts"); await recordProposals(supabase, enrichmentProposals, { tenantId, farmerId, landId, scheduleId: savedSchedule.id, inputs, model: String(enrichmentTrace?.model ?? null) }); } catch (pErr) { console.warn("[ai-smart-schedule] proposal ledger write failed:", pErr); } }

    // Continue narration in-process with whatever time is left; the app follow-up and the
    // periodic sweep (action=narrate) finish anything that remains.
    let narrationState: { status: string; narratedCount: number; totalCount: number; pendingCount: number } = { status: language === "en" || narration.narrated ? "COMPLETE" : "PENDING", narratedCount: narration.narratedCount, totalCount: narration.totalCount, pendingCount: language === "en" ? 0 : narration.totalCount - narration.narratedCount };
    if (narrationState.status === "PENDING" && HARD_DEADLINE_MS - (Date.now() - startTime) > 25_000) {
      try {
        const { data: schedRow } = await supabase.from("crop_schedules").select("id, generation_language, generation_params").eq("id", savedSchedule.id).maybeSingle();
        if (schedRow) {
          const cont = await narrateScheduleTasks(supabase, schedRow as { id: string; generation_language: string | null; generation_params: Record<string, unknown> | null }, startTime + HARD_DEADLINE_MS - 4_000);
          narrationState = { status: cont.still_pending === 0 ? "COMPLETE" : "PENDING", narratedCount: cont.total - cont.still_pending, totalCount: cont.total, pendingCount: cont.still_pending };
        }
      } catch (contErr) { console.warn("[ai-smart-schedule] in-process narration continuation failed (non-fatal):", contErr); }
    }
    if (farmingType) { const { error: fmErr } = await supabase.from("land_crops").update({ farming_type: farmingType }).eq("land_id", landId).eq("is_active", true); if (fmErr) console.warn({ event: "farming_type_sync_failed", landId, error: fmErr.message }); }
    const missingSections = Object.entries(baseline.coverage).filter(([, ok]) => ok === false).map(([key]) => key);
    const missingSectionLabelKeys = missingSections.map((k) => `schedule.section_pending.${k}`);
    try { await supabase.from("edge_invocation_logs").insert({ function_name: "ai-smart-schedule", user_id: farmerId || null, payload: { landId, cropCode: inputs.cropCode, http_status: 200, task_count: baseline.tasks.length, gaps: baseline.gaps, coverage: baseline.coverage, execution_time_ms: Date.now() - startTime } }); } catch (logErr) { console.warn("[ai-smart-schedule] edge_invocation_logs insert failed:", logErr); }
    return json({ success: true, scheduleId: savedSchedule.id, landId, cropCode: inputs.cropCode, cropName: inputs.cropLabel || cropName, translatedCropName: inputs.cropLabelLocal, varietyId: inputs.varietyId, cultivationMethod: inputs.cultivationMethod, sowingDate: inputs.sowingDate, language, totalTasks: baseline.tasks.length, totals: baseline.totals, coverage: baseline.coverage, missing_sections: missingSections, missing_section_label_keys: missingSectionLabelKeys, gaps: baseline.gaps, generatorVersion: GENERATOR_VERSION, harness: harnessTrace, enrichment: enrichmentTrace, planSummary, narrationApplied: narrationState.status === "COMPLETE", narrationStatus: narrationState.status, narratedCount: narrationState.narratedCount, totalCount: narrationState.totalCount, pendingCount: narrationState.pendingCount, executionTimeMs: Date.now() - startTime, generatedAt: new Date().toISOString() });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const landNotAvailable = errorMessage.includes("LAND_NOT_AVAILABLE");
    if (!landNotAvailable) console.error("❌ [ai-smart-schedule] Error:", error);
    try { const logClient = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""); await logClient.from("edge_invocation_logs").insert({ function_name: "ai-smart-schedule", user_id: farmerId || null, payload: { landId, cropCode: resolvedCropCode ?? cropName, http_status: landNotAvailable ? 200 : 500, domain_code: landNotAvailable ? "LAND_NOT_AVAILABLE" : null, task_count: 0, error: errorMessage, execution_time_ms: Date.now() - startTime } }); } catch (logErr) { console.warn("[ai-smart-schedule] edge_invocation_logs insert failed:", logErr); }
    if (landNotAvailable) return json({ success: false, error: "This land already has an active crop. Confirm the previous harvest before starting a new crop schedule.", code: "LAND_NOT_AVAILABLE", landId, executionTimeMs: Date.now() - startTime }, 200);
    return json({ error: errorMessage || "Schedule generation failed", executionTimeMs: Date.now() - startTime }, 500);
  }
});