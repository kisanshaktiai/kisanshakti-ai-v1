

# Full Codebase Capability Audit — KisanShakti Symbolic Decision Brain

---

## 1. Decision Brain File Inventory

### A. Entry Point & Orchestration (2 files)

| File | Purpose | Lines |
|------|---------|-------|
| `supabase/functions/ai-agriculture-chat/index.ts` | HTTP entry, dedup guard, Unified Decision Gate integration, `forceTranslateResponse`, rich field propagation | 4,124 |
| `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` | 9-agent coordinator, pipeline phases 0-5, crop inference, stage guard, diagnostic routing | 8,905 |

### B. Language & NLU Layer (10 files)

| File | Purpose | Input | Output |
|------|---------|-------|--------|
| `agents/language-induction-layer.ts` | **DEPRECATED** legacy keyword dictionaries; only symbol enums remain | raw text | CanonicalSymptomSymbol enums |
| `agents/semantic-extractor.ts` | LLM-first intent extraction (v5.1.0), delegates to intent-classifier | farmer message | `SemanticExtraction` (intent_code + confidence) |
| `agents/intent-classifier.ts` | LLM-driven classification with land context enrichment (v3.0.0) | message + land context | intent_code + confidence |
| `agents/dialect-normalizer.ts` | Normalize regional dialect variations | raw text | normalized text |
| `agents/language-normalizer.ts` | Script/language normalization | raw text | normalized text |
| `agents/language-quality-validator.ts` | Validate language detection quality | detected lang | quality score |
| `agents/observation-extractor.ts` | Pattern-based symptom extraction (Marathi/Hindi/English) | normalized text | `ObservationExtraction` |
| `agents/nlu-agent.ts` | Full NLU agent wrapper | raw input + context | `NluAgentOutput` |
| `agents/entity-normalizer.ts` | Normalize crop/pest entity names | raw entities | canonical entities |
| `agents/entity-code-mapper.ts` | Map entity names to DB codes | entity names | entity codes |

### C. Observation & Symbol Layer (10 files)

| File | Purpose | Input | Output |
|------|---------|-------|--------|
| `decision/observation-code-mapper.ts` | Intent → ObservationKey codes (deterministic) | SemanticExtraction | `MappedObservationCodes` |
| `decision/intent-resolver.ts` | intent_code → observation_codes via DB `intent_observation_mapping` | intent + crop + DAS | observation codes |
| `decision/observation-ontology.ts` | ObservationKey enum definitions | — | enums |
| `decision/induction-to-observation-mapper.ts` | Legacy induction symbols → observation codes | induction symbols | observation codes |
| `decision/observation-code-mapper.ts` | Cross-crop symptom ontology bridging | observation codes | expanded codes |
| `agents/observation-key-mapper.ts` | Observation key normalization | raw keys | canonical keys |
| `agents/canonical-observation-loader.ts` | Load observation master from DB | supabase client | observation registry |
| `utils/observation-authority.ts` | Epistemic authority tagging (CONFIRMED/EXTRACTED/INFERRED/SYNTHETIC) | observation + source | `AuthoredObservation` |
| `agents/cross-crop-symptom-mapper.ts` | Cross-crop symptom mapping | crop A symptoms | crop B equivalents |
| `utils/llm-output-validator.ts` | Validate LLM-extracted codes against DB | intent + obs codes | validation result |

### D. Context & State Layer (9 files)

| File | Purpose |
|------|---------|
| `agents/canonical-state-builder.ts` | Build `CanonicalState` with closed-world enums (24 crops, 14 stages, NDVI, soil) |
| `decision/authoritative-state-loader.ts` | SSOT for NDVI/soil interpretation, land state from DB (v2.0.0) |
| `decision/context-authority.ts` | Crop context authority resolution |
| `decision/canonical-context-contract.ts` | Context contract enforcement |
| `decision/canonical-state-invariants.ts` | State immutability guards |
| `decision/context-validator.ts` | Validate context completeness |
| `agents/context-manager.ts` | Session state management |
| `agents/soil-ndvi-state-calculator.ts` | Soil/NDVI state derivation |
| `utils/crop-code-normalizer.ts` | Crop code variant generation (SC/SUGARCANE) |

