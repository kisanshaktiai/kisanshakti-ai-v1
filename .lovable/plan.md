

# Deep Audit Verification — 2030 Production Readiness Plan

## Verification Summary

I've performed a comprehensive audit of the codebase and Supabase database to verify the implementation status of the 2030 Production Readiness Plan. Here are the verified findings:

---

## P0 Immediate Items — Status

| # | Item | Plan Status | Actual Status | Evidence |
|---|------|-------------|---------------|----------|
| 1 | **Fix LLM validation gate false positives** | ✅ DONE | ✅ VERIFIED | `llm-response-generator.ts` has narration-only layer with validation gates; deprecated routing functions return safe defaults |
| 2 | **Replace Chlorpyrifos rules** | 🔲 TODO | ✅ VERIFIED | 0 active RECOMMEND/SPRAY rules with chlorpyrifos as `active_ingredient`; 33 rules mention it in safety/knowledge text (informational only, not recommendations) |
| 3 | **Delete 39 backup tables** | 🔲 TODO | ❌ NOT DONE | 39 backup tables still exist in `public` schema (e.g., `decision_rules_backup_*`) |
| 4 | **Add composite index on decision_rules** | 🔲 TODO | ✅ ALREADY EXISTS | 30 indexes exist including `idx_decision_rules_active_crop_group`, `idx_dr_crop_stage` — plan not updated |

---

## P1 Sprint Items — Status

| # | Item | Plan Status | Actual Status | Evidence |
|---|------|-------------|---------------|----------|
| 5 | **Consolidate 7 response builders to 2** | 🔲 TODO | ⚠️ PARTIAL | `decision/response-generator.ts` still imported by orchestrator; `llm-response-formatter.ts` has deterministic builder fallback; legacy exports remain for backward compatibility |
| 6 | **Migrate hardcoded translations to DB** | 🔲 TODO | ⚠️ PARTIAL | `normalizeToEnglish()` deprecated but still exists (576-582); `forceTranslateResponse()` has 70+ hardcoded section translations (lines 1918-1999) |
| 7 | **Audit and fix RLS policies (321 warnings)** | 🔲 TODO | ❌ NOT DONE | Linter shows 321 issues; Security scan shows critical exposures (farmers table, account_lockouts) |
| 8 | **Remove `_deprecated/` folder** | 🔲 TODO | ❌ NOT DONE | `src/_deprecated/chat/` exists with 8 stub files; NOT imported anywhere (safe to delete) |

---

## P2 Month Items — Status

| # | Item | Actual Status | Evidence |
|---|------|---------------|----------|
| 9 | **Split orchestrator.ts** | ❌ NOT DONE | 8,881 lines; still a monolith |
| 10 | **Rule pre-filtering** | ⚠️ PARTIAL | Indexes exist but full DB-level WHERE crop_code optimization not confirmed in code |
| 11 | **Add database indexes** | ✅ DONE | 30 indexes on `decision_rules` |
| 12 | **Create Rice/Wheat rules** | UNKNOWN | Not verified in this audit |

---

## Security Findings — Critical Exposures

From security scan (`supabase_lov`):

| Finding | Level | Status |
|---------|-------|--------|
| **farmers table public readable** | ERROR | ❌ NOT FIXED — contains mobile, email, Aadhaar |
| **account_lockouts exposed** | ERROR | ❌ NOT FIXED — reveals failed logins, IPs |
| **admin_users insufficient protection** | WARN | ⚠️ RLS enabled but may allow enumeration |

From Supabase linter:
- 11 Security Definer Views (ERROR)
- ~180 Function Search Path Mutable (WARN)
- RLS Disabled on some tables (ERROR)
- Extensions in public schema (WARN)
- Postgres version has security patches available (WARN)

---

## Code Quality Findings

| Area | Status | Details |
|------|--------|---------|
| **Deprecated code in `_deprecated/` folder** | Safe to delete | 8 stub files, no active imports found |
| **Legacy response generator** | Still imported | `orchestrator.ts` line 50-51 imports `ResponseGenerator` |
| **Hardcoded translations** | Exist | `forceTranslateResponse()` has 70+ hardcoded English→Marathi/Hindi mappings |
| **`canAnswerDirectly` / `requiresRuleEngine`** | Deprecated | Functions exist with deprecation warnings, always return safe defaults |

---

## Implementation Plan Based on User Selections

### 1. Archive then Delete 39 Backup Tables
- Create `archive` schema
- Move all `%backup%` tables to archive
- Set retention policy (30 days recommended)
- Then drop from archive

### 2. Hybrid JWT Approach
- Keep `verify_jwt=false` in config.toml
- Implement in-code JWT validation via `getClaims()` for authenticated routes
- Continue header-based auth (`x-tenant-id`, `x-farmer-id`) for tenant isolation
- Add limited public endpoints without JWT for webhooks

### 3. Fix Critical Security Exposures First
- Fix farmers table RLS (restrict to farmer's own data)
- Fix account_lockouts RLS (restrict to admins only)
- Then address 321 linter warnings systematically

---

## Implementation Tasks

### Phase 1: Security (Priority)
1. Add RLS policy to `farmers` table restricting access to own data
2. Add RLS policy to `account_lockouts` restricting to admins
3. Convert SECURITY DEFINER views to SECURITY INVOKER where safe
4. Add `search_path` to functions missing it

### Phase 2: Cleanup
1. Create `archive` schema and move 39 backup tables
2. Delete `src/_deprecated/chat/` folder (8 files)
3. Update `.lovable/plan.md` to reflect actual completed items

### Phase 3: Code Consolidation
1. Remove legacy `ResponseGenerator` import from orchestrator
2. Migrate hardcoded translations from `forceTranslateResponse()` to `observation_translations` table
3. Remove dead code paths for deprecated routing functions

### Phase 4: Hybrid JWT Implementation
1. Create shared JWT validation helper in `_shared/`
2. Update `ai-agriculture-chat` to validate JWT for authenticated routes
3. Keep rate limiting and header validation as secondary controls

---

## Updated Readiness Scores

| Category | Previous | After Fixes |
|----------|----------|-------------|
| Production Readiness | 6.5/10 | → 8.0/10 |
| Security | 5/10 | → 7.5/10 |
| Code Quality | 7/10 | → 8.5/10 |

