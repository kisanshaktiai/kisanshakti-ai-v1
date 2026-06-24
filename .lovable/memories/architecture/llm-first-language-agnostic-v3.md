# Memory: architecture/llm-first-language-agnostic-v3
Updated: 2026-02-07

## Core Architecture: LLM-First Language-Agnostic Design

The AI Chat system implements a strictly **LLM-first** architecture for language understanding. This means:

### ✅ CORRECT Data Flow

```
Farmer Message (ANY language)
        │
        ▼
┌─────────────────────────────┐
│ SEMANTIC EXTRACTOR (LLM)    │  ← Primary
│ - Uses OpenAI/Gemini        │
│ - Understands ANY language  │
│ - Returns: intent_code      │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ INTENT RESOLVER (Database)  │  ← Maps intent → observations
│ - Pure symbolic lookup      │
│ - No language handling      │
│ - Returns: observation_code[]
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ SYMBOLIC DECISION BRAIN     │  ← All decisions
│ - Rule evaluation           │
│ - Confidence gates          │
│ - Treatment authorization   │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ LLM RESPONSE FORMATTER      │  ← Narration only
│ - Translates to farmer's    │
│   detected language         │
│ - NO decisions made here    │
└─────────────────────────────┘
```

### ❌ FORBIDDEN Patterns

1. **No hardcoded keywords in classification:**
   - ❌ `if (message.includes('वाळला')) return 'LEAF_DRYING'`
   - ❌ `const pestKeywords = ['किडा', 'कीड़े', 'pest']`
   - ✅ LLM classifies intent, resolver maps to symptoms

2. **No keyword fallbacks in orchestrator:**
   - ❌ P0 keyword fallback with hardcoded regional words
   - ✅ Use LLM intent_code to trigger diagnosis mode

3. **No language-specific logic in decision brain:**
   - ❌ `if (language === 'mr') ...`
   - ✅ All logic uses canonical English symbols

### Key Files

| File | Role | Language Handling |
|------|------|-------------------|
| `semantic-extractor.ts` | Primary LLM intent extraction | LLM understands any language |
| `intent-classifier.ts` | LLM intent classification | NO keyword fallbacks |
| `intent-resolver.ts` | Database intent → observation mapping | Pure symbolic, no text |
| `language-induction-layer.ts` | DEPRECATED legacy fallback | Should not be extended |

### Why This Matters

1. **Scalability:** Support Tamil, Telugu, Kannada, Bengali, etc. without code changes
2. **Maintainability:** No need to maintain 1000s of keyword variations
3. **Accuracy:** LLM understands context, idioms, misspellings, dialects
4. **Determinism:** Symbolic brain makes all decisions (auditable)

### Fallback Behavior

When LLM fails to classify an intent:
1. Return `UNKNOWN_OBSERVATION` with confidence 0.0
2. Hypothesis evaluator generates clarification options from database
3. Farmer selects a symptom from crop-stage-specific options
4. Selection maps to canonical observation codes
5. Rule engine evaluates and provides recommendation

### Migration Notes (v3.0.0)

- Removed 40+ lines of hardcoded Marathi/Hindi/English keywords from `intent-classifier.ts`
- Replaced P0 keyword fallback in orchestrator with LLM intent-based fallback
- Updated `language-induction-layer.ts` header to mark as deprecated
- All new language understanding must go through `semantic-extractor.ts`
