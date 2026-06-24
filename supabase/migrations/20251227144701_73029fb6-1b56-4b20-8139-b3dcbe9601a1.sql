-- Safety verification log
CREATE TABLE IF NOT EXISTS safety_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID,
  session_id UUID,
  tenant_id UUID REFERENCES tenants(id),
  farmer_id UUID REFERENCES farmers(id),
  
  overall_status TEXT CHECK (overall_status IN ('SAFE', 'SAFE_WITH_CONDITIONS', 'UNSAFE', 'REQUIRES_EXPERT')),
  
  banned_substance_violations JSONB DEFAULT '[]'::jsonb,
  human_safety_issues JSONB DEFAULT '[]'::jsonb,
  food_safety_violations JSONB DEFAULT '[]'::jsonb,
  environmental_concerns JSONB DEFAULT '[]'::jsonb,
  regulatory_issues JSONB DEFAULT '[]'::jsonb,
  
  escalation_triggered BOOLEAN DEFAULT FALSE,
  escalation_type TEXT,
  escalation_reason TEXT,
  
  expert_assigned UUID,
  expert_response_sla_hours INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE safety_verifications ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenants can view own safety verifications" ON safety_verifications
  FOR SELECT USING (tenant_id IN (SELECT id FROM tenants WHERE id = tenant_id));

CREATE POLICY "System can insert safety verifications" ON safety_verifications
  FOR INSERT WITH CHECK (true);

-- Indexes
CREATE INDEX idx_safety_verifications_status ON safety_verifications(overall_status);
CREATE INDEX idx_safety_verifications_escalation ON safety_verifications(escalation_triggered);
CREATE INDEX idx_safety_verifications_tenant ON safety_verifications(tenant_id);
CREATE INDEX idx_safety_verifications_farmer ON safety_verifications(farmer_id);