### E. Symbolic Decision Brain (12 files)

| File | Purpose |
|------|---------|
| `decision/symbolic-reasoner.ts` | Core fact-to-rule evaluation engine (1,573 lines) |
| `decision/fact-extractor.ts` | Observation → SymbolicFact conversion (v3.0.0) |
| `decision/causal-hypothesis-engine.ts` | Hypothesis generation + HypothesisLedger arbitration (802 lines) |
| `decision/hypothesis-evaluator.ts` | Hypothesis-first clarification evaluator (1,171 lines) |
| `agents/layered-rule-evaluator.ts` | Multi-phase rule evaluation pipeline (1,750 lines) |
| `bundled-rules/loader.ts` | Rule loading from DB, Condition Ledger evaluation, alias expansion |
| `bundled-rules/all-rules.ts` | Type stubs for bundled rules |
| `agents/rule-engine-executor.ts` | Rule engine execution wrapper |
| `decision/confidence-calculator.ts` | Multi-factor confidence scoring (dual signals) |
| `decision/confidence-thresholds.ts` | Centralized threshold constants |
| `agents/diagnosis-conflict-resolver.ts` | Category-based diagnosis conflict resolution |
| `decision/nutrition-conflict-arbitrator.ts` | Nutrition-specific conflict gates |

### F. Decision Gates (6 files)

| File | Purpose |
|------|---------|
| `decision/unified-decision-gate.ts` | Single unified treatment validation gate (v2.1.0, 936 lines) |
| `decision/prescription-gate-enforcer.ts` | Symbolic-only output control |
| `decision/decision-readiness-gate.ts` | Hard safety gate (crop + stage + symptom + authority) |
| `decision/etl-gate.ts` | Economic Threshold Level validation |
| `decision/weather-safety-gate.ts` | Weather-based spray blocking |
| `decision/diagnostic-signal-detector.ts` | Diagnostic signal strength detection |

### G. Safety Layer (5 files)

| File | Purpose |
|------|---------|
| `agents/safety-guardian.ts` | Final safety checkpoint (banned substances, PHI, escalation) |
| `agents/safety-guardian-types.ts` | Safety types + banned substance lists + PHI database |
| `agents/phi-enforcement-guardian.ts` | Pre-Harvest Interval enforcement (CIB&RC/FSSAI/APEDA) |
| `agents/pollinator-protection-rules.ts` | Bee toxicity enforcement |
| `decision/safety-enhancement.ts` | Safety warnings + resistance rotation |

### H. Response Generation (9 files)

| File | Purpose |
|------|---------|
| `agents/deterministic-response-builder.ts` | 10-section structured response from DB columns only (v2.0.0, 1,140 lines) |
| `agents/llm-response-formatter.ts` | LLM render-only mode with validation gates (2,110 lines) |
| `agents/llm-response-generator.ts` | Pure narration layer (v2.0.0, 755 lines) |
| `decision/response-generator.ts` | Template-based farmer communication (552 lines) |
| `decision/explanation-chain-builder.ts` | Rule traceability chains (447 lines) |
| `agents/communication-generator.ts` | Communication generation agent |
| `contracts/farmer-response-contract.ts` | Guaranteed complete symbolic output contract (v2.0.0) |
| `contracts/ui-response-contract.ts` | UI rendering contract |
| `utils/response-mode-renderer.ts` | Response mode → UI rendering |

### I. Translation & i18n (6 files)

