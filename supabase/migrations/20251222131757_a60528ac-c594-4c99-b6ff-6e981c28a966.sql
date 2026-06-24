-- Crop-group rules mapping (DB-driven rule selection)
CREATE TABLE decision_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT UNIQUE NOT NULL,
  crop_group TEXT NOT NULL,
  crop_code TEXT,
  category TEXT NOT NULL,
  stage_applicable TEXT[] NOT NULL,
  conditions_json JSONB NOT NULL,
  cause TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority >= 1 AND priority <= 10),
  scientific_source TEXT,
  icar_package TEXT,
  is_active BOOLEAN DEFAULT true,
  version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decision_rules_crop_group ON decision_rules(crop_group);
CREATE INDEX idx_decision_rules_crop_code ON decision_rules(crop_code);
CREATE INDEX idx_decision_rules_category ON decision_rules(category);
CREATE INDEX idx_decision_rules_active ON decision_rules(is_active) WHERE is_active = true;

-- Advisory audit log (complete lineage)
CREATE TABLE advisory_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisory_id TEXT UNIQUE NOT NULL,
  farmer_id UUID REFERENCES farmers(id) ON DELETE SET NULL,
  land_id UUID REFERENCES lands(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  input_snapshot JSONB NOT NULL,
  causes TEXT[] NOT NULL,
  actions JSONB NOT NULL,
  risk_level TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  rules_applied TEXT[] NOT NULL,
  reasoning_trace TEXT[],
  engine_version TEXT NOT NULL,
  execution_time_ms INTEGER,
  ai_adjustments JSONB,
  feedback_status TEXT,
  feedback_at TIMESTAMPTZ,
  farmer_rating INTEGER CHECK (farmer_rating >= 1 AND farmer_rating <= 5),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_offline BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ
);

CREATE INDEX idx_advisory_audit_farmer ON advisory_audit_log(farmer_id);
CREATE INDEX idx_advisory_audit_tenant ON advisory_audit_log(tenant_id);
CREATE INDEX idx_advisory_audit_land ON advisory_audit_log(land_id);
CREATE INDEX idx_advisory_audit_date ON advisory_audit_log(generated_at);
CREATE INDEX idx_advisory_audit_risk ON advisory_audit_log(risk_level);

-- Field feedback tracking
CREATE TABLE advisory_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisory_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  farmer_id UUID REFERENCES farmers(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('done', 'partial', 'skipped', 'deferred')),
  reason TEXT,
  actual_input_used JSONB,
  cost_incurred NUMERIC(10,2),
  effectiveness_rating INTEGER CHECK (effectiveness_rating >= 1 AND effectiveness_rating <= 5),
  notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  recorded_by UUID,
  recorded_offline BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ
);

CREATE INDEX idx_advisory_feedback_advisory ON advisory_feedback(advisory_id);
CREATE INDEX idx_advisory_feedback_farmer ON advisory_feedback(farmer_id);
CREATE INDEX idx_advisory_feedback_status ON advisory_feedback(status);
CREATE INDEX idx_advisory_feedback_date ON advisory_feedback(recorded_at);

-- Enable RLS
ALTER TABLE decision_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisory_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisory_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies for decision_rules (read-only for all authenticated, write for admins)
CREATE POLICY "Anyone can read active decision rules"
ON decision_rules FOR SELECT
USING (is_active = true);

-- RLS Policies for advisory_audit_log
CREATE POLICY "Users can view their tenant advisory logs"
ON advisory_audit_log FOR SELECT
USING (tenant_id IN (
  SELECT tenant_id FROM farmers WHERE id = auth.uid()
));

CREATE POLICY "Users can insert advisory logs for their tenant"
ON advisory_audit_log FOR INSERT
WITH CHECK (tenant_id IN (
  SELECT tenant_id FROM farmers WHERE id = auth.uid()
));

CREATE POLICY "Users can update their own advisory logs"
ON advisory_audit_log FOR UPDATE
USING (farmer_id = auth.uid());

-- RLS Policies for advisory_feedback
CREATE POLICY "Users can view their tenant feedback"
ON advisory_feedback FOR SELECT
USING (tenant_id IN (
  SELECT tenant_id FROM farmers WHERE id = auth.uid()
));

CREATE POLICY "Users can insert feedback for their tenant"
ON advisory_feedback FOR INSERT
WITH CHECK (tenant_id IN (
  SELECT tenant_id FROM farmers WHERE id = auth.uid()
));

CREATE POLICY "Users can update their own feedback"
ON advisory_feedback FOR UPDATE
USING (farmer_id = auth.uid());

-- Trigger to update updated_at on decision_rules
CREATE TRIGGER update_decision_rules_updated_at
BEFORE UPDATE ON decision_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();