-- Create a function to bulk-enable proactive rules (one-time use)
-- This updates decision_rules that have weather-dependent conditions
-- to be evaluated by the proactive engine

-- Use a DO block to perform the update and log results
DO $$
DECLARE
  updated_count integer;
BEGIN
  -- Enable weather-dependent rules as proactive
  UPDATE decision_rules 
  SET is_proactive_rule = true,
      forecast_horizon_days = COALESCE(forecast_horizon_days, 3)
  WHERE is_active = true
    AND confidence_score >= 0.7
    AND conditions_json IS NOT NULL
    AND (
      -- Rules with weather conditions in conditions_json
      conditions_json::text LIKE '%temperature%'
      OR conditions_json::text LIKE '%humidity%'
      OR conditions_json::text LIKE '%rain%'
      OR conditions_json::text LIKE '%wind%'
      OR conditions_json::text LIKE '%frost%'
      OR conditions_json::text LIKE '%soil_moisture%'
      OR conditions_json::text LIKE '%ndvi%'
      OR condition_code = 'WEATHER_TRIGGERED'
      OR condition_code = 'IRRIGATION_TRIGGER'
    )
    AND category IN ('pest', 'disease', 'nutrition', 'irrigation', 'stress', 'weather', 'stage_problems', 'safety', 'ipm', 'soil', 'proactive_monitoring', 'proactive_pest', 'proactive_irrigation', 'physiology');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Enabled % decision_rules as proactive', updated_count;
END $$;