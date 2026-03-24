-- Grant permissions for new tables
GRANT SELECT ON public.crop_baseline_guidelines_v2 TO anon, authenticated;
GRANT SELECT ON public.crop_synonyms TO anon, authenticated;

-- Insert crop baseline guidelines data
INSERT INTO public.crop_baseline_guidelines_v2 (crop_code, growth_stage, das_start, das_end, nitrogen_min, nitrogen_max, nitrogen_optimal, phosphorus_min, phosphorus_max, phosphorus_optimal, potassium_min, potassium_max, potassium_optimal, sulphur_optimal, zinc_optimal, iron_optimal, irrigation_interval_days, water_requirement_mm, critical_moisture_percent, soil_ph_min, soil_ph_max, soil_ec_max, notes, source_reference) VALUES
('SUGARCANE', 'GERMINATION', 0, 35, 0, 0, 0, 60, 80, 75, 40, 60, 50, 30, 5, 0, 7, 50, 60, 6.0, 8.0, 1.5, 'No nitrogen at planting. Full P and 50% K as basal.', 'ICAR-SBI Coimbatore 2023'),
('SUGARCANE', 'TILLERING', 36, 100, 75, 100, 87.5, 0, 0, 0, 25, 35, 30, 0, 2.5, 0, 10, 60, 55, 6.0, 8.0, 1.5, 'First N dose (1/3 total). Earthing up at 90 DAS.', 'ICAR-SBI; VSI Pune'),
('SUGARCANE', 'GRAND_GROWTH', 101, 270, 150, 200, 175, 0, 0, 0, 50, 70, 60, 15, 2.5, 0, 12, 80, 50, 6.0, 8.0, 1.5, 'Remaining N in 2 splits. Max water requirement.', 'ICAR-SBI; MH Sugarcane Package'),
('SUGARCANE', 'MATURATION', 271, 360, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 21, 30, 45, 6.0, 8.0, 1.5, 'Withhold irrigation 3 weeks before harvest.', 'ICAR-SBI; Sugar Directorate'),
('SUGARCANE', 'RATOON_INITIATION', 0, 30, 50, 75, 62.5, 40, 60, 50, 30, 50, 40, 20, 5, 2.5, 5, 40, 65, 6.0, 8.0, 1.5, 'Stubble shaving, gap filling. Early N for sprouting.', 'ICAR-SBI Ratoon Guide 2022'),
('COTTON', 'SEEDLING', 0, 25, 10, 15, 12, 25, 30, 27.5, 12, 18, 15, 10, 2.5, 0, 7, 30, 55, 6.0, 8.0, 1.2, 'Seed treatment essential. FYM 10 t/ha basal.', 'CICR Nagpur 2023'),
('COTTON', 'VEGETATIVE', 26, 55, 30, 40, 35, 0, 0, 0, 15, 20, 17.5, 5, 1.25, 0, 10, 40, 50, 6.0, 8.0, 1.2, 'First top dressing. 60cm spacing.', 'CICR Nagpur'),
('COTTON', 'SQUARING', 56, 75, 40, 50, 45, 0, 0, 0, 15, 20, 17.5, 5, 1.25, 0, 8, 50, 50, 6.0, 8.0, 1.2, 'Second N dose. Critical square retention.', 'CICR Nagpur; SAU Guidelines'),
('COTTON', 'FLOWERING', 76, 105, 20, 30, 25, 0, 0, 0, 8, 12, 10, 5, 0, 0, 7, 55, 55, 6.0, 8.0, 1.2, 'Peak water demand. Reduce N after 90 DAS.', 'CICR Nagpur; NCIPM'),
('COTTON', 'BOLL_DEVELOPMENT', 106, 140, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 45, 50, 6.0, 8.0, 1.2, 'No nitrogen. K for fiber quality.', 'CICR Nagpur'),
('RICE', 'NURSERY', 0, 25, 25, 30, 27.5, 25, 30, 27.5, 25, 30, 27.5, 10, 5, 2.5, 2, 800, 100, 5.5, 7.0, 2.0, 'Wet bed nursery. Seed rate 30 kg/ha.', 'ICAR-IIRR Hyderabad'),
('RICE', 'TRANSPLANTING', 0, 14, 0, 0, 0, 50, 60, 55, 25, 35, 30, 15, 2.5, 0, 2, 50, 100, 5.5, 7.0, 2.0, 'Full P, 50% K, no N at transplanting.', 'ICAR-IIRR'),
('RICE', 'TILLERING', 15, 45, 40, 50, 45, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 60, 100, 5.5, 7.0, 2.0, 'First N top dressing at 21 DAT.', 'ICAR-IIRR Hyderabad'),
('RICE', 'PANICLE_INITIATION', 46, 70, 30, 40, 35, 0, 0, 0, 25, 35, 30, 0, 0, 0, 3, 70, 100, 5.5, 7.0, 2.0, 'Second N + remaining K. Avoid water stress.', 'ICAR-IIRR; TNAU'),
('RICE', 'FLOWERING', 71, 95, 10, 15, 12.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 60, 100, 5.5, 7.0, 2.0, 'Terminal N if needed. BLB/Blast watch.', 'ICAR-IIRR'),
('RICE', 'GRAIN_FILLING', 96, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 40, 80, 5.5, 7.0, 2.0, 'Drain 10 days before harvest.', 'ICAR-IIRR; DRR'),
('WHEAT', 'SOWING', 0, 21, 60, 75, 67.5, 60, 75, 67.5, 40, 50, 45, 20, 5, 0, 21, 40, 50, 6.0, 8.5, 1.8, 'Full P, K, Zn, S and 50% N as basal.', 'ICAR-IIWBR Karnal'),
('WHEAT', 'CRI_STAGE', 22, 42, 30, 40, 35, 0, 0, 0, 0, 0, 0, 0, 0, 0, 21, 50, 55, 6.0, 8.5, 1.8, 'Crown Root Initiation - first critical irrigation.', 'ICAR-IIWBR; SAUs'),
('WHEAT', 'TILLERING', 43, 63, 25, 35, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 21, 50, 55, 6.0, 8.5, 1.8, 'Second irrigation. Final N dose if needed.', 'ICAR-IIWBR Karnal'),
('WHEAT', 'JOINTING', 64, 84, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 21, 55, 60, 6.0, 8.5, 1.8, 'Third irrigation. No N after this stage.', 'ICAR-IIWBR'),
('WHEAT', 'FLOWERING', 85, 105, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15, 60, 65, 6.0, 8.5, 1.8, 'Fourth irrigation critical.', 'ICAR-IIWBR Karnal'),
('WHEAT', 'GRAIN_FILLING', 106, 130, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15, 45, 55, 6.0, 8.5, 1.8, 'Fifth irrigation at milking. Harvest at 14% moisture.', 'ICAR-IIWBR'),
('SOYBEAN', 'GERMINATION', 0, 15, 10, 15, 12.5, 60, 80, 70, 30, 40, 35, 20, 5, 0, 7, 25, 50, 6.0, 7.5, 1.2, 'Inoculate with Bradyrhizobium. Full P, K, S basal.', 'ICAR-IISR Indore'),
('SOYBEAN', 'VEGETATIVE', 16, 35, 10, 15, 12.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 35, 55, 6.0, 7.5, 1.2, 'N fixation begins. Interculture at 20-25 DAS.', 'ICAR-IISR Indore'),
('SOYBEAN', 'FLOWERING', 36, 55, 0, 0, 0, 0, 0, 0, 10, 15, 12.5, 5, 0, 0, 7, 45, 60, 6.0, 7.5, 1.2, 'R1-R2 stage. Water stress reduces pod set.', 'ICAR-IISR; NRCSG'),
('SOYBEAN', 'POD_DEVELOPMENT', 56, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 50, 60, 6.0, 7.5, 1.2, 'R3-R5. Peak water demand. Girdle beetle watch.', 'ICAR-IISR Indore'),
('SOYBEAN', 'MATURATION', 81, 110, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15, 30, 45, 6.0, 7.5, 1.2, 'Withhold irrigation at R7. Harvest at 14% moisture.', 'ICAR-IISR')
ON CONFLICT (crop_code, growth_stage) DO NOTHING;