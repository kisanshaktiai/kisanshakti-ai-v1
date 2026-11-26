-- ═══════════════════════════════════════════════════════════════════════════
-- 20261126130000_service_catalogue_india_additions.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Service catalogue: services farmers hire outside Maharashtra, and three the
-- product owner asked for by name (motor electrician, solar repair, motor
-- rewinding). Adds 35 services under the 16 existing families and gives two
-- existing services a clearer English label. No family is added and no row is
-- removed or switched off.
--
-- ▶ FLAGGED FOR THE PRODUCT OWNER'S EDIT, like the starter set: codes are
--   permanent once used; labels, order and is_active are free to change.
--
-- Translations live in the app (provider.catalogue.category.<code>); a language
-- without one shows label_en.
--
-- Data only. Safe to run twice: an existing code is left as it is, and a label
-- is changed only while it still reads as the starter set wrote it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. new services ────────────────────────────────────────────────────────
INSERT INTO public.service_categories (code, parent_code, label_en, sort_order) VALUES
  ('PUDDLING', 'LAND_PREP', 'Wet-land puddling (cage wheel, power tiller)', 112),
  ('TERRACING', 'LAND_PREP', 'Terracing and contour bunding', 113),
  ('TREE_FELLING', 'LAND_PREP', 'Tree cutting and stump removal', 114),
  ('ANIMAL_DRAWN_TILLAGE', 'LAND_PREP', 'Bullock and draught-animal ploughing', 115),
  ('SILT_SPREADING', 'LAND_PREP', 'Tank silt and soil carting and spreading', 116),
  ('WET_DIRECT_SEEDING', 'SOWING_PLANTING', 'Wet direct seeding (drum seeder)', 211),
  ('RESIDUE_SEEDING', 'SOWING_PLANTING', 'Sowing into standing residue (happy, super and smart seeder)', 212),
  ('PIT_DIGGING', 'SOWING_PLANTING', 'Pit digging for planting (post-hole digger, auger)', 213),
  ('BOREWELL_PUMP_LIFTING', 'IRRIGATION', 'Borewell pump lifting and lowering', 412),
  ('BOREWELL_RECHARGE', 'IRRIGATION', 'Borewell and open-well recharge structures', 413),
  ('GROUNDWATER_SURVEY', 'IRRIGATION', 'Groundwater survey and water-point location', 414),
  ('FIELD_DEWATERING', 'IRRIGATION', 'Field dewatering and drainage pumping', 415),
  ('CHANNEL_CLEANING', 'IRRIGATION', 'Field channel and canal cleaning', 416),
  ('BIO_INPUT_SUPPLY', 'CROP_PROTECTION', 'Bio-input preparation and supply (natural farming inputs)', 511),
  ('RODENT_STORAGE_PEST', 'CROP_PROTECTION', 'Rodent control and stored-grain fumigation', 512),
  ('LIVESTOCK_PENNING', 'INTERCULTURE', 'Sheep, goat and cattle penning for manure', 610),
  ('PALM_CLIMBING', 'HARVESTING', 'Palm and tall-tree climbing, harvesting and crown care', 710),
  ('TAPPING_CREW', 'HARVESTING', 'Tapping crew (latex, sap and resin)', 711),
  ('STRAW_REAPER', 'RESIDUE', 'Straw reaper (chaff making from stubble)', 805),
  ('DEHUSKING_PULPING', 'POST_HARVEST', 'Dehusking, dehulling and pulping', 911),
  ('CURING_BOILING', 'POST_HARVEST', 'Boiling, curing and polishing', 912),
  ('OIL_EXTRACTION', 'POST_HARVEST', 'Oil extraction (cold-press and expeller)', 913),
  ('JAGGERY_MAKING', 'POST_HARVEST', 'Cane crushing and jaggery making', 914),
  ('FIBRE_EXTRACTION', 'POST_HARVEST', 'Retting and fibre extraction', 915),
  ('PARBOILING_POPPING', 'POST_HARVEST', 'Parboiling, popping and roasting', 916),
  ('ANIMAL_TRANSPORT', 'TRANSPORT', 'Bullock cart and pack-animal transport', 1007),
  ('BOAT_TRANSPORT', 'TRANSPORT', 'Boat transport', 1008),
  ('CROP_GUARDING', 'LABOUR', 'Crop watch and guarding (wild and stray animals)', 1104),
  ('PROTECTIVE_NETTING', 'INFRASTRUCTURE', 'Anti-hail, bird and insect net installation', 1308),
  ('BIOGAS_UNIT', 'INFRASTRUCTURE', 'Biogas plant construction and servicing', 1309),
  ('SHEARING', 'ANIMAL_ALLIED', 'Sheep shearing and wool clipping', 1508),
  ('SERICULTURE_SERVICE', 'ANIMAL_ALLIED', 'Silkworm rearing support (young-age rearing, disinfection)', 1509),
  ('SOLAR_REPAIR', 'REPAIR', 'Solar panel, solar pump and solar fence repair', 1606),
  ('MOTOR_REWINDING', 'REPAIR', 'Motor rewinding (pump and submersible motors)', 1607),
  ('BLACKSMITH_CARPENTRY', 'REPAIR', 'Blacksmith and carpentry (tool sharpening, wooden implements)', 1608)
