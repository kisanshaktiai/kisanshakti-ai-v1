update public.decision_rules
set cultivation_method_applicable = array['transplanted']::text[]
where rule_id in ('RICE_NUTR_N_TOP1_001','RICE_NUTR_N_TOP2_001')
  and cultivation_method_applicable = array['any']::text[];