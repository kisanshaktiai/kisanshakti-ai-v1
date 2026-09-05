# Crop Schedule Narration Timeout Fix — 2026-09-05

## Root cause
The multilingual narration path split a normal crop schedule into 12-task chunks and processed them sequentially. A 25–30 task schedule therefore required multiple LLM requests, retries, cooldown waits, and JSON responses inside one Supabase Edge Function invocation. The attached edge logs showed provider initialization/calls followed by function shutdown without a useful application exception, consistent with request-time exhaustion.

## Surgical fix
- Increase the narration chunk size to 28 so normal crop schedules use one LLM request.
- Reduce narration output budget to 3,000 tokens.
- Reduce narration budget to 35 seconds.
- Keep deterministic agronomy and the non-English fail-closed invariant unchanged.
- Keep provider fallback and retry behavior bounded.

## Scope
Only `supabase/functions/ai-smart-schedule/generator/narrate.ts` was changed. No database schema, agronomic rule, threshold, product, dose, Decision Brain logic, or RAG logic was changed.
