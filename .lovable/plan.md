
## Root-cause audit — Ask AI from Proactive Alerts (Sugarcane / "Mala" land)

### Evidence collected

**1. The actual alert that the farmer tapped (`proactive_alerts.id = 18b70900…`)**
- `land_id`: `6b0d9b65…` (Mala, 7.59 acres, Sugarcane)
- `alert_category`: `CROP_STRESS`, `priority`: HIGH
- `trigger_data.ndvi`: **0.097** (severe stress)
- `trigger_data.condition_code`: **`NDVI_NON_RECOVERY`** (rain happened, NDVI did not recover → rules out water stress)
- `action_text_en` (Decision-Brain output):
  > DIAGNOSTIC INVESTIGATION: Rainfall occurred but crop health did not improve. This rules out water stress. Investigate: 1) Pest infestation (early shoot borer, stem borer, root grubs) 2) Disease (wilt, red rot, smut) 3) Severe N/K deficiency 4) Root damage / soil compaction 5) Waterlogging damage. Field inspection within 48 hours.
- `trigger_data.solution.cause_mr`: "ndvi non recovery - ऊस पिकाची तपासणी आवश्यक."
- `trigger_data.irrigation`: 24,36,861 L flood, 81.2 hrs (this is a *secondary* fallback action; the primary action is **diagnostic field inspection**, NOT irrigation)

**2. Seeded question that landed in the composer**
> "माझ्या 'मला' रानातल्या उसाला आता तातडीने पाट पाणी देण्याची गरज आहे का?"
> ("Does my Mala field sugarcane need urgent flood irrigation?")

This is **dead wrong**. The Decision-Brain explicitly ruled out water stress. The farmer is being primed to ask the opposite of what the alert says.

**3. AI response stored in DB**
> "भाऊ, तुमच्या ऊसाला आता १२२ दिवस झाले आहेत. हा काळ ग्रँड ग्रोथ स्टेज आहे. … जर माती कोरडी झाली असेल, तर पाट पाणी द्या. ⚠️ तुमच्या रानात पाण्याची गरज आहे का ते तपासायला हवे. तुमच्या मातीची स्थिती कशी आहे?"

Pure generic narration. Zero mention of NDVI 0.10, zero mention of the 5-point diagnostic protocol, zero mention of pest/disease/nutrient investigation, zero mention of the 48-hr inspection window.

**4. Orchestrator log confirms why**
```
ReferenceError: preAuthorityResult is not defined
  at orchestrator.ts:2828
```
Orchestration crashed mid-flow → fell back to a non-Decision-Brain generic LLM narration.
Also: `Has Symptoms: false`, `Authority: NONE (UNCONFIRMED)`, `Decision Confidence: 0`.
The orchestrator never received the alert payload, so it had no symbolic anchor to reason from.

### Three independent bugs causing the symptom

**BUG #1 — Wrong question synthesis in `proactive-question-seed`**
The seed prompt sends `category=CROP_STRESS` + `message_mr` (which contains the *secondary* irrigation fallback text) to the LLM. With no explicit guidance about the *primary action* (`action_text` = diagnostic) the LLM picks up the irrigation numbers from `message_mr` and produces an irrigation question. The `condition_code` (`NDVI_NON_RECOVERY`), the diagnostic checklist, and the explicit "rules out water stress" sentence are never injected into the LLM context.

**BUG #2 — Alert context is dropped at the chat→orchestrator boundary**
In `EnhancedAIChatInterface.tsx` (line ~1590), when the seeded question is sent, the body has only `messages`, `sessionId`, `landId`, `language`, `metadata.landContext`. The originating `alertId` and the rich `trigger_data` (NDVI value, condition code, decision_reasoning, action_text, solution.steps_mr) are **never forwarded**. The orchestrator therefore treats it as a brand-new free-text question with zero symptoms → falls into "MONITORING_ADVISED / NONE" branch → generic narration.

**BUG #3 — Orchestrator runtime crash**
`orchestrator.ts:2828` references `preAuthorityResult` which was deleted in v5.1 (lines 3615 & 3665 explicitly mark it as removed) but one residual call site remained. This crashes the proactive-alert path and silently downgrades responses.

---

## Fix plan

### Fix 1 — Make `proactive-question-seed` Decision-Brain-faithful
File: `supabase/functions/proactive-question-seed/index.ts`