ON CONFLICT (code) DO NOTHING;

-- ── 2. clearer labels now that rewinding and solar repair stand on their own ─
UPDATE public.service_categories SET label_en = 'Pump set installation and repair', updated_at = now()
 WHERE code = 'PUMP_INSTALL_REPAIR' AND label_en = 'Pump and motor installation, repair and rewinding';
UPDATE public.service_categories SET label_en = 'Farm and pump-motor electrician (starter, panel, cable, wiring)', updated_at = now()
 WHERE code = 'ELECTRICAL_WORK' AND label_en = 'Farm electrical work';

-- Verification (read-only) ────────────────────────────────────────────────────
SELECT 'services added by this file that are present and active' AS check_name, count(*)::text AS actual, '35' AS expected
  FROM public.service_categories c
 WHERE c.is_active AND c.code IN ('PUDDLING', 'TERRACING', 'TREE_FELLING', 'ANIMAL_DRAWN_TILLAGE', 'SILT_SPREADING', 'WET_DIRECT_SEEDING', 'RESIDUE_SEEDING', 'PIT_DIGGING', 'BOREWELL_PUMP_LIFTING', 'BOREWELL_RECHARGE', 'GROUNDWATER_SURVEY', 'FIELD_DEWATERING', 'CHANNEL_CLEANING', 'BIO_INPUT_SUPPLY', 'RODENT_STORAGE_PEST', 'LIVESTOCK_PENNING', 'PALM_CLIMBING', 'TAPPING_CREW', 'STRAW_REAPER', 'DEHUSKING_PULPING', 'CURING_BOILING', 'OIL_EXTRACTION', 'JAGGERY_MAKING', 'FIBRE_EXTRACTION', 'PARBOILING_POPPING', 'ANIMAL_TRANSPORT', 'BOAT_TRANSPORT', 'CROP_GUARDING', 'PROTECTIVE_NETTING', 'BIOGAS_UNIT', 'SHEARING', 'SERICULTURE_SERVICE', 'SOLAR_REPAIR', 'MOTOR_REWINDING', 'BLACKSMITH_CARPENTRY');
SELECT 'services without an active family, or filed under a service' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM public.service_categories c LEFT JOIN public.service_categories p ON p.code = c.parent_code
 WHERE c.parent_code IS NOT NULL AND (p.code IS NULL OR p.parent_code IS NOT NULL OR NOT p.is_active);
SELECT 'families' AS check_name, count(*)::text AS actual, '16' AS expected
  FROM public.service_categories WHERE parent_code IS NULL;
SELECT 'two services share a place in the order within one family' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM (SELECT parent_code, sort_order FROM public.service_categories WHERE parent_code IS NOT NULL
         GROUP BY parent_code, sort_order HAVING count(*) > 1) d;
