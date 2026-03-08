

# Full Forensic Audit: Agriculture AI Decision Brain (2030 Readiness)

---

## Phase 1 — Pipeline Architecture Audit

### Current Data Flow (verified from code)

```text
User Input (Marathi/Hindi/English)
    ↓
index.ts — Entry Point (4,086 lines)
    ↓
Language Detection + Dedup Guard
    ↓
orchestrator.ts — 9-Agent Pipeline (8,900+ lines)
    ├─ NLU Agent (intent + observation extraction)
    ├─ Semantic Extractor (symptom codes)
    ├─ Canonical State Builder (context assembly)
    ├─ Layered Rule Evaluator (508 rules evaluated)
    ├─ Conflict Resolver + Safety Gates
    ├─ Primary Decision Selection
    └─ Communication Generator
    ↓
index.ts — Response Generation Layer
    ├─ [PATH A] LLM Formatter (llm-response-formatter.ts, 2,306 lines)
    │       ├─ extractRichRuleData() → deterministic-response-builder.ts
    │       ├─ buildDeterministicResponse() → structured 10-section response
    │       ├─ formatStructuredResponseForLLM() → LLM prompt data
    │       ├─ OpenAI/Gemini/Lovable AI call → natural language
    │       └─ Output Validation Gate (7 checks)
    ├─ [PATH B] buildFormattedRecommendationsList() — fallback builder in index.ts
    ├─ [PATH C] buildResponseFromDecisionOutput() — second fallback in index.ts
    ├─ [PATH D] generateValidationFailureFallback() — validation failure path
    ├─ [PATH E] generateNoRecommendationsFallback() — no-rules path
    ├─ [PATH F] flattenCommunicationToText() — communication flattener
    └─ [PATH G] forceTranslateResponse() — post-hoc translation layer
    ↓
Response Validation Gate (index.ts)
    ↓
Farmer Output (JSON payload)
```

### Finding 1: SEVEN Response Builders Still Exist
Despite prior audits identifying this, there are still 7 distinct paths that generate farmer-facing text. Paths B, C, D, E each contain hardcoded multilingual dictionaries (greetings, closings, section headers) — violating the SSOT constraint.

---

## Phase 2 — Rule Engine Integrity

### Finding 2: Rule Explosion (508 evaluated, 28 matched)
The engine evaluates all 508 active rules per query. Only 28 match. The log shows 13,074ms response time previously. Current log shows ~7,054ms. The two-stage pre-filter (crop → stage → symptom) has not been implemented.

### Finding 3: Taxonomy Inconsistency
22 distinct `canonical_group` values exist, with duplicates:
- `02_disease` AND `04_disease` (disease rules split across two groups)
- `05_soil` AND `05_nutrition` (overlapping soil/nutrition)
- `04_irrigation` AND `07_climate_water` (overlapping water topics)
- 2 rules have `NULL` canonical_group

### Finding 4: 56 Rules Use `STAGE_GENERAL` condition_code
These rules bypass the condition ledger's normal matching and rely on expensive in-memory JSONB filtering of `observable_characteristics`.

---

## Phase 3 — Agronomic Accuracy

### Finding 5: Active Ingredient Coverage Gap
- 535 active rules, but **454 (84.9%) have NO active_ingredient**
- Only 81 rules have chemical product data
- 20 rules are missing `dosage_per_acre`
- Many disease BLOCK rules have `active_ingredient` set but `dosage_per_acre = "N/A - advisory/monitoring action"` — semantically incorrect for a dosage field

### Finding 6: Chlorpyrifos Safety Concern
Rule `SC_PEST_TOP_BORER_004` recommends Chlorpyrifos 20% EC. Chlorpyrifos is under regulatory scrutiny in India (restricted in several states). The system has it in `BANNED_CHEMICALS` list in `decision-graph-bridge.ts` but it still fires as a recommendation. The safety guardian should flag this inconsistency.

### Finding 7: Crop Distribution Skew
- Sugarcane: 438 rules (81.9%)
- Cotton: 27 rules (5.0%)
- Other crops: 0 dedicated rules
- Rice, Wheat, Soybean, Maize — zero coverage

---

## Phase 4 — Database Schema Audit

### Finding 8: `master_products` Ingredient Matching Gap
- `master_products.active_ingredients` is JSONB (array of `{name, percentage, formulation}`)
- `decision_rules.active_ingredient` is plain TEXT (e.g., "Chlorpyrifos 20% EC")
- The `lookupMarketProducts` helper uses `ILIKE` on the JSONB text cast, which works but is fragile and unindexed
- Only 82 products in `master_products` vs 81 rules with active ingredients — many rules reference ingredients not in the product table

### Finding 9: Missing `action_text` Data
- 0 rules missing `action_text` (good)
- 11 rules missing `reason_text` — these will show empty "Reason" sections

---

## Phase 5 — LLM Boundary Audit

### Finding 10: LLM Prompt Is Safe — No Agronomic Reasoning
The system prompt in `buildFormattingSystemPrompt()` correctly states:
- "You are a LANGUAGE ADAPTER...TRANSLATOR/FORMATTER ONLY"
- "THE SUPREME LAW: Every product name, dosage...MUST come from the data below"
- "You CANNOT add, remove, or modify..."

No dangerous patterns like "generate advisory" or "suggest treatment" found. The LLM boundary is correctly enforced.

### Finding 11: Token Waste from Matched Responses
The `filterRelevantResponses()` function caps at 3 responses, but `buildRecommendationSummary()` also includes `stageAdvisoryBlock` and `secondaryRecsBlock`, inflating prompt size. Log shows ~2,140 tokens per call (acceptable for gpt-4o-mini).

