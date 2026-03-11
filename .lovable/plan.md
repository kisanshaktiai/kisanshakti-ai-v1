# KisanShakti AI — Production Readiness Audit
## Status: ✅ APPROVED (2026-03-09)

---

## Production Readiness Scores

| Category | Score |
|----------|-------|
| White-Label Architecture | **8/10** |
| Multi-Tenant SaaS Readiness | **7/10** |
| Overall Production Readiness | **6.5/10** |

---

## Critical Fix Plan (Priority Order)

### P0 — Immediate (This Week)

| # | Fix | Status |
|---|-----|--------|
| 1 | Fix LLM validation gate false positives | ✅ DONE |
| 2 | Replace 6 remaining Chlorpyrifos rules | 🔲 TODO |
| 3 | Delete 39 backup tables | 🔲 TODO |
| 4 | Add composite index on `decision_rules` | 🔲 TODO |

### P1 — Next Sprint

| # | Fix | Status |
|---|-----|--------|
| 5 | Consolidate 7 response builders to 2 | 🔲 TODO |
| 6 | Migrate hardcoded translations to DB | 🔲 TODO |
| 7 | Audit and fix RLS policies (321 warnings) | 🔲 TODO |
| 8 | Remove `_deprecated/` folder | 🔲 TODO |

### P2 — Next Month

| # | Fix | Status |
|---|-----|--------|
| 9 | Split `orchestrator.ts` (8,900 lines) into modules | 🔲 TODO |
| 10 | Implement rule pre-filtering (DB-level) | 🔲 TODO |
| 11 | Add database indexes | 🔲 TODO |
| 12 | Create crop rules for Rice/Wheat | 🔲 TODO |

---

## 2030-Ready Architecture Roadmap

| Phase | Timeline | Focus |
|-------|----------|-------|
| 1 | Q1 | Modularization (split orchestrator into 6 pipeline modules) |
| 2 | Q2 | Scalability (sharding by tenant_id, read replicas, CDN) |
| 3 | Q3-Q4 | AI Evolution (pest ontology, weather API, CV for disease) |
| 4 | 2027+ | Enterprise (quotas, multi-region, compliance export) |

---

## Recent Completions

- ✅ Language-agnostic LLM formatter (removed hardcoded Marathi/Hindi from FORMAT templates)
- ✅ Devanagari numeral normalization in validation gate (9 Indian scripts)
- ✅ Emoji-based section detection (language-neutral anchors: 🎯📋⚠️🙏✅)
- ✅ Soft warnings for transliterated product names (no more false English fallbacks)

---

# Full Codebase Capability Audit — Symbolic Decision Brain

## Audit Status: ✅ COMPLETE (2026-03-08)

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

## 3. Capability Map

```text
SYSTEM CAPABILITY                          STATUS
─────────────────────────────────────────────────────
Language Detection & Normalization         ✅ Implemented
Intent Classification                      ✅ Implemented (LLM v3.0.0 + DB validation)
Observation Extraction                     ✅ Implemented (pattern + LLM + DB mapping)
Observation Authority Tagging              ✅ Implemented (4-level hierarchy)
Alias Expansion                            ✅ Implemented (bidirectional)
Canonical State Builder                    ✅ Implemented (24 crops, 14 stages)
Authoritative Land State Loader            ✅ Implemented (SSOT v2.0.0)
Symbolic Reasoner (fact→rule)              ✅ Implemented
Causal Hypothesis Engine                   ✅ Implemented
Layered Rule Evaluator                     ✅ Implemented (Condition Ledger)
Confidence Calculator (dual signal)        ✅ Implemented
Unified Decision Gate                      ✅ Implemented (v2.1.0)
Safety Guardian (banned substances)        ✅ Implemented
PHI Enforcement                            ✅ Implemented (CIB&RC/FSSAI)
Pollinator Protection                      ✅ Implemented
Deterministic Response Builder             ✅ Implemented (10-section, 50+ fields)
LLM Narration (render-only)                ✅ Implemented (validation gates)
Observation Propagation to Rules           ✅ Fixed (v7.9)
Condition Ledger Fault Tolerance           ✅ Fixed (v7.6)
Stage Gate Relaxation                      ✅ Fixed (v7.8)
Rule Category Routing                      ✅ Fixed (v7.5)
Confidence Gate Override                   ✅ Fixed (v7.4)
Rich Field Propagation                     ✅ Fixed (v7.3)
Translation (DB + LLM fallback)            ⚠️ Partial (111 obs codes missing MR/HI)
Crop Coverage                              ⚠️ Partial (461 SC, 27 CTN, 0 Wheat/Rice)
Offline/PWA Advisory                       ⚠️ Partial
Pest Lifecycle Ontology                    ❌ Missing
Regional Rule Overrides                    ❌ Missing
Crop Nutrition Calendar                    ❌ Missing
Weather API Integration                    ❌ Missing
NDVI Live Integration                      ❌ Missing
Monitoring Feedback Loop                   ❌ Missing
Multi-problem Session Tracking             ❌ Missing
```