| File | Purpose |
|------|---------|
| `i18n/translation-loader.ts` | DB-driven observation translations |
| `i18n/observation-label-loader.ts` | Observation label resolution |
| `i18n/language-types.ts` | Language type definitions |
| `agents/communication-translation-dictionary.ts` | Product/action/cause translations |
| `agents/diagnostic-options-i18n.ts` | Diagnostic option localization |
| `services/regional-translator.ts` | Regional translation service |

### J. Economics & Agronomic Modules (5 files)

| File | Purpose |
|------|---------|
| `agents/economic-calculator.ts` | Cost-benefit, ROI, affordability analysis |
| `agents/spray-window-calculator.ts` | Weather-based spray window identification |
| `agents/gdd-phenology-engine.ts` | Growing Degree Days phenology engine |
| `agents/photoperiod-calculator.ts` | Photoperiod calculation |
| `agents/irrigation-decision-module.ts` | Irrigation decision logic |

### K. Validation & Audit (7 files)

| File | Purpose |
|------|---------|
| `agents/audit-logger.ts` | Complete forensic decision trail (v2.0.0) |
| `agents/delivery-validator.ts` | Recommendation integrity validation |
| `agents/response-validation-gate.ts` | Source validation gate |
| `agents/agronomic-validator.ts` | Agronomic correctness validation |
| `validation/validation-runner.ts` | 12-dimension validation runner |
| `validation/dimension-validators.ts` | Per-dimension validators |
| `validation/field-test-cases.ts` | 50+ field-validated test cases |

### L. Frontend Decision Graph (11 files — types only)

| File | Purpose |
|------|---------|
| `src/decision-graph/index.ts` | Types-only re-export (all logic server-side) |
| `src/decision-graph/types.ts` | Full type system (2,077 lines): soil/NDVI/weather/crop enums |
| `src/decision-graph/advisory-builder.ts` | UnifiedAdvisory builder (client-side, for offline/PWA) |
| `src/decision-graph/confidence-engine.ts` | Client confidence scoring |
| `src/decision-graph/conflict-resolver.ts` | Client conflict resolution |
| `src/decision-graph/ai-boundary.ts` | AI modification boundary enforcement |
| `src/decision-graph/audit-logger.ts` | Client audit trail |
| `src/decision-graph/fact-extractor.ts` | Client fact extraction |
| `src/decision-graph/decision-mapper.ts` | Client decision mapping |
| `src/decision-graph/regional-adapter.ts` | Regional rule adaptation |

### M. Deprecated / Legacy (3 files)

| File | Status |
|------|--------|
| `src/_deprecated/chat/diagnosticResponseBuilder.ts` | Migrated to communication-generator |
| `src/_deprecated/chat/farmerIntentService.ts` | Migrated to nlu-agent |
| `src/_deprecated/chat/symptomPatternRecognizer.ts` | Migrated to visual-agent |

**TOTAL: ~120 files in the decision system, ~45,000+ lines of code**

---

## 2. System Pipeline Map

