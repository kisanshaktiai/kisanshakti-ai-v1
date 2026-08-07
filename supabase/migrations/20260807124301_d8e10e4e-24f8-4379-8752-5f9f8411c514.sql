ALTER TABLE public.crop_stage_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultivation_method_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epidemiology_threshold_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_field_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pest_resurgence_risk ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.crop_stage_knowledge TO authenticated;
GRANT SELECT ON public.cultivation_method_master TO authenticated;
GRANT SELECT ON public.epidemiology_threshold_evidence TO authenticated;
GRANT SELECT ON public.weather_field_master TO authenticated;
GRANT SELECT ON public.pest_resurgence_risk TO authenticated;

GRANT ALL ON public.crop_stage_knowledge TO service_role;
GRANT ALL ON public.cultivation_method_master TO service_role;
GRANT ALL ON public.epidemiology_threshold_evidence TO service_role;
GRANT ALL ON public.weather_field_master TO service_role;
GRANT ALL ON public.pest_resurgence_risk TO service_role;

CREATE POLICY read_all ON public.crop_stage_knowledge FOR SELECT TO authenticated USING (true);
CREATE POLICY read_all ON public.cultivation_method_master FOR SELECT TO authenticated USING (true);
CREATE POLICY read_all ON public.epidemiology_threshold_evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY read_all ON public.weather_field_master FOR SELECT TO authenticated USING (true);
CREATE POLICY read_all ON public.pest_resurgence_risk FOR SELECT TO authenticated USING (true);