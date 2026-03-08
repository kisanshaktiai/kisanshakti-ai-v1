

# Upgrade Farmer Advisory Response Generator — Implementation Plan

## 1. Current System Audit

### What Exists Today

The system has **three overlapping response generators** creating confusion:

| Component | Location | Role | Status |
|-----------|----------|------|--------|
| `response-generator.ts` (v2) | `decision/` | Old template-based generator with 4 confidence-tier templates | **Obsolete** — only uses `action_text`, `reason_text`, `cause` from rules. Hardcodes `₹500-1000` cost. Ignores 50+ rich columns. |
| `deterministic-response-builder.ts` (v2.1) | `agents/` | **Best existing component** — maps all 65+ `decision_rules` columns into a 10-section `StructuredFarmerResponse` object | Active, integrated into LLM prompt via `buildRecommendationSummary()` |
| `llm-response-formatter.ts` | `agents/` | LLM narration layer — takes structured data, calls OpenAI/Gemini to render farmer-friendly text | Active, 2172 lines |

### Columns Currently Used vs Ignored

**Used by `deterministic-response-builder.ts`** (already ✅):
`rule_id`, `action_type`, `cause`, `reason_text`, `knowledge_text`, `action_text`, `active_ingredient`, `dosage_per_acre`, `water_volume_per_acre`, `application_method`, `target_pest_stage`, `chemical_class`, `mode_of_action`, `resistance_group`, `phi_days`, `reentry_interval_hours`, `bee_toxicity`, `aquatic_toxicity`, `farmer_safety_level`, `regulatory_status`, `organic_alternative`, `ipm_level`, `material_cost_per_acre_min/max`, `labor_cost_per_acre_min/max`, `roi_yield_gain_pct`, `roi_cost_saved_min/max`, `success_indicators`, `failure_indicators`, `min/max_temperature`, `rain_delay_hours`, `max_wind_speed`, `scientific_source`, `icar_package_ref`, `confidence_score`

**Ignored by `response-generator.ts`** (the old one):
ALL of the above except `action_text`, `reason_text`, `cause`. It hardcodes cost as `₹500-1000`.

### Key Problems

1. **`response-generator.ts` is dead weight** — it's imported by `orchestrator.ts` but its output is inferior to `deterministic-response-builder.ts`. The old templates discard 90% of rule data.

2. **No canonical advisory JSON reaches the frontend** — The `deterministic-response-builder.ts` output (`StructuredFarmerResponse`) is converted to plain text for the LLM prompt, then the LLM generates free text, then `index.ts` sends that as a string. The rich structured data never reaches the frontend's `FarmerMessageCard`.

3. **Frontend has its own `FarmerMessage` builder** (`farmerMessageBuilder.ts`) that duplicates the backend's structure with hardcoded Marathi/Hindi templates — but it receives only raw text from the edge function, not structured data.

4. **`response-generator.ts` ignores**: `observable_characteristics`, `visual_markers`, `differentiating_questions`, `scientific_basis`, `treatment_type`, `biological_group`, `equipment_required`, `university_source`, `weather_dependency`, `data_authority_rank`.

---

## 2. Implementation Plan

### Guiding Principle
The `deterministic-response-builder.ts` already does 80% of the job correctly. The upgrade focuses on: (a) creating a canonical JSON schema that flows end-to-end, (b) retiring the obsolete `response-generator.ts`, and (c) enriching the frontend renderer.

### Step 1: Create Canonical Advisory JSON Schema

**File**: `supabase/functions/ai-agriculture-chat/agents/canonical-advisory-schema.ts`

Define a `CanonicalFarmerAdvisory` interface that extends `StructuredFarmerResponse` with additional fields from the task spec:

```text
CanonicalFarmerAdvisory {
  diagnosis: { problem, category, rule_id, confidence_score, canonical_group }
  explanation: { what_is_happening, why_it_happens, scientific_basis }
  symptoms_to_confirm: string[]  // from observable_characteristics + visual_markers
  treatment: { action_type, immediate_action, organic_solution, chemical_solution, dosage, application_method, water_volume }
  safety: { farmer_safety_level, bee_toxicity, aquatic_toxicity, reentry_interval, phi_instruction, regulatory_status }
  environment: { temperature_range, humidity_range, wind_limit, rain_delay_hours, spray_window_instruction }
  economics: { cost_estimate, roi_yield_gain, roi_risk, cost_saved_range }
  monitoring: { success_indicators[], failure_indicators[] }
  trace: { rule_id, scientific_source, icar_package, university_source, data_authority_rank, expert_approved }
  multi_rule: { primary_advisory, secondary_observations[], monitoring_advice[] }  // for multi-rule situations
}
```

