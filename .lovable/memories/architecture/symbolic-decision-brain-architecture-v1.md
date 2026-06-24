# Memory: architecture/symbolic-decision-brain-architecture-v1

## Core Principle: "Rules are Supreme, AI Only Explains"

The AI Chat system implements a strict Symbolic Agricultural Decision Brain where:
- **NLU extracts ONLY observations** (exact farmer words, urgency, confidence)
- **Rule Engine makes ALL decisions** (actions, products, dosages, timing)
- **LLM ONLY renders decisions** (translate, format, add empathy - no invention)

## Architecture Components

### 1. Decision Representation Schema (`decision-representation.ts`)
- `NLUDecisionGraphInput`: Strict schema for NLU output (observations only)
- `SymbolicDecisionOutput`: All decisions from Rule Engine
- `validateNLUOutputContract()`: Blocks forbidden fields (pest_code, product, etc.)
- `validateLLMOutputIntegrity()`: Ensures LLM didn't add unauthorized content

### 2. NLU Agent Changes (`nlu-agent.ts`)
- Removed AI-generated `response_strategy`, `clarification_type`, `clarification_options`
- AI now outputs only: `intent_label`, `observations`, `confidence`, `missing_inputs`, `safety_flags`
- Pest/disease codes removed from NLU - Rule Engine does diagnosis

### 3. Orchestrator Changes (`orchestrator.ts`)
- Phase 0.4B: GENERAL_INFO now goes through symbolic path (not LLM bypass)
- All queries routed through Rule Engine for deterministic decisions
- Clarification options come from database, not AI generation

### 4. LLM Formatter Changes (`llm-response-formatter.ts`)
- Added INPUT validation gate (blocks if symbolic input invalid)
- Added OUTPUT validation gate (blocks if LLM added products/dosages)
- `validateLLMOutput()`: Checks for unauthorized pesticides, percentage claims
- Falls back to template if validation fails

### 5. Source Validation Gate (`index.ts`)
- Final check before response delivery
- Ensures every product/dosage in response matches symbolic output
- Uses `validateLLMOutputIntegrity()` from decision-representation

### 6. Audit Logger (`audit-logger.ts`)
- Extended with `RuleEngineAudit` and `LLMFormatterAudit` trails
- Captures NLU → Rules → LLM comparison
- Logs validation violations for forensic analysis

## Key Validation Gates

1. **NLU Contract Gate**: No pest_code, disease_code, product_name in NLU output
2. **Input Validation Gate**: Symbolic decision has valid structure before LLM
3. **Output Validation Gate**: LLM response matches symbolic products/dosages
4. **Source Validation Gate**: Final check in index.ts before delivery

## Determinism Guarantee

Given same inputs, system produces same outputs because:
- NLU extracts observations deterministically
- Rule Engine fires rules based on fixed conditions
- LLM is constrained to render-only mode
- All randomness eliminated from decision path

## Forbidden in NLU Output

❌ pest_code, disease_code, crop_code
❌ response_strategy (Rule Engine decides)
❌ clarification_type (Rule Engine decides)
❌ clarification_options (from database only)
❌ product names, dosages, recommendations
❌ percentage claims (80% effective, etc.)
