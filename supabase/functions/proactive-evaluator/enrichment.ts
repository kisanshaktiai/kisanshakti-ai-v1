// =====================================================
// enrichment.ts — NEURAL NARRATION (F4) — AI MODEL REGISTRY
// CHANGE LOG (newest first)
// 2026-10-04 — an alert whose six text fields (title/message × mr/hi/en) are
//   already filled is not sent to the model: the result could only fill empty
//   fields, so 22 paid calls in 5 days wrote nothing.
// 2026-10-02 — review fixes: ledger row carries alert.farmer_id (database-verified) so usage is
//   attributed to the tenant; a provider cooling down after a 429 no longer ends the whole batch
//   (only 'no API key at all' does, as the old OPENAI_API_KEY gate did).
// 2026-09-27 — AI model SSOT: the model now comes from the AI model registry
//   (task alert.enrich, via callAITask with the service-role client the
//   evaluator already passes in) instead of cfg.enrichment_model
//   (proactive_evaluator_config key 'enrichment_model', code default
//   'gpt-5-mini'; no such row existed live). enrichment_model is removed from
//   config.ts. Same message and JSON mode; no token limit, temperature or
//   reasoning effort, as before. The OPENAI_API_KEY gate
//   (enrichmentAvailable) is gone: when no step of the route has a key the
//   router answers no_provider_available and enrichment stops silently, as
//   the old gate did. Unavoidable differences: each call now has the router's
//   default 55 s timeout (previously none); after a 429 the router cools the
//   provider for 5-8 s, and a call inside that window also answers
//   no_provider_available, so the rest of that batch is skipped instead of
//   being tried. Each call is recorded in ai_model_metrics.
// Earlier: replaced the Lovable AI gateway (model google/gemini-2.5-flash-lite
// in v123) with the OpenAI Chat Completions API.
//
// ARCHITECTURAL INVARIANT ("Symbolic Brain decides, AI only explains"):
// The LLM is a translator/simplifier of decision-brain output. It may NOT
// introduce any product, chemical, active ingredient, dosage, quantity,
// diagnosis, threshold, or treatment not present verbatim in the symbolic
// payload. It never writes trigger_data.solution. Enrichment only fills
// NULL/empty text fields — symbolic text always wins.
// 2026-10-02 (v128): enrichment never writes action_text_*. An action is a
// suggestion, and suggestions come only from trigger_data.graph_advice
// (decision-brain graph). An empty action field used to be filled by the model.
// =====================================================

import type { EvaluatorConfig } from './config.ts';
import { callAITask } from '../_shared/aiConfig.ts';

export async function enrichAndUpdateAlerts(
  supabase: any,
  insertedAlerts: any[],
  cfg: EvaluatorConfig,
): Promise<void> {
  const highRisk = insertedAlerts.filter(a =>
    a.risk_score >= cfg.enrichment_min_risk_score || a.priority === 'CRITICAL' || a.priority === 'HIGH');
  if (highRisk.length === 0) return;

  const TEXT_FIELDS = ['title_mr', 'title_hi', 'title_en', 'message_mr', 'message_hi', 'message_en'];
  const hasEmptyField = (a: any) => TEXT_FIELDS.some((f) => !String(a?.[f] ?? '').trim());
  const toEnrich = highRisk.filter(hasEmptyField).slice(0, cfg.enrichment_batch_max);

  for (const alert of toEnrich) {
    try {
      // The symbolic payload is the ONLY source of facts the model may use.
      const symbolicFacts = {
        alert_category: alert.alert_category,
        priority: alert.priority,
        risk_score: alert.risk_score,
        evidence: alert.trigger_data ?? {},
        title_en: alert.title_en ?? null,
        message_en: alert.message_en ?? null,
        graph_advice: alert.trigger_data?.graph_advice ?? null,
      };

      const inventionClause = cfg.neural_invention_allowed === true
        ? '' // explicit config override only; OFF in production
        : `\nHARD PROHIBITIONS (violating any of these makes the output unusable):\n- Do NOT introduce ANY product name, trade name, chemical, active ingredient, dosage, quantity, concentration, or application rate that does not appear VERBATIM in the symbolic data above.\n- Do NOT invent a diagnosis, threshold, treatment, timing window, or scientific claim.\n- Do NOT change any number present in the symbolic data.\n- If the symbolic data contains no treatment, the rephrased text must contain no treatment and no advice of its own.\n- You are a TRANSLATOR and SIMPLIFIER of the decision brain's output, never a decision maker.`;

      const prompt = `You rewrite farm advisories into simple rural Marathi, Hindi, and English for smallholder farmers. Work ONLY from the symbolic decision data below — it is the single source of truth.\n\nSYMBOLIC DECISION DATA (single source of truth):\n${JSON.stringify(symbolicFacts, null, 2)}\n${inventionClause}\n\nReturn JSON:\n{\n  "title_mr": "Marathi title (max 15 words, simple rural language)",\n  "title_hi": "Hindi title (max 15 words)",\n  "title_en": "English title (max 15 words)",\n  "message_mr": "Marathi rephrasing of message_en using only facts above (50-120 words)",\n  "message_hi": "Hindi rephrasing (50-120 words)",\n  "message_en": "Clearer English rephrasing (50-120 words)"\n}`;

      const r = await callAITask({
        db: supabase,
        task: 'alert.enrich',
        functionName: 'proactive-evaluator',
        // alert.farmer_id comes from the proactive_alerts row (database-verified), so the ledger can
        // attribute the call to the farmer's tenant (the identity trigger derives tenant_id from it).
        farmerId: alert.farmer_id ?? null,
        metadata: { caller: 'alert-enrich', alert_id: alert.id },
        messages: [{ role: 'user', content: prompt }],
        jsonMode: true,
      });

      if (!r.ok) {
        // No provider key configured at all (the old OPENAI_API_KEY gate) → no enrichment at all.
        // A provider merely cooling down after a 429 is a per-alert skip, like any other failure.
        if (r.errorClass === 'no_provider_available' && r.attempts.every((a) => a.outcome === 'skipped_no_key')) return;
        // Empty model content was skipped silently before.
        if (r.errorClass !== 'empty_output') console.warn(`[NeuralEnrichment] AI returned ${r.httpStatus ?? '-'} (${r.errorClass})`);
        continue;
      }

      const enriched = JSON.parse(r.content);
      // Symbolic text always wins: enrichment only fills NULL/empty fields.
      const updateData: Record<string, any> = {};
      if (enriched.title_mr && !alert.title_mr) updateData.title_mr = enriched.title_mr;
      if (enriched.title_hi && !alert.title_hi) updateData.title_hi = enriched.title_hi;
      if (enriched.title_en && !alert.title_en) updateData.title_en = enriched.title_en;
      if (enriched.message_mr && !alert.message_mr) updateData.message_mr = enriched.message_mr;
      if (enriched.message_hi && !alert.message_hi) updateData.message_hi = enriched.message_hi;
      if (enriched.message_en && !alert.message_en) updateData.message_en = enriched.message_en;
      // v128: no action_text_* and no trigger_data writes — advice is graph output only.

      if (Object.keys(updateData).length === 0) continue;
      await supabase.from('proactive_alerts').update(updateData).eq('id', alert.id);
      console.log(`[NeuralEnrichment] Rephrased alert ${alert.id} model=${r.apiModelId} invention_allowed=${cfg.neural_invention_allowed}`);
    } catch (e) {
      console.warn('[NeuralEnrichment] Error:', e.message);
    }
  }
}
