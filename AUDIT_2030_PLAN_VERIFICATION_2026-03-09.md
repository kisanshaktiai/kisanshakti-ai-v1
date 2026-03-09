# Deep Audit — 2030 Production Readiness Plan Verification
**Date:** 2026-03-09  
**Scope:** Verify `.lovable/plan.md` P0/P1/P2 items against **current repo** + **live Supabase state**.

---

## Executive Verdict
The plan is **partially implemented**: some core fixes are present (indexes, chlorpyrifos removal from active `decision_rules`), but multiple plan items remain **not completed** (39 backup tables still exist, `_deprecated/` still exists, 321 DB linter findings persist, hardcoded language mappings remain in edge code).

---

## Evidence Snapshot (What I checked)
- **Plan file:** `.lovable/plan.md`
- **DB:** `pg_tables`, `pg_indexes`, `pg_proc`, `pg_policies`
- **Repo:** `supabase/functions/ai-agriculture-chat/index.ts`, `.../agents/orchestrator.ts`, `.../agents/llm-response-generator.ts`, `_deprecated/` folder
- **DB linter / security scan:** 321 findings (mostly “Security Definer View”)

---

## P0 — Immediate (This Week)
### P0.1 Fix LLM validation gate false positives — ✅ Likely DONE
- Plan marks **DONE**.
- Repo contains strict narration-only layer with validation gates: `supabase/functions/ai-agriculture-chat/agents/llm-response-generator.ts`.

### P0.2 Replace 6 remaining Chlorpyrifos rules — ✅ Implemented in `decision_rules`
**DB verification:**
- Active rules with `active_ingredient ILIKE '%chlorpyrifos%'`: **0**
- Active rules with `conditions_json` containing chlorpyrifos: **0**

**Note:** Chlorpyrifos still appears in **code references** (e.g., safety lists / validators), which is not the same as “active recommendation rules”.

### P0.3 Delete 39 backup tables — ❌ NOT DONE
**DB verification:**
- Backup tables in `public` with name like `%backup%`: **39** (exactly matches plan item but not deleted)

### P0.4 Add composite index on `decision_rules` — ✅ DONE (and more)
**DB verification:** `pg_indexes` shows multiple composite indexes already, including (examples):
- `idx_decision_rules_active_crop_group (is_active, crop_code, canonical_group) WHERE is_active=true`
- `idx_dr_crop_stage (crop_code, growth_stage) WHERE is_active=true`

**Mismatch:** `.lovable/plan.md` still shows this as TODO, but the DB already has the composite indexes.

---

## P1 — Next Sprint
### P1.5 Consolidate response builders — ⚠️ Partial / Not complete
- `supabase/functions/ai-agriculture-chat/decision/response-generator.ts` is marked **DEPRECATED**, but still exists.
- `orchestrator.ts` still imports legacy direct-answer routing via `canAnswerDirectly/requiresRuleEngine` (implemented as *deprecated compatibility exports* in the narration file).

### P1.6 Migrate hardcoded translations to DB — ❌ NOT DONE (hardcoded mappings still present)
Evidence:
- `supabase/functions/ai-agriculture-chat/index.ts` still contains hardcoded term mappings (e.g., Marathi/Hindi → English) in `normalizeToEnglish()`.
- `forceTranslateResponse()` includes a large hardcoded translation dictionary for headers/labels.

### P1.7 Audit and fix RLS policies (321 warnings) — ❌ NOT DONE
- Supabase linter + security scan both report **321 issues** (dominant class: *Security Definer View*).

### P1.8 Remove `_deprecated/` folder — ❌ NOT DONE
- Folder exists: `src/_deprecated/chat/*`.

---

## P2 — Next Month
### P2.9 Split `orchestrator.ts` into modules — ❌ NOT DONE
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` is still ~8,881 lines.

### P2.10+ Rule pre-filtering / add DB indexes / new crop rules — ⚠️ Mixed
- **Indexes:** already extensive on `decision_rules` (good).
- **Crop coverage:** plan itself reports still weak (e.g., Rice/Wheat rules missing), not verified here beyond plan statement.

---

## Security / Compliance Cross-Check
### Edge Function JWT settings — ⚠️ Mismatch with earlier security report
`supabase/config.toml` currently has:
- `[functions.lands-api] verify_jwt = false`
- `[functions.ai-agriculture-chat] verify_jwt = false`

Both functions enforce `x-tenant-id` / `x-farmer-id` and use Service Role internally, but they are **not JWT-enforced** at the platform level.

### Rate limiting — ✅ Present, but doesn’t match earlier spec
- `ai-agriculture-chat/index.ts` has rate limiting and 429 responses.
- Current config in code: `maxRequests: 20` / 60s window.
- No `X-RateLimit-*` response headers were found.

### RLS status for key tables — ✅ Enabled
**DB verification (RLS enabled + policy counts):**
- `agro_climatic_zones`: RLS enabled, **1 policy**
- `edge_invocation_logs`: RLS enabled, **2 policies**
- `data_retention_config`: RLS enabled, **1 policy**
- `archived_data`: RLS enabled, **1 policy**
- `farmer_consent_log`: RLS enabled, **3 policies**

### SECURITY DEFINER function conversion — ⚠️ Partial mismatch
**DB verification:**
- `calculate_area_km2`, `calculate_evapotranspiration`, `calculate_growing_degree_days`, `check_mobile_number_exists`: `SECURITY DEFINER = false`
- `get_current_farmer_id`, `get_current_tenant_id`: `SECURITY DEFINER = true`

---

## Bottom Line
**Implemented:** chlorpyrifos removed from active `decision_rules`, composite indexes exist, narration-only LLM layer exists, rate limiting exists.

**Not implemented / still pending:** deletion of 39 backup tables, `_deprecated/` removal, translation hardcoding removal, full RLS remediation (321 findings), orchestrator modularization, and at least two “SECURITY DEFINER → INVOKER” conversions.
