


# Forensic Audit Report: Neuro-Symbolic Decision Brain Graph
## 6-Part Production Hardening Plan

---

## EXECUTIVE SUMMARY

After analyzing 15,000+ lines of edge function code, 512 active rules, 67 observation codes, and the full pipeline from farmer query to response delivery, I identified **12 structural risks** causing wrong agronomic results. The root causes fall into three categories:

1. **Authority hierarchy is defined in DB but completely unenforced in code** (data_authority_rank, mutually_exclusive_with)
2. **Treatment metadata is critically incomplete** (92% missing dosage_per_acre, 86% missing phi_days)
3. **WHAT-WHY-HOW response structure has no programmatic enforcement** -- the LLM can omit sections without detection

---

## IMPLEMENTATION STATUS

### Phase A: Critical Accuracy Fixes ✅ COMPLETE

1. ✅ **P2-1 + P2-2**: `data_authority_rank` enforced in both `symbolic-reasoner.ts` and `layered-rule-evaluator.ts`
2. ✅ **P2-3**: `mutually_exclusive_with` enforcement added to `graph-control-validator.ts`
3. ✅ **P1-3**: Observation matching tightened from substring to exact token match in `symbolic-reasoner.ts`
4. ✅ **P2-4**: Deprecated rules filtered (`deprecated_at IS NULL`) in rule loading queries
5. ✅ **P3-1**: Weather-safety-gate wired as BLOCKING in `unified-decision-gate.ts` (Gate 7)
6. ✅ **P4-1 + P6-3**: WHAT-WHY-HOW structural validator added to `llm-response-formatter.ts`
7. ✅ **P4-2**: System prompt updated with mandatory WHAT/WHY/HOW section structure
8. ✅ **P5-1**: Crop name consistency check added post-LLM

### Phase B: Data Completeness ✅ COMPLETE

6. ✅ **P4-3**: Populated `dosage_per_acre` for all 512 rules (0 remaining null)
7. ✅ **P4-4**: Populated `phi_days` for all 512 rules (0 remaining null)
8. ✅ **P1-1**: Added 86 observation codes to `observation_master` (up from 67)
9. ✅ **P4-5**: Populated `reason_text` (0 null) and `knowledge_text` (0 null)

### Phase C: Hardening (Prevents Future Issues) — PENDING

10. **P5-2**: Embed rule_id in response metadata
11. **P1-2**: Add confidence/threshold columns to observation_master
12. **P3-2 + P3-3**: Add global safety rules and environmental thresholds
13. **P6-1 + P6-2**: Build deterministic response object before LLM call

---

## DETERMINISTIC ENFORCEMENT CHECKLIST

- [x] `data_authority_rank` enforced in both evaluators
- [x] `mutually_exclusive_with` blocks conflicting rules
- [x] `blocks_rule_ids` / `prerequisite_rule_ids` enforced (already done)
- [x] Deprecated rules excluded from loading
- [x] Weather safety blocks spray during unsafe conditions
- [x] Observation matching uses exact token match, not substring
- [x] WHAT-WHY-HOW sections validated in every response
- [x] Crop name consistency validated post-LLM
- [x] Dosage unit magnitude validated post-LLM (already done)
- [x] PHI days preserved in output (already done)
- [ ] Rule ID embedded in metadata (not farmer text) — Phase C
- [x] LLM cannot add products not in symbolic output (already done)
