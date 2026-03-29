CREATE POLICY "Allow insert proactive_rules" ON proactive_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update proactive_rules" ON proactive_rules FOR UPDATE USING (true);