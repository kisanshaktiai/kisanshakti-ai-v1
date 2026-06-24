
-- Create crop_vocabulary table for romanized input semantic enrichment
CREATE TABLE public.crop_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_code TEXT NOT NULL,
  phrase_pattern TEXT NOT NULL,
  semantic_hint TEXT NOT NULL,
  recommended_intent_bias TEXT,
  recommended_observation_bias TEXT,
  language_hint TEXT DEFAULT 'romanized',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crop_vocab_crop ON public.crop_vocabulary(crop_code);
CREATE INDEX idx_crop_vocab_active ON public.crop_vocabulary(is_active) WHERE is_active = TRUE;

ALTER TABLE public.crop_vocabulary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON public.crop_vocabulary FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon read" ON public.crop_vocabulary FOR SELECT TO anon USING (true);

-- Seed sugarcane romanized Marathi vocabulary
INSERT INTO public.crop_vocabulary (crop_code, phrase_pattern, semantic_hint, recommended_intent_bias, recommended_observation_bias, language_hint) VALUES
('SUGARCANE', 'surali valali', 'central whorl drying - dead heart symptom caused by stem borer', 'REPORT_SYMPTOM', 'DEAD_HEART', 'romanized_mr'),
('SUGARCANE', 'khod pokharla', 'stem borer damage - internal tunneling in stem', 'REPORT_SYMPTOM', 'STEM_BORING_MARKS', 'romanized_mr'),
('SUGARCANE', 'pandhrya muli', 'white grub root damage - roots eaten by white grubs', 'REPORT_SYMPTOM', 'ROOT_DAMAGE', 'romanized_mr'),
('SUGARCANE', 'pandhri mashi', 'whitefly infestation on leaves', 'REPORT_SYMPTOM', 'WHITEFLY_INFESTATION', 'romanized_mr'),
('SUGARCANE', 'tambda sadha', 'red rot disease - reddening of internal stem tissue', 'REPORT_SYMPTOM', 'RED_ROT_SYMPTOMS', 'romanized_mr'),
('SUGARCANE', 'paan pivlat', 'leaf yellowing - possible nutrient deficiency or disease', 'REPORT_SYMPTOM', 'LEAF_YELLOWING', 'romanized_mr'),
('SUGARCANE', 'paan sukhat', 'leaf drying - water stress or disease progression', 'REPORT_SYMPTOM', 'LEAF_DRYING', 'romanized_mr'),
('SUGARCANE', 'kand madhye kida', 'insect inside stem - stem borer larva', 'REPORT_SYMPTOM', 'STEM_BORING_MARKS', 'romanized_mr'),
('SUGARCANE', 'usal khunt zalay', 'germination failure - setts not sprouting', 'REPORT_SYMPTOM', 'GERMINATION_FAILURE', 'romanized_mr'),
('SUGARCANE', 'shepu valay', 'top shoot drying - woolly aphid or top borer damage', 'REPORT_SYMPTOM', 'TOP_SHOOT_DAMAGE', 'romanized_mr');