---

## Phase 6 — Response Formatter Audit

### Finding 12: Hardcoded Multilingual Strings in Code
Despite the SSOT memory stating "hardcoded translation dictionaries are prohibited," the following files still contain extensive hardcoded multilingual dictionaries:
- `index.ts`: `normalizeToEnglish()` (30+ terms), `forceTranslateResponse()` (70+ phrase mappings), `buildFormattedRecommendationsList()` (15+ dictionaries), `buildResponseFromDecisionOutput()` (10+ dictionaries)
- `llm-response-formatter.ts`: `IPM_URGENCY_LABELS` (5 entries)

These should be migrated to `observation_translations` table.

### Finding 13: `forceTranslateResponse()` Has Fragile Regex Replacement
The function does string replacement sorted by length, which can cause partial replacements when English phrases overlap (e.g., "Cause:" inside "Root Cause:"). This is a latent bug.

---

## Phase 7 — Performance Optimization

### Finding 14: No DB Indexes on Rule Filtering Columns
The rule evaluator queries with `crop_code`, `canonical_group`, and `condition_code` filters. There are no composite indexes on these columns in `decision_rules`. Adding a composite index on `(crop_code, is_active, canonical_group)` would significantly reduce query time.

### Finding 15: Market Product Lookup Adds Latency
Each response now makes an additional DB call to `master_products`. While cached (6h TTL), the first call per ingredient adds ~200ms. For scale, a materialized view or join in the rule query would be faster.

---

## Phase 8 — Safety Guard Audit

### Finding 16: PHI Enforcement Is Sound
`deterministic-response-builder.ts` correctly validates PHI against days-to-harvest and blocks dosage when PHI is violated. The `validateDosageSafety()` function checks against `MAX_SAFE_DOSES` for 20 active ingredients.

### Finding 17: Bee Toxicity Warning Is Correct
Evening-spray enforcement for HIGH bee toxicity rules is properly implemented in the system prompt and structured builder.

---

## Remediation Plan

### Immediate Fixes (P0 — This Sprint)

| # | Issue | Fix | Files |
|---|-------|-----|-------|
| 1 | Duplicate `canonical_group` (`02_disease` / `04_disease`) | Consolidate to single `04_disease` via migration | DB migration |
| 2 | 2 rules with NULL `canonical_group` | Assign correct group via DB update | DB migration |
| 3 | Chlorpyrifos in banned list but still recommended | Add regulatory check in rule evaluator OR update rule to use safer alternative (Chlorantraniliprole) | `decision_rules` update |
| 4 | 11 rules missing `reason_text` | Populate from scientific_basis or ICAR refs | DB migration |

### Structural Improvements (P1 — Next Sprint)

| # | Issue | Fix | Files |
|---|-------|-----|-------|
| 5 | 7 response builders | Consolidate to 2: `deterministic-response-builder.ts` (structured) + `llm-response-formatter.ts` (narration). Remove paths B-F from `index.ts` | `index.ts` |
| 6 | 508 rules evaluated per query | Add two-stage pre-filter: Stage 1 = DB-level `WHERE crop_code AND is_active`, Stage 2 = condition ledger. Target: <50 candidate rules | `layered-rule-evaluator.ts` |
| 7 | Hardcoded multilingual dictionaries | Migrate 100+ phrase mappings to `observation_translations` table | `index.ts`, `llm-response-formatter.ts`, DB migration |
| 8 | Missing DB composite index | `CREATE INDEX idx_rules_crop_active ON decision_rules(crop_code, is_active, canonical_group)` | DB migration |

### Data Corrections (P2 — Data Team)

| # | Issue | Fix |
|---|-------|-----|
| 9 | 454 rules missing `active_ingredient` | Expected for non-treatment rules (MONITOR, OBSERVE). Validate that all RECOMMEND/SPRAY rules have ingredients |
| 10 | Crop coverage: 0 rules for Rice/Wheat/Soybean | Create 50+ rules per major crop from ICAR packages |
| 11 | `STAGE_GENERAL` condition_code on 56 rules | Migrate to specific observation codes from `observation_master` |

### Architecture Upgrades (P3 — 2030 Readiness)

| # | Upgrade | Description |
|---|---------|-------------|
| 12 | Monolith decomposition | Split 8,900-line `orchestrator.ts` into 6 pipeline modules |
| 13 | Split 4,086-line `index.ts` | Extract response builders into `response-pipeline.ts` |
| 14 | `decision_rules` → `master_products` FK | Add `product_id` FK column to `decision_rules` for direct join instead of ILIKE matching |
| 15 | Real-time weather integration | Feed live temperature/humidity/rain into environmental gates |

---

## Validation Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Agronomic Accuracy | 7/10 | Dosage caps, PHI enforcement solid. Chlorpyrifos concern. |
| Deterministic Engine | 8/10 | Rules supreme, LLM boundary enforced. Taxonomy needs cleanup. |
| Farmer Safety | 8/10 | PHI, bee toxicity, overdose caps all working. Regulatory status gap. |
| Scalability | 5/10 | 508-rule full scan, no DB indexes, monolithic orchestrator. |
| Data Integrity | 6/10 | 84.9% rules lack ingredients (expected for non-treatment). Crop skew critical. |
| Production Readiness | 7/10 | 7s response time acceptable. 7 response builders is technical debt. |

**Overall: 6.8/10 — Production-functional but not 2030-ready without P1-P3 fixes.**

