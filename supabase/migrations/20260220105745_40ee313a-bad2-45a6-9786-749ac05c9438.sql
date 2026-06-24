
-- ═══════════════════════════════════════════════════════════════════════════
-- CAUSAL HYPOTHESIS ARBITRATION LAYER - DATABASE SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════

-- Table 1: hypothesis_master
CREATE TABLE hypothesis_master (
  hypothesis_id TEXT PRIMARY KEY,
  crop_group TEXT NOT NULL,
  hypothesis_type TEXT NOT NULL CHECK (hypothesis_type IN ('PEST','DISEASE','DEFICIENCY','STRESS','WEED','ENVIRONMENTAL')),
  canonical_group TEXT NOT NULL,
  cause_name_en TEXT NOT NULL,
  cause_name_mr TEXT,
  cause_name_hi TEXT,
  biological_basis TEXT,
  severity_model TEXT DEFAULT 'SIMPLE' CHECK (severity_model IN ('SIMPLE','ETL_BASED','ECONOMIC_MODEL')),
  version TEXT DEFAULT '1.0.0',
  engine_min_version TEXT DEFAULT '1.0.0',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hypothesis_crop ON hypothesis_master(crop_group);
CREATE INDEX idx_hypothesis_type ON hypothesis_master(hypothesis_type);
CREATE INDEX idx_hypothesis_active ON hypothesis_master(is_active) WHERE is_active = TRUE;

-- Table 2: hypothesis_conditions
CREATE TABLE hypothesis_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis_master(hypothesis_id),
  condition_type TEXT NOT NULL CHECK (condition_type IN ('OBSERVATION','DAS_RANGE','STAGE','NDVI_PATTERN','WEATHER','SOIL','BOOLEAN_GATE')),
  condition_key TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('EQUALS','CONTAINS','BETWEEN','GT','LT','GTE','LTE','EXISTS','NOT_EXISTS')),
  value_json JSONB NOT NULL,
  is_required BOOLEAN DEFAULT TRUE,
  is_discriminator BOOLEAN DEFAULT FALSE,
  weight NUMERIC DEFAULT 1.0 CHECK (weight > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hyp_cond_hypothesis ON hypothesis_conditions(hypothesis_id);

-- Table 3: hypothesis_contradictions
CREATE TABLE hypothesis_contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis_master(hypothesis_id),
  contradiction_type TEXT NOT NULL CHECK (contradiction_type IN ('OBSERVATION','STAGE','WEATHER','PATTERN')),
  contradiction_key TEXT NOT NULL,
  contradiction_value TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hyp_contra_hypothesis ON hypothesis_contradictions(hypothesis_id);

-- Table 4: hypothesis_rule_mapping
CREATE TABLE hypothesis_rule_mapping (
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis_master(hypothesis_id),
  rule_id TEXT NOT NULL,
  priority INTEGER DEFAULT 1,
  context_notes TEXT,
  PRIMARY KEY (hypothesis_id, rule_id)
);

CREATE INDEX idx_hyp_rule_ruleid ON hypothesis_rule_mapping(rule_id);

-- Table 5: hypothesis_metrics
CREATE TABLE hypothesis_metrics (
  hypothesis_id TEXT NOT NULL REFERENCES hypothesis_master(hypothesis_id) PRIMARY KEY,
  times_triggered INTEGER DEFAULT 0,
  times_contradicted INTEGER DEFAULT 0,
  times_confirmed INTEGER DEFAULT 0,
  times_eliminated_missing_data INTEGER DEFAULT 0,
  avg_confidence NUMERIC DEFAULT 0,
  last_triggered TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE hypothesis_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_contradictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_rule_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated" ON hypothesis_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON hypothesis_conditions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON hypothesis_contradictions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON hypothesis_rule_mapping FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON hypothesis_metrics FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow anon read" ON hypothesis_master FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON hypothesis_conditions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON hypothesis_contradictions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON hypothesis_rule_mapping FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON hypothesis_metrics FOR SELECT TO anon USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- ADD HYPOTHESIS TRACKING TO ai_decision_log
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ai_decision_log ADD COLUMN IF NOT EXISTS hypothesis_id TEXT;
ALTER TABLE ai_decision_log ADD COLUMN IF NOT EXISTS hypothesis_score NUMERIC;
ALTER TABLE ai_decision_log ADD COLUMN IF NOT EXISTS hypothesis_decision_path TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA: 5 Sugarcane Pilot Hypotheses
-- ═══════════════════════════════════════════════════════════════════════════

-- Master hypotheses
INSERT INTO hypothesis_master (hypothesis_id, crop_group, hypothesis_type, canonical_group, cause_name_en, cause_name_mr, cause_name_hi, biological_basis, severity_model) VALUES
  ('SC_EARLY_SHOOT_BORER', 'SC', 'PEST', '01_pest', 'Early Shoot Borer', 'लवकर खोड किडा', 'अगेती तना छेदक', 'Chilo infuscatellus larvae bore into young shoots causing dead hearts in tillering stage', 'ETL_BASED'),
  ('SC_TOP_BORER', 'SC', 'PEST', '01_pest', 'Top Borer', 'शेंडा पोखरणारी अळी', 'शीर्ष छेदक', 'Scirpophaga excerptalis bores into top internodes causing dead heart in mature cane', 'ETL_BASED'),
  ('SC_WHITEFLY', 'SC', 'PEST', '01_pest', 'Whitefly', 'पांढरी माशी', 'सफेद मक्खी', 'Aleurolobus barodensis feeds on leaf sap causing honeydew and sooty mold', 'SIMPLE'),
  ('SC_RED_ROT', 'SC', 'DISEASE', '02_disease', 'Red Rot', 'तांबेरा रोग', 'लाल सड़न रोग', 'Colletotrichum falcatum causes internal stem rot with red discoloration and white patches', 'ECONOMIC_MODEL'),
  ('SC_NITROGEN_DEFICIENCY', 'SC', 'DEFICIENCY', '03_nutrient', 'Nitrogen Deficiency', 'नायट्रोजन कमतरता', 'नाइट्रोजन की कमी', 'Insufficient nitrogen causes progressive yellowing from older leaves with stunted growth', 'SIMPLE');

-- Conditions for SC_EARLY_SHOOT_BORER (4 conditions, 2 discriminators)
INSERT INTO hypothesis_conditions (hypothesis_id, condition_type, condition_key, operator, value_json, is_required, is_discriminator, weight) VALUES
  ('SC_EARLY_SHOOT_BORER', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "DEAD_HEART"}', true, false, 2.0),
  ('SC_EARLY_SHOOT_BORER', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "BORE_HOLES_IN_STEM"}', false, true, 1.5),
  ('SC_EARLY_SHOOT_BORER', 'STAGE', 'growth_stage', 'CONTAINS', '{"stages": ["tillering", "early_growth", "grand_growth"]}', true, false, 1.0),
  ('SC_EARLY_SHOOT_BORER', 'DAS_RANGE', 'days_since_sowing', 'BETWEEN', '{"min": 30, "max": 150}', false, true, 1.0);

-- Conditions for SC_TOP_BORER (4 conditions)
INSERT INTO hypothesis_conditions (hypothesis_id, condition_type, condition_key, operator, value_json, is_required, is_discriminator, weight) VALUES
  ('SC_TOP_BORER', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "DEAD_HEART"}', true, false, 2.0),
  ('SC_TOP_BORER', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "TOP_SHOOT_DAMAGE"}', false, true, 2.0),
  ('SC_TOP_BORER', 'DAS_RANGE', 'days_since_sowing', 'GT', '{"min": 120}', true, true, 1.5),
  ('SC_TOP_BORER', 'STAGE', 'growth_stage', 'CONTAINS', '{"stages": ["grand_growth", "maturity", "ripening"]}', false, false, 1.0);

-- Conditions for SC_WHITEFLY (3 conditions)
INSERT INTO hypothesis_conditions (hypothesis_id, condition_type, condition_key, operator, value_json, is_required, is_discriminator, weight) VALUES
  ('SC_WHITEFLY', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "WHITEFLY_PRESENT"}', true, true, 2.5),
  ('SC_WHITEFLY', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "HONEYDEW"}', false, true, 1.5),
  ('SC_WHITEFLY', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "SOOTY_MOLD"}', false, false, 1.0);

-- Conditions for SC_RED_ROT (4 conditions)
INSERT INTO hypothesis_conditions (hypothesis_id, condition_type, condition_key, operator, value_json, is_required, is_discriminator, weight) VALUES
  ('SC_RED_ROT', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "RED_DISCOLORATION"}', true, true, 2.5),
  ('SC_RED_ROT', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "STEM_ROT"}', true, true, 2.0),
  ('SC_RED_ROT', 'STAGE', 'growth_stage', 'CONTAINS', '{"stages": ["grand_growth", "maturity", "ripening"]}', true, false, 1.0),
  ('SC_RED_ROT', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "WHITE_PATCHES_IN_STEM"}', false, false, 1.5);

-- Conditions for SC_NITROGEN_DEFICIENCY (4 conditions)
INSERT INTO hypothesis_conditions (hypothesis_id, condition_type, condition_key, operator, value_json, is_required, is_discriminator, weight) VALUES
  ('SC_NITROGEN_DEFICIENCY', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "YELLOWING"}', true, false, 2.0),
  ('SC_NITROGEN_DEFICIENCY', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "STUNTED_GROWTH"}', false, true, 1.5),
  ('SC_NITROGEN_DEFICIENCY', 'SOIL', 'soil_nitrogen', 'EQUALS', '{"value": "LOW"}', false, true, 2.0),
  ('SC_NITROGEN_DEFICIENCY', 'OBSERVATION', 'observation_code', 'CONTAINS', '{"code": "PALE_GREEN_LEAVES"}', false, false, 1.0);

-- Contradictions
INSERT INTO hypothesis_contradictions (hypothesis_id, contradiction_type, contradiction_key, contradiction_value, explanation) VALUES
  ('SC_EARLY_SHOOT_BORER', 'PATTERN', 'damage_pattern', 'UNIFORM_FIELD_DAMAGE', 'Shoot borer damage is typically scattered/patchy, not uniform across field'),
  ('SC_EARLY_SHOOT_BORER', 'STAGE', 'growth_stage', 'maturity', 'Early shoot borer is a tillering-stage pest, not active at maturity'),
  ('SC_TOP_BORER', 'OBSERVATION', 'observation_code', 'ROOT_DAMAGE', 'Top borer attacks aerial parts only, root damage indicates different pest'),
  ('SC_TOP_BORER', 'STAGE', 'growth_stage', 'germination', 'Top borer requires mature cane tissue, cannot occur at germination'),
  ('SC_WHITEFLY', 'OBSERVATION', 'observation_code', 'DEAD_HEART', 'Whitefly is a sap-sucking pest that does not cause dead hearts'),
  ('SC_WHITEFLY', 'OBSERVATION', 'observation_code', 'BORE_HOLES_IN_STEM', 'Whitefly does not bore into stems'),
  ('SC_RED_ROT', 'OBSERVATION', 'observation_code', 'BORE_HOLES', 'Red rot is a fungal disease, bore holes indicate insect pest'),
  ('SC_RED_ROT', 'STAGE', 'growth_stage', 'germination', 'Red rot requires established cane tissue'),
  ('SC_NITROGEN_DEFICIENCY', 'OBSERVATION', 'observation_code', 'BORE_HOLES', 'Bore holes indicate pest damage, not nutrient deficiency'),
  ('SC_NITROGEN_DEFICIENCY', 'OBSERVATION', 'observation_code', 'DEAD_HEART', 'Dead heart indicates borer pest, not nitrogen deficiency');

-- Metrics initialization
INSERT INTO hypothesis_metrics (hypothesis_id) VALUES
  ('SC_EARLY_SHOOT_BORER'),
  ('SC_TOP_BORER'),
  ('SC_WHITEFLY'),
  ('SC_RED_ROT'),
  ('SC_NITROGEN_DEFICIENCY');
