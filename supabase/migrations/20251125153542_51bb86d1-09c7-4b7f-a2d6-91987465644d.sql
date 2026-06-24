-- Fix RLS policies for weather tables to allow authenticated inserts

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own weather observations" ON weather_observations;
DROP POLICY IF EXISTS "Users can view their own weather aggregates" ON weather_aggregates;
DROP POLICY IF EXISTS "Users can insert their own weather observations" ON weather_observations;
DROP POLICY IF EXISTS "Users can insert their own weather aggregates" ON weather_aggregates;

-- Weather Observations: Allow tenant-scoped access
CREATE POLICY "Tenant users can view weather observations"
ON weather_observations FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM farmers WHERE id = auth.uid()
  )
);

CREATE POLICY "Tenant users can insert weather observations"
ON weather_observations FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM farmers WHERE id = auth.uid()
  )
);

CREATE POLICY "Tenant users can update weather observations"
ON weather_observations FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM farmers WHERE id = auth.uid()
  )
);

-- Weather Aggregates: Allow tenant-scoped access
CREATE POLICY "Tenant users can view weather aggregates"
ON weather_aggregates FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM farmers WHERE id = auth.uid()
  )
);

CREATE POLICY "Tenant users can insert weather aggregates"
ON weather_aggregates FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM farmers WHERE id = auth.uid()
  )
);

CREATE POLICY "Tenant users can update weather aggregates"
ON weather_aggregates FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM farmers WHERE id = auth.uid()
  )
);