- Extract from `alert.trigger_data`:
  - `condition_code` (e.g. `NDVI_NON_RECOVERY`)
  - `ndvi` value
  - `solution.cause_<lang>`, `solution.problem_<lang>`, `solution.steps_<lang>`
  - `irrigation` block (only if `condition_code` is irrigation-class)
- Build a **classified `primary_action`** (DIAGNOSTIC | IRRIGATION | NUTRITION | PROTECTION) from `condition_code` + `alert_category`. For `NDVI_NON_RECOVERY` → `DIAGNOSTIC`, never irrigation.
- Pass that classification to the LLM with a strict rule: *"The question must reflect the primary_action. If primary_action=DIAGNOSTIC, the farmer must ask about inspection / what is wrong, NOT about irrigation."*
- Strip large numeric figures (lakhs of liters, hours) from the LLM input so the model cannot anchor on them.
- Strengthen the deterministic fallback templates with action-aware phrasing per category.

### Fix 2 — Forward the alert payload through the chat pipeline
Files: `EnhancedAIChatInterface.tsx`, `supabase/functions/ai-agriculture-chat/index.ts`, `agents/orchestrator.ts`

- In the proactive-seed effect (line ~301), persist `fromAlertId` and the loaded alert row into a `proactiveContext` ref keyed by the target tab.
- In the send handler (line ~1590), when `proactiveContext` exists for the active tab and this is the first user message of the session, attach `metadata.proactiveAlert = { alert_id, category, priority, condition_code, ndvi, decision_reasoning, action_text_<lang>, solution_steps_<lang>, trigger_data }` and clear the ref so it only seeds once.
- In the orchestrator entry (`index.ts`), pull `metadata.proactiveAlert` and feed it into the context-builder as **pre-evidence**: seed `observations` with the symbolic codes derived from `condition_code` (e.g. `NDVI_LOW_CONFIRMED`, `NDVI_NON_RECOVERY`, `RAINFALL_RECENT`), set `symbolic_confidence` from the alert's confidence, and bypass the "no symptoms → MONITORING_ADVISED" branch when a HIGH-priority alert is the originating event.
- Inject `decision_reasoning` + `action_text_<lang>` into the LLM narrator's authoritative facts block, with the same hard rule that's already in `farmer-response-json-contract`: narrate, do not invent.

### Fix 3 — Repair the orchestrator runtime crash
File: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` line 2828

- Remove the residual `preAuthorityResult.nlu_bypassed` check (it's the same symbol the v5.1 cleanup removed at lines 3615/3665). Replace with the v5 authority-aware detector result that is already in scope at that point.
- Add a defensive `typeof === 'undefined'` guard so any future refactor does not crash the whole flow.

### Fix 4 — Defensive logging + telemetry
- In `proactive-question-seed`, log `{ alertId, condition_code, primary_action, source }` so we can audit drift.
- In the orchestrator, log when `metadata.proactiveAlert` is received and how many symbolic observations it seeded. This makes regressions visible immediately in edge logs.

---

## Acceptance criteria (replay the same alert)

For alert `18b70900…` in Marathi the seed must produce something like:
> "Mala शेतातील ऊसाची NDVI खूप कमी आहे (०.१०), पाऊस होऊनही सुधारणा नाही — कीड, रोग की अन्नद्रव्य कमतरता आहे का तपासायला हवं?"

And the AI response must:
1. Reference NDVI 0.10 / severe stress explicitly.
2. State that water stress is ruled out (rain occurred, no recovery).
3. List the 5-point diagnostic checklist (early shoot borer, stem borer, root grubs, wilt/red rot/smut, N/K deficiency, root/soil compaction, waterlogging) in the farmer's language.
4. Recommend field inspection within 48 hours.
5. Carry `decision_brain_source = true` and `actions_returned ≥ 1` in `ai_chat_messages`.
6. Orchestrator log shows no `preAuthorityResult is not defined` error.

### Technical references
- Decision-Brain SSOT memory: `mem://architecture/symbolic-engine-strict-invariants` — narration only, no LLM agronomy.
- Mode-driven UI: `mem://architecture/mode-driven-ui-interaction-contract` — confidence ≥ 50% required for free-text.
- Proactive symbolic enrichment: `mem://architecture/proactive-deterministic-symbolic-enrichment` — exactly the bridge this fix implements.
