// =====================================================
// enrichment.ts — NEURAL NARRATION (F4) — OPENAI GATEWAY
// Replaces the Lovable AI gateway (LOVABLE_API_KEY /
// ai.gateway.lovable.dev, model google/gemini-2.5-flash-lite in v123) with
// the OpenAI Chat Completions API.
//   * Secret:  OPENAI_API_KEY   (set in Supabase Edge Function secrets)
//   * Model:   cfg.enrichment_model — DB-configurable via
//              proactive_evaluator_config key 'enrichment_model';
//              default 'gpt-5-mini' (JSON-mode rephrasing workload)
//
// ARCHITECTURAL INVARIANT ("Symbolic Brain decides, AI only explains"):
// The LLM is a translator/simplifier of decision-brain output. It may NOT
// introduce any product, chemical, active ingredient, dosage, quantity,
// diagnosis, threshold, or treatment not present verbatim in the symbolic
// payload. It never writes trigger_data.solution. Enrichment only fills
// NULL/empty text fields — symbolic text always wins.
// =====================================================

import type { EvaluatorConfig } from './config.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

export function enrichmentAvailable(): boolean {
  return !!OPENAI_API_KEY;
}

export async function enrichAndUpdateAlerts(
  supabase: any,
  insertedAlerts: any[],
  cfg: EvaluatorConfig,
): Promise<void> {
  if (!OPENAI_API_KEY) return;
  const highRisk = insertedAlerts.filter(a =>
    a.risk_score >= cfg.enrichment_min_risk_score || a.priority === 'CRITICAL' || a.priority === 'HIGH');
  if (highRisk.length === 0) return;

  const toEnrich = highRisk.slice(0, cfg.enrichment_batch_max);

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
        action_en: alert.action_text_en ?? null,
        symbolic_solution: alert.trigger_data?.solution ?? null,
      };

      const inventionClause = cfg.neural_invention_allowed === true
        ? '' // explicit config override only; OFF in production
        : `\nHARD PROHIBITIONS (violating any of these makes the output unusable):\n- Do NOT introduce ANY product name, trade name, chemical, active ingredient, dosage, quantity, concentration, or application rate that does not appear VERBATIM in the symbolic data above.\n- Do NOT invent a diagnosis, threshold, treatment, timing window, or scientific claim.\n- Do NOT change any number present in the symbolic data.\n- If the symbolic data contains no treatment, the rephrased text must contain no treatment — advise field inspection only.\n- You are a TRANSLATOR and SIMPLIFIER of the decision brain's output, never a decision maker.`;

      const prompt = `You rewrite farm advisories into simple rural Marathi, Hindi, and English for smallholder farmers. Work ONLY from the symbolic decision data below — it is the single source of truth.\n\nSYMBOLIC DECISION DATA (single source of truth):\n${JSON.stringify(symbolicFacts, null, 2)}\n${inventionClause}\n\nReturn JSON:\n{\n  "title_mr": "Marathi title (max 15 words, simple rural language)",\n  "title_hi": "Hindi title (max 15 words)",\n  "title_en": "English title (max 15 words)",\n  "message_mr": "Marathi rephrasing of message_en using only facts above (50-120 words)",\n  "message_hi": "Hindi rephrasing (50-120 words)",\n  "message_en": "Clearer English rephrasing (50-120 words)",\n  "action_mr": "Marathi rephrasing of action_en (max 30 words)",\n  "action_hi": "Hindi rephrasing (max 30 words)",\n  "action_en": "Clearer English rephrasing (max 30 words)"\n}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: cfg.enrichment_model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        console.warn(`[NeuralEnrichment] OpenAI returned ${response.status}`);
        await response.text();
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) continue;

      const enriched = JSON.parse(content);
      // Symbolic text always wins: enrichment only fills NULL/empty fields.
      const updateData: Record<string, any> = {};
      if (enriched.title_mr && !alert.title_mr) updateData.title_mr = enriched.title_mr;
      if (enriched.title_hi && !alert.title_hi) updateData.title_hi = enriched.title_hi;
      if (enriched.title_en && !alert.title_en) updateData.title_en = enriched.title_en;
      if (enriched.message_mr && !alert.message_mr) updateData.message_mr = enriched.message_mr;
      if (enriched.message_hi && !alert.message_hi) updateData.message_hi = enriched.message_hi;
      if (enriched.message_en && !alert.message_en) updateData.message_en = enriched.message_en;
      if (enriched.action_mr && !alert.action_text_mr) updateData.action_text_mr = enriched.action_mr;
      if (enriched.action_hi && !alert.action_text_hi) updateData.action_text_hi = enriched.action_hi;
      if (enriched.action_en && !alert.action_text_en) updateData.action_text_en = enriched.action_en;
      // F4: the LLM never writes into trigger_data.solution — the symbolic
      // solution object is decision-brain output and stays untouched.

      if (Object.keys(updateData).length === 0) continue;
      await supabase.from('proactive_alerts').update(updateData).eq('id', alert.id);
      console.log(`[NeuralEnrichment] Rephrased alert ${alert.id} model=${cfg.enrichment_model} invention_allowed=${cfg.neural_invention_allowed}`);
    } catch (e) {
      console.warn('[NeuralEnrichment] Error:', e.message);
    }
  }
}
