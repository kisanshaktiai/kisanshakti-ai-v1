
-- Backfill weather_observations.land_id using proximity matching
-- Match observations to nearest land based on metadata location_key vs land GPS coordinates
UPDATE weather_observations wo
SET land_id = closest.land_id
FROM (
  SELECT DISTINCT ON (wo2.id) wo2.id as obs_id, l.id as land_id
  FROM weather_observations wo2
  CROSS JOIN lands l
  WHERE wo2.land_id IS NULL
    AND l.center_lat IS NOT NULL
    AND l.center_lon IS NOT NULL
    AND l.is_active = true
    AND l.deleted_at IS NULL
    AND wo2.metadata->>'location_key' IS NOT NULL
    AND ABS(
      CAST(split_part(wo2.metadata->>'location_key', ',', 1) AS NUMERIC) - CAST(l.center_lat AS NUMERIC)
    ) < 0.15
    AND ABS(
      CAST(split_part(wo2.metadata->>'location_key', ',', 2) AS NUMERIC) - CAST(l.center_lon AS NUMERIC)
    ) < 0.15
  ORDER BY wo2.id,
    SQRT(
      POWER(CAST(split_part(wo2.metadata->>'location_key', ',', 1) AS NUMERIC) - CAST(l.center_lat AS NUMERIC), 2) +
      POWER(CAST(split_part(wo2.metadata->>'location_key', ',', 2) AS NUMERIC) - CAST(l.center_lon AS NUMERIC), 2)
    )
) closest
WHERE wo.id = closest.obs_id;