```text
FARMER QUERY (any language)
    │
    ▼
┌──────────────────────────────────────────────┐
│  index.ts                                     │
│  HTTP entry, dedup, rate limit, CORS          │
│  Canonical language detection                 │
└───────────────┬──────────────────────────────┘
                ▼
┌──────────────────────────────────────────────┐
│  orchestrator.ts (Phase 0)                    │
│  Query Router → route classification          │
│  Crop inference from message                  │
│  Stage guard evaluation                       │
└───────────────┬──────────────────────────────┘
                ▼
┌──────────────────────────────────────────────┐
│  Phase 0.5: Semantic Extraction               │
│  semantic-extractor.ts → intent-classifier.ts │
│  LLM extracts intent_code + confidence        │
│  intent-resolver.ts → observation codes (DB)  │
└───────────────┬──────────────────────────────┘
                ▼
┌──────────────────────────────────────────────┐
│  Phase 1: Observation Assembly                │
│  observation-code-mapper.ts (deterministic)   │
│  observation-extractor.ts (pattern-based)     │
│  cross-crop-symptom-mapper.ts                 │
│  observation-authority.ts (tagging)            │
│  llm-output-validator.ts (DB validation)      │
└───────────────┬──────────────────────────────┘
                ▼
┌──────────────────────────────────────────────┐
│  Phase 1.5: Canonical State Building          │
│  canonical-state-builder.ts                   │
│  authoritative-state-loader.ts (DB land data) │
│  context-authority.ts                         │
└───────────────┬──────────────────────────────┘
                ▼
┌──────────────────────────────────────────────┐
│  Phase 2: Symbolic Decision Brain             │
│  fact-extractor.ts → SymbolicFact             │
│  symbolic-reasoner.ts (conditions_json eval)  │
│  causal-hypothesis-engine.ts (arbitration)    │
│  layered-rule-evaluator.ts (main evaluator)   │
│  loader.ts (Condition Ledger)                 │
│  diagnosis-conflict-resolver.ts               │
│  nutrition-conflict-arbitrator.ts             │
└───────────────┬──────────────────────────────┘
                ▼
┌──────────────────────────────────────────────┐
│  Phase 2.5: Confidence & Arbitration          │
│  confidence-calculator.ts (dual signals)      │
│  confidence-thresholds.ts                     │
│  diagnosis-only-mode.ts (terminal override)   │
└───────────────┬──────────────────────────────┘
                ▼
┌──────────────────────────────────────────────┐
│  Phase 3: Decision Gates                      │
│  unified-decision-gate.ts (single gate)       │
│  prescription-gate-enforcer.ts                │
│  decision-readiness-gate.ts                   │
│  etl-gate.ts                                  │
│  weather-safety-gate.ts                       │
└───────────────┬──────────────────────────────┘
                ▼
┌──────────────────────────────────────────────┐
│  Phase 4: Safety Layer                        │
│  safety-guardian.ts (banned substances, PHI)  │
│  phi-enforcement-guardian.ts                  │
│  pollinator-protection-rules.ts               │
└───────────────┬──────────────────────────────┘
                ▼
┌──────────────────────────────────────────────┐
│  Phase 5: Response Generation                 │
│  deterministic-response-builder.ts (10 sect.) │
│  llm-response-formatter.ts (render-only LLM)  │
│  explanation-chain-builder.ts (traceability)  │
│  forceTranslateResponse (index.ts)            │
└───────────────┬──────────────────────────────┘
                ▼
          FARMER RESPONSE
```

---

## 3. Advisory Generation Modules

| File | Key Functions | Advisory Data Generated |
|------|---------------|------------------------|
| `deterministic-response-builder.ts` | `buildDeterministicResponse()`, `extractRichRuleData()`, `formatStructuredResponseForLLM()`, `hasAdequateRuleContent()` | 10-section response: Problem, Action, Dosage, Method, Safety, Organic Alt, Cost, Success/Failure Signs, ROI, Scientific Ref |
| `llm-response-formatter.ts` | `formatRecommendationsWithLLM()` | LLM-narrated farmer-friendly text from structured data |
| `llm-response-generator.ts` | `generateLLMResponse()`, `validateNarrationOutput()`, `validateSymbolicInput()` | Natural language narration of symbolic decisions |
| `response-generator.ts` | `ResponseGenerator.generate()` | Template-based responses (VERY_HIGH/HIGH/MODERATE/LOW confidence) |
| `explanation-chain-builder.ts` | `ExplanationChainBuilder.build()` | Rule-traced explanation chains with multilingual summaries |
| `communication-generator.ts` | `CommunicationGenerator.generate()` | Farmer communication wrapper |
| `farmer-response-contract.ts` | Type definitions only | `FarmerResponseMode`, `ClarificationOptionCode`, `ActionCode` |
| `src/decision-graph/advisory-builder.ts` | `buildAdvisory()`, `validateAdvisory()` | Client-side `UnifiedAdvisory` (for PWA/offline) |

---

## 4. Advisory Builder Analysis

