UPDATE decision_rules SET biological_group = CASE
  WHEN rule_id IN ('RICE_ORG_STEMBORER_IPM_001','RICE_ORG_LEAFFOLDER_IPM_001') THEN 'pest'
  WHEN rule_id IN ('RICE_ORG_SHEATH_BLIGHT_001','RICE_ORG_BLB_001') THEN 'disease'
  WHEN rule_id = 'RICE_ORG_WEED_CONO_001' THEN 'weed_management'
  WHEN rule_id = 'RICE_ORG_LODGING_PREVENT_001' THEN 'stress'
  ELSE 'nutrition'
END
WHERE rule_id LIKE 'RICE_ORG_%' AND (biological_group IS NULL OR biological_group = '');