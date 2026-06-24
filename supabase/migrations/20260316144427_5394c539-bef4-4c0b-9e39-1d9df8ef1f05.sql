-- Delete all 1383 legacy cache rows from weather_alerts
-- These are orphaned weather cache entries (event_type='cache') from Sept-Dec 2025
-- No code in the codebase reads these rows
DELETE FROM weather_alerts WHERE event_type = 'cache';