**`src/decision-graph/advisory-builder.ts`** builds a `UnifiedAdvisory` object containing:

| Field | Present | Source |
|-------|---------|--------|
| Diagnosis (causes) | Yes | `Cause[]` enum |
| Treatment (actions) | Yes | `PrioritizedAction[]` |
| Dosage | Partial | Via action payload, not explicit field |
| Safety | Partial | Via `scientific_sources` only |
| Monitoring indicators | No | Not in schema |
| ROI / Economics | No | Not in schema |
| Scientific source | Yes | `scientific_sources[]` |
| Decision confidence | Yes | `confidence: number` |
| Risk level | Yes | `RiskLevel` enum |
| Reasoning trace | Yes | `reasoning_trace[]` |
| Feedback loop | Yes | `feedback_status` |
| PHI/bee toxicity | No | Not in schema |
| Environmental conditions | No | Not in schema |

**Verdict**: The client-side `advisory-builder.ts` is a **simplified offline-capable** version. The **full advisory** is generated server-side by `deterministic-response-builder.ts` which maps all 50+ `decision_rules` columns.

---

## 5. Narration Layer Analysis

**`llm-response-formatter.ts`** (2,110 lines):

- **Input**: Receives `LLMFormatterInput` with `DecisionOutput` + rule data
- **Deterministic Builder Integration**: Calls `extractRichRuleData()` → `buildDeterministicResponse()` → `formatStructuredResponseForLLM()` to create structured agronomic content
- **LLM Role**: System prompt enforces render-only ("You are an agricultural communication expert. You ONLY present the decisions already made.")
- **Hallucination Prevention**:
  - `validateLLMOutputIntegrity()` checks for unauthorized products/dosages/percentages
  - `validateDelivery()` verifies recommendation integrity
  - `generateMustIncludeConstraint()` ensures key data appears in output
  - Falls back to `deterministic-response-builder` template if validation fails
- **25-second timeout** with structured fallback
- **IPM urgency labels** localized for MR/HI/EN

**Validation Gates**:
1. Input Validation Gate — blocks if symbolic input invalid
2. Output Validation Gate — blocks if LLM added unauthorized content
3. Delivery Validator — checks product/dosage presence
4. Source Validation Gate — final check in `index.ts`

---

## 6. Capability Map