-- Expert escalation queue
CREATE TABLE IF NOT EXISTS expert_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  decision_id UUID,
  tenant_id UUID REFERENCES tenants(id),
  farmer_id UUID REFERENCES farmers(id),
  
  escalation_level TEXT CHECK (escalation_level IN ('ADVISORY', 'REQUIRED', 'EMERGENCY')),
  escalation_reasons TEXT[],
  urgency TEXT CHECK (urgency IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  
  expert_type TEXT,
  expert_assigned UUID,
  
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED')),
  
  farmer_notified BOOLEAN DEFAULT FALSE,
  expert_response TEXT,
  response_time_minutes INTEGER,
  
  context_data JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE expert_escalations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenants can view own escalations" ON expert_escalations
  FOR SELECT USING (tenant_id IN (SELECT id FROM tenants WHERE id = tenant_id));

CREATE POLICY "System can manage escalations" ON expert_escalations
  FOR ALL WITH CHECK (true);

-- Indexes
CREATE INDEX idx_expert_escalations_status ON expert_escalations(status);
CREATE INDEX idx_expert_escalations_urgency ON expert_escalations(urgency);
CREATE INDEX idx_expert_escalations_tenant ON expert_escalations(tenant_id);

-- Treatment outcomes for feedback learning
CREATE TABLE IF NOT EXISTS treatment_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID,
  session_id UUID,
  tenant_id UUID REFERENCES tenants(id),
  farmer_id UUID REFERENCES farmers(id),
  land_id UUID REFERENCES lands(id),
  
  -- Original prediction
  predicted_pest_disease TEXT,
  prediction_confidence DECIMAL(3,2),
  treatment_recommended TEXT,
  cost_predicted_inr DECIMAL(10,2),
  benefit_predicted_inr DECIMAL(10,2),
  efficacy_predicted_percent DECIMAL(5,2),
  
  -- Farmer implementation
  farmer_implemented BOOLEAN DEFAULT FALSE,
  treatment_applied TEXT,
  application_date TIMESTAMP WITH TIME ZONE,
  cost_actual_inr DECIMAL(10,2),
  followed_instructions BOOLEAN,
  deviations TEXT[],
  
  -- Follow-up results
  day_3_check JSONB,
  day_7_check JSONB,
  day_14_check JSONB,
  
  -- Actual outcome
  final_outcome TEXT CHECK (final_outcome IN ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILURE', 'PENDING')),
  benefit_actual_inr DECIMAL(10,2),
  farmer_satisfaction INTEGER CHECK (farmer_satisfaction BETWEEN 1 AND 5),
  farmer_would_recommend BOOLEAN,
  
  -- Expert validation
  expert_reviewed BOOLEAN DEFAULT FALSE,
  expert_diagnosis_correct BOOLEAN,
  expert_treatment_appropriate BOOLEAN,
  expert_notes TEXT,
  expert_review_date TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE treatment_outcomes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenants can view own treatment outcomes" ON treatment_outcomes
  FOR SELECT USING (tenant_id IN (SELECT id FROM tenants WHERE id = tenant_id));

CREATE POLICY "System can manage treatment outcomes" ON treatment_outcomes
  FOR ALL WITH CHECK (true);

-- Indexes
CREATE INDEX idx_treatment_outcomes_decision ON treatment_outcomes(decision_id);
CREATE INDEX idx_treatment_outcomes_pest ON treatment_outcomes(predicted_pest_disease);
CREATE INDEX idx_treatment_outcomes_outcome ON treatment_outcomes(final_outcome);
CREATE INDEX idx_treatment_outcomes_tenant ON treatment_outcomes(tenant_id);
CREATE INDEX idx_treatment_outcomes_farmer ON treatment_outcomes(farmer_id);

-- Rule performance tracking
CREATE TABLE IF NOT EXISTS rule_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT NOT NULL,
  rule_file TEXT,
  tenant_id UUID REFERENCES tenants(id),
  
  times_fired INTEGER DEFAULT 0,
  times_blocked INTEGER DEFAULT 0,
  successful_outcomes INTEGER DEFAULT 0,
  failed_outcomes INTEGER DEFAULT 0,
  partial_outcomes INTEGER DEFAULT 0,
  
  success_rate DECIMAL(5,2),
  avg_farmer_satisfaction DECIMAL(3,2),
  avg_economic_accuracy DECIMAL(5,2),
  
  success_rate_trend TEXT CHECK (success_rate_trend IN ('IMPROVING', 'STABLE', 'DECLINING')),
  
  last_fired_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(rule_id, tenant_id)
);

-- Enable RLS
ALTER TABLE rule_performance ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenants can view own rule performance" ON rule_performance
  FOR SELECT USING (tenant_id IN (SELECT id FROM tenants WHERE id = tenant_id));

CREATE POLICY "System can manage rule performance" ON rule_performance
  FOR ALL WITH CHECK (true);

-- Indexes
CREATE INDEX idx_rule_performance_rule ON rule_performance(rule_id);
CREATE INDEX idx_rule_performance_success ON rule_performance(success_rate);

-- Learning suggestions from pattern detection
CREATE TABLE IF NOT EXISTS learning_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  
  suggestion_type TEXT CHECK (suggestion_type IN ('NEW_RULE', 'REFINE_RULE', 'DEPRECATE_RULE', 'WEATHER_RULE', 'STAGE_SPECIFIC')),
  category TEXT,
  description TEXT NOT NULL,
  recommendation TEXT,
  
  evidence_count INTEGER DEFAULT 0,
  confidence_score DECIMAL(3,2),
  
  priority TEXT CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEWED', 'APPROVED', 'IMPLEMENTED', 'REJECTED')),
  
  supporting_data JSONB DEFAULT '{}'::jsonb,
  
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  implementation_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE learning_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenants can view own learning suggestions" ON learning_suggestions
  FOR SELECT USING (tenant_id IN (SELECT id FROM tenants WHERE id = tenant_id));

CREATE POLICY "System can manage learning suggestions" ON learning_suggestions
  FOR ALL WITH CHECK (true);

-- Indexes
CREATE INDEX idx_learning_suggestions_type ON learning_suggestions(suggestion_type);
CREATE INDEX idx_learning_suggestions_status ON learning_suggestions(status);
CREATE INDEX idx_learning_suggestions_priority ON learning_suggestions(priority);

-- Orchestrator metrics for monitoring
CREATE TABLE IF NOT EXISTS orchestrator_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  tenant_id UUID REFERENCES tenants(id),
  
  total_processing_time_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  
  phase_timings JSONB DEFAULT '{}'::jsonb,
  agent_performance JSONB DEFAULT '{}'::jsonb,
  
  escalation_triggered BOOLEAN DEFAULT FALSE,
  safety_status TEXT,
  final_confidence DECIMAL(3,2),
  rules_applied_count INTEGER,
  
  error_type TEXT,
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE orchestrator_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenants can view own metrics" ON orchestrator_metrics
  FOR SELECT USING (tenant_id IN (SELECT id FROM tenants WHERE id = tenant_id));

CREATE POLICY "System can insert metrics" ON orchestrator_metrics
  FOR INSERT WITH CHECK (true);

-- Indexes
CREATE INDEX idx_orchestrator_metrics_session ON orchestrator_metrics(session_id);
CREATE INDEX idx_orchestrator_metrics_success ON orchestrator_metrics(success);
CREATE INDEX idx_orchestrator_metrics_created ON orchestrator_metrics(created_at);

-- Update trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_safety_verifications_updated_at
  BEFORE UPDATE ON safety_verifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expert_escalations_updated_at
  BEFORE UPDATE ON expert_escalations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_treatment_outcomes_updated_at
  BEFORE UPDATE ON treatment_outcomes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rule_performance_updated_at
  BEFORE UPDATE ON rule_performance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_suggestions_updated_at
  BEFORE UPDATE ON learning_suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();