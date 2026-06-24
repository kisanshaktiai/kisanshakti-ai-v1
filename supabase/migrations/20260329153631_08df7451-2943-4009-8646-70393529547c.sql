-- Enable soil and harvest category rules as proactive
-- Also remove duplicate RLS INSERT policy on proactive_alerts

-- Enable soil rules (21 rules)
UPDATE decision_rules 
SET is_proactive_rule = true,
    forecast_horizon_days = COALESCE(forecast_horizon_days, 3)
WHERE is_active = true
  AND category = 'soil'
  AND is_proactive_rule IS NOT TRUE;

-- Enable harvest rules (13 rules) 
UPDATE decision_rules 
SET is_proactive_rule = true,
    forecast_horizon_days = COALESCE(forecast_horizon_days, 3)
WHERE is_active = true
  AND category = 'harvest'
  AND is_proactive_rule IS NOT TRUE;

-- Remove the duplicate INSERT RLS policy on proactive_alerts
DROP POLICY IF EXISTS "Service insert proactive_alerts" ON proactive_alerts;