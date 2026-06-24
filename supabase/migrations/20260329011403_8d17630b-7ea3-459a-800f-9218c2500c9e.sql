-- RLS SELECT policy for proactive_alerts: farmers can only read their own alerts
CREATE POLICY "Farmers can read own proactive alerts"
  ON proactive_alerts
  FOR SELECT
  TO authenticated
  USING (farmer_id = auth.uid());

-- Allow service role inserts (edge function uses service key already)
CREATE POLICY "Service can insert proactive alerts"
  ON proactive_alerts
  FOR INSERT
  WITH CHECK (true);

-- Allow farmers to update their own alerts (mark seen/acted/dismissed)
CREATE POLICY "Farmers can update own proactive alerts"
  ON proactive_alerts
  FOR UPDATE
  TO authenticated
  USING (farmer_id = auth.uid());

-- RLS for proactive_events
CREATE POLICY "Farmers can read own proactive events"
  ON proactive_events
  FOR SELECT
  TO authenticated
  USING (farmer_id = auth.uid());

CREATE POLICY "Service can insert proactive events"
  ON proactive_events
  FOR INSERT
  WITH CHECK (true);

-- RLS for proactive_evaluation_log (read-only for admins, insert for service)
CREATE POLICY "Service can insert evaluation logs"
  ON proactive_evaluation_log
  FOR INSERT
  WITH CHECK (true);

-- Allow authenticated users to read proactive_rules (public rules)
CREATE POLICY "Authenticated can read proactive rules"
  ON proactive_rules
  FOR SELECT
  TO authenticated
  USING (true);