Add a `buildCanonicalAdvisory(structuredResponse, ruleData)` function that maps from the existing `StructuredFarmerResponse` + `RichRuleData` into this new schema. This is a pure data transformation — no new logic needed.

### Step 2: Refactor Response Pipeline

**File**: `supabase/functions/ai-agriculture-chat/decision/response-generator.ts`

Replace the entire `ResponseGenerator` class with a thin wrapper that:
1. Calls `extractRichRuleData()` from `deterministic-response-builder.ts`
2. Calls `buildDeterministicResponse()` to get `StructuredFarmerResponse`
3. Calls `buildCanonicalAdvisory()` to get the canonical JSON
4. Returns both the canonical JSON and the text prompt for LLM narration

This eliminates the obsolete template system while keeping the same export interface so `orchestrator.ts` doesn't break.

### Step 3: Pass Canonical JSON Through to Frontend

**File**: `supabase/functions/ai-agriculture-chat/index.ts`

In the response payload sent back to the frontend, add:
```typescript
structured_advisory: canonicalAdvisory  // The full canonical JSON
```

alongside the existing `formatted_response` text. This lets the frontend render structured cards instead of parsing markdown.

### Step 4: Handle Multi-Rule Situations

**File**: `supabase/functions/ai-agriculture-chat/agents/canonical-advisory-schema.ts`

Add `buildMultiRuleAdvisory()` that:
- Takes primary + secondary decisions from `DecisionOutput`
- Sorts by `priority → confidence_score → data_authority_rank` (already done by symbolic engine)
- Populates `multi_rule.primary_advisory`, `secondary_observations[]`, and `monitoring_advice[]`

### Step 5: Enrich Frontend Renderer

**File**: `src/components/chat/CanonicalAdvisoryCard.tsx` (new)

Create a new card component that renders the `CanonicalFarmerAdvisory` JSON with the layout from the spec:
- Problem Detected → What Is Happening → Why This Happens
- Symptoms To Confirm (bullet list from `observable_characteristics`)
- Treatment Options (Organic + Chemical, with dosage calculated for land area)
- Safety Instructions (PHI, bee toxicity, PPE)
- Weather Conditions (spray window)
- Cost & Benefit (from economics section)
- Monitoring Advice (success/failure indicators)
- Confidence Level + Scientific Source (trace section)

Uses the existing `ResponseSectionCard` component for each section with appropriate `sectionType` colors.

**File**: `src/components/chat/EnhancedAIChatInterface.tsx`

Update the message renderer to detect `structured_advisory` in the AI response metadata and render `CanonicalAdvisoryCard` instead of raw markdown when available.

### Step 6: Add Traceability Footer

Every advisory card includes a collapsible "Traceability" section showing:
- `rule_id`
- `scientific_source` / `icar_package_ref`
- `confidence_score`
- `data_authority_rank`

### Step 7: Deprecate Old Components

- Mark `response-generator.ts` old templates as deprecated
- Mark `farmerMessageBuilder.ts` frontend builder as deprecated (replaced by backend canonical JSON)
- Keep `FarmerMessageCard.tsx` as fallback for legacy responses

---

## 3. Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| **Create** | `agents/canonical-advisory-schema.ts` | Canonical JSON schema + builder |
| **Create** | `src/components/chat/CanonicalAdvisoryCard.tsx` | Frontend structured card renderer |
| **Modify** | `decision/response-generator.ts` | Replace templates with canonical builder |
| **Modify** | `index.ts` | Pass `structured_advisory` in response |
| **Modify** | `src/components/chat/EnhancedAIChatInterface.tsx` | Render canonical card when available |

## 4. What This Does NOT Change

- Symbolic decision logic (untouched)
- Rule evaluation engine (untouched)
- `deterministic-response-builder.ts` (used as-is, it's already correct)
- `llm-response-formatter.ts` (continues to handle LLM narration)
- Database schema (no changes)

## 5. Before vs After

**Before**: Rule fires → `response-generator.ts` uses 3 fields → flat text template → LLM reformats → farmer gets incomplete advice without safety/cost/monitoring data

**After**: Rule fires → `deterministic-response-builder.ts` uses 65+ fields → `CanonicalFarmerAdvisory` JSON → LLM narrates → farmer gets structured card with diagnosis, treatment, safety, cost, monitoring, and scientific traceability

