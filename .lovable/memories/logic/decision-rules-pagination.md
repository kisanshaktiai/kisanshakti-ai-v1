---
name: decision_rules loader must paginate
description: PostgREST 1000-row cap silently truncates decision_rules; loader MUST paginate via .range() until a page returns <PAGE rows.
type: constraint
---
`supabase.from('decision_rules').select('*').limit(N)` is capped at ~1000 rows by PostgREST regardless of N. With >1800 active rules, single-shot reads drop valid rules (e.g. RICE_GERMINATION_DIAGNOSTIC_001), producing RULE_DATA_INTEGRITY_ERROR matched_responses=0 and template fallback responses. Always paginate with `.order('rule_id').range(from,to)` in PAGE=1000 chunks. Same pattern already exists for observation_master.