```text
SYSTEM CAPABILITY                          STATUS
─────────────────────────────────────────────────────
Language Detection & Normalization         ✅ Implemented (LLM-first + legacy fallback)
Intent Classification                      ✅ Implemented (LLM v3.0.0 + DB validation)
Observation Extraction                     ✅ Implemented (pattern + LLM + DB mapping)
Observation Authority Tagging              ✅ Implemented (4-level hierarchy)
Alias Expansion                            ✅ Implemented (DB-loaded, bidirectional fix pending)
Canonical State Builder                    ✅ Implemented (24 crops, 14 stages, NDVI, soil)
Authoritative Land State Loader            ✅ Implemented (SSOT v2.0.0)
Symbolic Reasoner (fact→rule)              ✅ Implemented (conditions_json evaluation)
Causal Hypothesis Engine                   ✅ Implemented (HypothesisLedger arbitration)
Layered Rule Evaluator                     ✅ Implemented (multi-phase, Condition Ledger)
Confidence Calculator (dual signal)        ✅ Implemented (rule_matching + data_quality)
Diagnosis Conflict Resolution              ✅ Implemented (category priority)
Nutrition Conflict Arbitration             ✅ Implemented (Zn/micronutrient gates)
Unified Decision Gate                      ✅ Implemented (single gate v2.1.0)
Prescription Gate Enforcer                 ✅ Implemented (symbolic-only output)
Decision Readiness Gate                    ✅ Implemented (4 criteria)
ETL Gate                                   ✅ Implemented
Weather Safety Gate                        ✅ Implemented
Safety Guardian (banned substances)        ✅ Implemented
PHI Enforcement                            ✅ Implemented (CIB&RC/FSSAI)
Pollinator Protection                      ✅ Implemented
Deterministic Response Builder             ✅ Implemented (10-section, 50+ fields)
LLM Narration (render-only)                ✅ Implemented (validation gates)
LLM Output Integrity Validation            ✅ Implemented
Delivery Validation                        ✅ Implemented
Explanation Chain Builder                  ✅ Implemented (rule traceability)
Forensic Audit Logger                      ✅ Implemented (full decision trail)
Economic Calculator (ROI/BCR)              ✅ Implemented
Spray Window Calculator                    ✅ Implemented
GDD Phenology Engine                       ✅ Implemented
Photoperiod Calculator                     ✅ Implemented
Irrigation Decision Module                 ✅ Implemented
Farmer Response Contract                   ✅ Implemented (v2.0.0)
Visual Agent (photo analysis)              ✅ Implemented
Multimodal Fusion                          ✅ Implemented
Clarification System                       ✅ Implemented (hypothesis-first)
Translation (DB + LLM fallback)            ⚠️ Partial (111 obs codes missing MR/HI)
Crop Coverage                              ⚠️ Partial (461 SC, 27 CTN, 0 Wheat/Rice)
Rule Firing Success Rate                   ⚠️ Critical Bug (boolean keys block ~200 rules)
Alias Bidirectionality                     ⚠️ Bug (alias→canonical direction missing)
ETL String Handling                        ⚠️ Bug (~54 rules with string etl_range fail)
Offline/PWA Advisory                       ⚠️ Partial (client advisory-builder exists)
Pest Lifecycle Ontology                    ❌ Missing
Regional Rule Overrides                    ❌ Missing
Crop Nutrition Calendar                    ❌ Missing (stage→nutrient schedule)
Monitoring Feedback Loop (field→DB)        ❌ Missing (feedback_status exists but no UI)
Weather API Integration                    ❌ Missing (calculator exists, no live data)
NDVI Live Integration                      ❌ Missing (interpreter exists, no API feed)
Soil Test Report Parsing                   ❌ Missing
Multi-problem Session Tracking             ❌ Missing (single-problem per turn only)
Farmer Learning/History Analytics          ❌ Missing
```

---

## 7. Codebase Risks

### 7.1 Critical Bugs (Blocking Rule Firing)

| Bug | Location | Impact |
|-----|----------|--------|
| Domain-specific boolean keys treated as REQUIRED gates | `loader.ts` catch-all handler | ~200 rules unreachable |
| Alias direction inverted (canonical→alias only) | `loader.ts` alias loading | Farmer observations don't expand to rule codes |
| `etl_range` string values fail matching | `loader.ts` string handler | ~54 rules always fail |
| `matched_responses` count = 0 despite rules loading | `layered-rule-evaluator.ts` observation propagation | All queries fall to INVARIANT_FALLBACK |

### 7.2 Dead / Duplicate Code

| File | Issue |
|------|-------|
| `language-induction-layer.ts` | 749 lines, marked DEPRECATED, only symbol enums used |
| `decision-brain-integration.ts` | Legacy symbolic adapter, largely superseded by `symbolic-reasoner.ts` |
| `decision-graph-bridge.ts` | Legacy bridge with hardcoded chemical lists, parallel path to main evaluator |
| `query-classifier.ts` | Unclear if still used after `query-router.ts` + `intent-classifier.ts` |
| `smart-context-builder.ts` | Possibly superseded by `canonical-state-builder.ts` |
| `product-recommender.ts` | Possibly superseded by `product-repository.ts` |
| `training-pipeline.ts` | No evidence of active use |
| `src/decision-graph/advisory-builder.ts` | Client-side duplicate of server-side response builder |
| `src/decision-graph/confidence-engine.ts` | Client duplicate of `confidence-calculator.ts` |
| `src/decision-graph/conflict-resolver.ts` | Client duplicate of `diagnosis-conflict-resolver.ts` |