---

## 4. Deterministic Integrity Verdict

| Check | Status |
|-------|--------|
| LLM cannot generate recommendations | ✅ Enforced (4 validation gates) |
| Rule engine is single source of truth | ✅ Enforced |
| Dosage values always from database | ✅ Enforced |
| Product names cannot be hallucinated | ✅ Enforced |
| All advice traceable to rule_id | ✅ Enforced |

---

## 5. Required Upgrades (Priority Order)

| Priority | Module | Required Change | Reason |
|----------|--------|-----------------|--------|
| P1 | `decision_rules` DB | Backfill `active_ingredient` for 221 RECOMMEND rules | Dosage sections empty |
| P1 | `observation_translations` DB | Add 111 missing MR/HI translations | Raw codes leak to UI |
| P1 | `decision_rules` DB | Create rules for Wheat, Rice, Soybean, Maize | Near-zero coverage |
| P2 | New: `pest-lifecycle-ontology.ts` | Pest lifecycle stage mapping | Timing-specific treatment |
| P2 | New: `crop-nutrition-calendar.ts` | Stage-specific nutrient schedule | Proactive nutrition advisory |
| P2 | New: `weather-api-integration.ts` | Connect to live weather API | Real-time spray advice |
| P3 | `orchestrator.ts` | Refactor into smaller modules (< 2000 lines each) | Maintainability |
| P3 | Response generators | Consolidate 4 → 2 modules | Reduce duplication |
| P3 | New: `regional-rule-override.ts` | District/taluka-level modifications | Local adaptation |

---

## Previous Pipeline Stability Fixes

### v7.9 — Observation Propagation Fix (2026-03-08)
- Fixed `visual_symptoms` vs `visual_symptom` mismatch in `layered-rule-evaluator.ts`
- Fixed `.toLowerCase()` crash on non-string rule fields in `orchestrator.ts`
- Fixed pipeline health monitor reading wrong field

### v7.8 — Stage Gate Relaxation (2026-03-08)
- Default/generic stages no longer block rule matching
- `crop_stage` condition marked non-blocking for default stages

### v7.6 — Condition Ledger Boolean Gate Fix (2026-03-08)
- 50+ domain-specific boolean keys moved to INFORMATIONAL category
- Unrecognized key catch-all changed from `required: true` to `required: false`
- `etl_range` string values handled as informational

### v7.5 — Rule Category Routing Fix (2026-03-06)
- `ipm`, `stage_problems`, `advisory` categories routed to DIAGNOSIS/PRESCRIPTION phases

### v7.4 — Confidence Gate Override (2026-03-06)
- PrescriptionGate override wired to layered evaluator confidence gate

### v7.3 — Rich Field Propagation Fix (2026-03-06)
- All 50+ rich agronomic fields propagated through DIAGNOSIS/BLOCKED paths
