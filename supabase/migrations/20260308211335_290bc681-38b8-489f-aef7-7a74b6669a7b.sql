-- P0 Fix #8: Add composite index for rule evaluation performance
CREATE INDEX IF NOT EXISTS idx_decision_rules_crop_active_group 
ON decision_rules(crop_code, is_active, canonical_group);

-- P0 Fix #8b: Index on condition_code for ledger matching
CREATE INDEX IF NOT EXISTS idx_decision_rules_condition_code 
ON decision_rules(condition_code) WHERE is_active = true;