### 7.3 Architectural Risks

- **Orchestrator at 8,905 lines**: Monolithic, high coupling risk, difficult to test
- **3 parallel rule evaluation paths**: `symbolic-reasoner.ts`, `layered-rule-evaluator.ts`, and `decision-graph-bridge.ts` all evaluate rules with different logic
- **Multiple response generators**: `deterministic-response-builder.ts`, `llm-response-formatter.ts`, `llm-response-generator.ts`, `response-generator.ts` — 4 modules with overlapping responsibility

### 7.4 Data Debt

| Issue | Count |
|-------|-------|
| Missing MR/HI translations | 111 observation codes |
| Sugarcane-only rules | 461 of 524 (88%) |
| Rules with missing `active_ingredient` | ~221 RECOMMEND rules |
| Rules using generic `STAGE_GENERAL` condition | ~99% |

---

## 8. Required Upgrades for 2030-Ready System

| Priority | Module | Required Change | Reason |
|----------|--------|-----------------|--------|
| P0 | `loader.ts` | Move domain-specific boolean keys to CATEGORY_G (INFORMATIONAL) | Root cause of "Continue monitoring" fallback |
| P0 | `loader.ts` | Fix alias bidirectionality | Farmer observations don't resolve to rule codes |
| P0 | `loader.ts` | Handle `etl_range` string as informational | 54 rules silently fail |
| P0 | `layered-rule-evaluator.ts` | Fix observation propagation to `visual_symptoms` | Observations never reach rule evaluator |
| P1 | `decision_rules` DB | Backfill `active_ingredient` for 221 RECOMMEND rules | Dosage sections empty |
| P1 | `observation_translations` DB | Add 111 missing MR/HI translations | Raw codes leak to UI |
| P1 | `decision_rules` DB | Create rules for Wheat, Rice, Soybean, Maize | Near-zero coverage |
| P2 | New: `pest-lifecycle-ontology.ts` | Pest lifecycle stage mapping (egg→larva→pupa→adult) | Timing-specific treatment |
| P2 | New: `crop-nutrition-calendar.ts` | Stage-specific nutrient schedule database | Proactive nutrition advisory |
| P2 | New: `weather-api-integration.ts` | Connect spray-window-calculator to live weather API | Real-time spray advice |
| P2 | New: `monitoring-feedback-ui.tsx` | UI for farmer to report treatment outcomes | Close the feedback loop |
| P3 | `orchestrator.ts` | Refactor into smaller pipeline modules (< 2000 lines each) | Maintainability |
| P3 | Consolidate response generators | Merge 4 response modules into 2 (structured + narration) | Reduce duplication |
| P3 | New: `multi-problem-tracker.ts` | Track multiple concurrent crop issues per session | Real-world farming |
| P3 | New: `regional-rule-override.ts` | District/taluka-level rule modifications | Local agronomic adaptation |

---

## Deterministic Integrity Verdict

| Check | Status |
|-------|--------|
| LLM cannot generate recommendations | ✅ Enforced (4 validation gates) |
| Rule engine is single source of truth | ✅ Enforced (symbolic brain architecture) |
| Dosage values always from database | ✅ Enforced (deterministic-response-builder maps `dosage_per_acre`) |
| Product names cannot be hallucinated | ✅ Enforced (`validateLLMOutputIntegrity` blocks unauthorized products) |
| All advice traceable to rule_id | ✅ Enforced (explanation-chain-builder + audit-logger) |
| Rules actually fire for valid queries | ❌ FAILING (boolean key / alias / etl bugs block ~200 rules) |

**Bottom line**: The architecture is sound and comprehensive. The deterministic integrity contract is well-designed. The critical failure is in the **rule matching layer** (`loader.ts`), where domain-specific `conditions_json` keys block valid rules from firing, causing the entire system to default to "Continue monitoring" regardless of query quality.

