-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124140000_provider_catalogue_lookups.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Provider Workspace, part A, file 1 of 4 — the service catalogue as DATA (D7).
--
-- Every table here is a lookup: a stable code, an English label, a sort order and
-- an is_active switch. No per-language column and nothing crop-specific; the app
-- translates by code (i18n key = <bundle>.<table>.<code>, English label as the
-- fallback). The admin panel can add or switch off rows later with no migration.
--
-- ▶ FLAGGED FOR THE PRODUCT OWNER'S EDIT: every INSERT below is a starter set.
--   Codes are permanent once used; labels, order and is_active are free to change.
--
-- Read access: anyone may read ACTIVE rows (same rule as states/districts/villages).
-- Write access: service role only.  Safe to run twice (IF NOT EXISTS / ON CONFLICT).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. service categories: a two-level tree (family → service) ─────────────
CREATE TABLE IF NOT EXISTS public.service_categories (
  code         text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,47}$'),
  parent_code  text REFERENCES public.service_categories(code) ON UPDATE CASCADE,
  label_en     text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_categories_not_own_parent CHECK (parent_code IS NULL OR parent_code <> code)
);
CREATE INDEX IF NOT EXISTS service_categories_parent_idx ON public.service_categories (parent_code, sort_order);
COMMENT ON TABLE public.service_categories IS
  'Farm service taxonomy. parent_code NULL = family; a row with no children is a leaf and is what a provider offers.';

INSERT INTO public.service_categories (code, parent_code, label_en, sort_order) VALUES
  ('LAND_PREP', NULL, 'Land development and preparation', 100),
  ('PLOUGHING', 'LAND_PREP', 'Ploughing (mould-board, disc or reversible plough)', 101),
  ('ROTAVATOR', 'LAND_PREP', 'Rotavator tillage', 102),
  ('CULTIVATOR_HARROW', 'LAND_PREP', 'Cultivator and harrow tillage', 103),
  ('SUBSOILING', 'LAND_PREP', 'Subsoiling and chiselling', 104),
  ('LASER_LEVELLING', 'LAND_PREP', 'Laser land levelling', 105),
  ('BUND_FORMING', 'LAND_PREP', 'Bund, ridge and furrow forming', 106),
  ('STONE_STUBBLE_CLEARING', 'LAND_PREP', 'Stone, bush and stubble clearing', 107),
  ('EARTHWORK', 'LAND_PREP', 'Earthwork and excavation (backhoe loader, excavator)', 108),
  ('FARM_POND', 'LAND_PREP', 'Farm pond digging and lining', 109),
  ('TRENCHING', 'LAND_PREP', 'Trenching and drainage channels', 110),
  ('FARM_ROAD', 'LAND_PREP', 'Farm road forming', 111),
  ('SOWING_PLANTING', NULL, 'Sowing and planting', 200),
  ('SEED_DRILL', 'SOWING_PLANTING', 'Seed drill and seed-cum-fertiliser drill sowing', 201),
  ('PRECISION_PLANTER', 'SOWING_PLANTING', 'Precision and pneumatic planter sowing', 202),
  ('ZERO_TILL_SOWING', 'SOWING_PLANTING', 'Zero-till and direct seeding', 203),
  ('PADDY_TRANSPLANTER', 'SOWING_PLANTING', 'Mechanical paddy transplanting', 204),
  ('CANE_PLANTER', 'SOWING_PLANTING', 'Sugarcane planting', 205),
  ('TUBER_PLANTER', 'SOWING_PLANTING', 'Tuber and bulb planting', 206),
  ('RAISED_BED', 'SOWING_PLANTING', 'Raised-bed forming', 207),
  ('MULCH_LAYING', 'SOWING_PLANTING', 'Mulch film laying', 208),
  ('MANUAL_TRANSPLANTING', 'SOWING_PLANTING', 'Manual sowing and transplanting crew', 209),
  ('SEED_TREATMENT_SERVICE', 'SOWING_PLANTING', 'Seed treatment service', 210),
  ('NURSERY', NULL, 'Nursery and propagation', 300),
  ('SEEDLING_SUPPLY', 'NURSERY', 'Seedling and sapling supply', 301),
  ('GRAFTING_BUDDING', 'NURSERY', 'Grafting and budding service', 302),
  ('TISSUE_CULTURE_PLANTS', 'NURSERY', 'Tissue-culture plantlet supply', 303),
  ('NURSERY_RAISING', 'NURSERY', 'Custom nursery raising', 304),
  ('IRRIGATION', NULL, 'Irrigation and water', 400),
  ('DRIP_INSTALL', 'IRRIGATION', 'Drip irrigation supply and installation', 401),
  ('SPRINKLER_INSTALL', 'IRRIGATION', 'Sprinkler and rain-gun supply and installation', 402),
  ('MICRO_IRRIGATION_SERVICE', 'IRRIGATION', 'Drip and sprinkler servicing and repair', 403),
  ('PIPELINE_LAYING', 'IRRIGATION', 'Pipeline laying', 404),
  ('BOREWELL_DRILLING', 'IRRIGATION', 'Borewell drilling and flushing', 405),
  ('WELL_WORK', 'IRRIGATION', 'Open-well digging, deepening and desilting', 406),
  ('PUMP_INSTALL_REPAIR', 'IRRIGATION', 'Pump and motor installation, repair and rewinding', 407),
  ('SOLAR_PUMP', 'IRRIGATION', 'Solar pump supply and installation', 408),
  ('FERTIGATION_UNIT', 'IRRIGATION', 'Fertigation and filtration unit installation', 409),
  ('WATER_TANKER', 'IRRIGATION', 'Water tanker supply', 410),
  ('WATER_TESTING', 'IRRIGATION', 'Irrigation water testing', 411),
  ('CROP_PROTECTION', NULL, 'Crop protection and nutrition', 500),
  ('SPRAY_MANUAL', 'CROP_PROTECTION', 'Knapsack and battery sprayer spraying', 501),
  ('SPRAY_POWER', 'CROP_PROTECTION', 'Power and HTP sprayer spraying', 502),
  ('SPRAY_TRACTOR', 'CROP_PROTECTION', 'Tractor-mounted and boom sprayer spraying', 503),
  ('SPRAY_BLOWER', 'CROP_PROTECTION', 'Orchard blower and mist sprayer spraying', 504),
  ('SPRAY_DRONE', 'CROP_PROTECTION', 'Drone spraying', 505),
  ('FERTILISER_APPLICATION', 'CROP_PROTECTION', 'Fertiliser and manure spreading', 506),
  ('FERTIGATION_SERVICE', 'CROP_PROTECTION', 'Fertigation service', 507),
  ('SOIL_TESTING', 'CROP_PROTECTION', 'Soil testing', 508),
  ('TISSUE_TESTING', 'CROP_PROTECTION', 'Leaf and petiole testing', 509),
  ('SCOUTING_IPM', 'CROP_PROTECTION', 'Pest and disease scouting', 510),
  ('INTERCULTURE', NULL, 'Intercultural operations', 600),
  ('WEEDING_MANUAL', 'INTERCULTURE', 'Manual weeding crew', 601),
  ('WEEDING_POWER', 'INTERCULTURE', 'Power weeder and inter-row cultivator', 602),
  ('EARTHING_UP', 'INTERCULTURE', 'Earthing up', 603),
  ('PRUNING_TRAINING', 'INTERCULTURE', 'Pruning and training', 604),
  ('THINNING_DESUCKERING', 'INTERCULTURE', 'Thinning and de-suckering', 605),
  ('DETRASHING', 'INTERCULTURE', 'Detrashing and propping', 606),
  ('FRUIT_BAGGING', 'INTERCULTURE', 'Fruit bagging and bunch care', 607),
  ('STAKING_TRELLIS', 'INTERCULTURE', 'Staking and trellis erection', 608),
  ('POLLINATION', 'INTERCULTURE', 'Pollination service (bee colonies)', 609),
  ('HARVESTING', NULL, 'Harvesting', 700),
  ('HARVEST_CREW', 'HARVESTING', 'Manual harvesting crew', 701),
  ('COMBINE_HARVESTER', 'HARVESTING', 'Combine harvester', 702),
  ('REAPER', 'HARVESTING', 'Reaper and reaper-binder', 703),
  ('CANE_HARVESTER', 'HARVESTING', 'Sugarcane harvester', 704),
  ('CANE_CUTTING_CREW', 'HARVESTING', 'Sugarcane cutting crew', 705),
  ('COTTON_PICKING', 'HARVESTING', 'Cotton picking', 706),
  ('FRUIT_HARVESTING', 'HARVESTING', 'Fruit and vegetable picking crew', 707),
  ('ROOT_DIGGER', 'HARVESTING', 'Root and tuber digger', 708),
  ('FODDER_HARVESTER', 'HARVESTING', 'Fodder and forage harvester', 709),
  ('RESIDUE', NULL, 'Crop residue management', 800),
  ('RESIDUE_BALING', 'RESIDUE', 'Straw and residue baling', 801),
  ('RESIDUE_MULCHER', 'RESIDUE', 'Mulcher and shredder', 802),
  ('RESIDUE_INCORPORATION', 'RESIDUE', 'In-field residue incorporation', 803),
  ('STUBBLE_SHAVER', 'RESIDUE', 'Ratoon and stubble management', 804),
  ('POST_HARVEST', NULL, 'Post-harvest', 900),
  ('THRESHING', 'POST_HARVEST', 'Threshing', 901),
  ('SHELLING_DECORTICATING', 'POST_HARVEST', 'Shelling and decorticating', 902),
  ('CLEANING_GRADING', 'POST_HARVEST', 'Cleaning, grading and sorting', 903),
  ('DRYING', 'POST_HARVEST', 'Drying', 904),
  ('GINNING_PRESSING', 'POST_HARVEST', 'Ginning and pressing', 905),
  ('MILLING_PROCESSING', 'POST_HARVEST', 'Milling and primary processing', 906),
  ('WAXING_PACKING', 'POST_HARVEST', 'Washing, waxing and packing', 907),
  ('RIPENING_CHAMBER', 'POST_HARVEST', 'Ripening chamber', 908),
  ('COLD_STORAGE', 'POST_HARVEST', 'Cold storage', 909),
  ('WAREHOUSING', 'POST_HARVEST', 'Warehousing and godown', 910),
  ('TRANSPORT', NULL, 'Transport and logistics', 1000),
  ('TRACTOR_TRAILER', 'TRANSPORT', 'Tractor and trailer transport', 1001),
  ('PICKUP_TRUCK', 'TRANSPORT', 'Pickup and truck transport', 1002),
  ('REEFER_TRANSPORT', 'TRANSPORT', 'Refrigerated transport', 1003),
  ('BULK_TRANSPORT', 'TRANSPORT', 'Bulk and tanker transport', 1004),
  ('CREW_TRANSPORT', 'TRANSPORT', 'Labour crew transport', 1005),
  ('LOADING_UNLOADING', 'TRANSPORT', 'Loading and unloading crew', 1006),
  ('LABOUR', NULL, 'Labour', 1100),
  ('GENERAL_LABOUR', 'LABOUR', 'General farm labour crew', 1101),
  ('SKILLED_OPERATOR', 'LABOUR', 'Skilled machine operator', 1102),
  ('SPECIALIST_CREW', 'LABOUR', 'Specialist crew', 1103),
  ('MACHINERY_HIRE', NULL, 'Machinery rental and custom hiring', 1200),
  ('TRACTOR_HIRE', 'MACHINERY_HIRE', 'Tractor with implements on hire', 1201),
  ('POWER_TILLER_HIRE', 'MACHINERY_HIRE', 'Power tiller on hire', 1202),
  ('IMPLEMENT_HIRE', 'MACHINERY_HIRE', 'Implement on hire', 1203),
  ('EARTHMOVER_HIRE', 'MACHINERY_HIRE', 'Earthmover on hire', 1204),
  ('GENERATOR_PUMP_HIRE', 'MACHINERY_HIRE', 'Generator and pump set on hire', 1205),
  ('INFRASTRUCTURE', NULL, 'Farm infrastructure', 1300),
  ('POLYHOUSE_SHADENET', 'INFRASTRUCTURE', 'Polyhouse and shade-net erection', 1301),
  ('FENCING', 'INFRASTRUCTURE', 'Fencing including solar fencing', 1302),
  ('VERMICOMPOST_UNIT', 'INFRASTRUCTURE', 'Compost and vermicompost unit', 1303),
  ('ANIMAL_SHED', 'INFRASTRUCTURE', 'Animal shed construction', 1304),
  ('STORAGE_STRUCTURE', 'INFRASTRUCTURE', 'Storage structure construction', 1305),
  ('SOLAR_POWER', 'INFRASTRUCTURE', 'Solar power installation', 1306),
  ('WATER_STRUCTURES', 'INFRASTRUCTURE', 'Check dam and water-harvesting structures', 1307),
  ('SURVEY_ADVISORY', NULL, 'Survey, precision and advisory', 1400),
  ('LAND_MEASUREMENT', 'SURVEY_ADVISORY', 'Land measurement and boundary survey', 1401),
  ('DRONE_SURVEY', 'SURVEY_ADVISORY', 'Drone survey and mapping', 1402),
  ('REMOTE_SENSING_REPORT', 'SURVEY_ADVISORY', 'Remote-sensing crop report', 1403),
  ('AGRONOMY_ADVISORY', 'SURVEY_ADVISORY', 'Agronomy advisory visit', 1404),
  ('FARM_PLANNING', 'SURVEY_ADVISORY', 'Farm and orchard planning', 1405),
  ('CERTIFICATION_SUPPORT', 'SURVEY_ADVISORY', 'Organic and quality certification support', 1406),
  ('DOCUMENT_SUPPORT', 'SURVEY_ADVISORY', 'Scheme, insurance and loan documentation support', 1407),
  ('MARKET_LINKAGE', 'SURVEY_ADVISORY', 'Market linkage and weighment', 1408),
  ('ANIMAL_ALLIED', NULL, 'Animal husbandry and allied', 1500),
  ('VETERINARY', 'ANIMAL_ALLIED', 'Veterinary service', 1501),
  ('ARTIFICIAL_INSEMINATION', 'ANIMAL_ALLIED', 'Artificial insemination', 1502),
  ('FODDER_CHOPPING_BALING', 'ANIMAL_ALLIED', 'Fodder chopping, baling and silage making', 1503),
  ('DAIRY_EQUIPMENT', 'ANIMAL_ALLIED', 'Dairy equipment service', 1504),
  ('POULTRY_SERVICE', 'ANIMAL_ALLIED', 'Poultry service', 1505),
  ('BEEKEEPING_SERVICE', 'ANIMAL_ALLIED', 'Beekeeping service', 1506),
  ('FISHERY_SERVICE', 'ANIMAL_ALLIED', 'Fishery and pond service', 1507),
  ('REPAIR', NULL, 'Repair and maintenance', 1600),
  ('TRACTOR_REPAIR', 'REPAIR', 'Tractor and implement repair', 1601),
  ('WELDING_FABRICATION', 'REPAIR', 'Welding and fabrication', 1602),
  ('ELECTRICAL_WORK', 'REPAIR', 'Farm electrical work', 1603),
  ('SPRAYER_REPAIR', 'REPAIR', 'Sprayer and small-engine repair', 1604),
  ('TYRE_SERVICE', 'REPAIR', 'Tyre and puncture service', 1605)
ON CONFLICT (code) DO NOTHING;

-- ── 2. pricing units ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pricing_units (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,47}$'),
  label_en    text NOT NULL,
  is_per_area   boolean NOT NULL DEFAULT false,
  area_sqm      numeric CHECK (area_sqm IS NULL OR area_sqm > 0),
  is_negotiable boolean NOT NULL DEFAULT false,
  CONSTRAINT pricing_units_area_pair CHECK (is_per_area = (area_sqm IS NOT NULL)),
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pricing_units IS 'How a service is priced. is_per_area units allow an area estimate; area_sqm converts that unit to square metres. is_negotiable units carry no rate.';

INSERT INTO public.pricing_units (code, label_en, is_per_area, area_sqm, is_negotiable, sort_order) VALUES
  ('PER_HOUR', 'Per hour', false, NULL, false, 10),
  ('PER_DAY', 'Per day', false, NULL, false, 20),
  ('PER_ACRE', 'Per acre', true, 4046.8564224, false, 30),
  ('PER_HECTARE', 'Per hectare', true, 10000, false, 40),
  ('PER_GUNTHA', 'Per guntha', true, 101.17141056, false, 50),
  ('PER_QUINTAL', 'Per quintal', false, NULL, false, 60),
  ('PER_TONNE', 'Per tonne', false, NULL, false, 70),
  ('PER_TRIP', 'Per trip', false, NULL, false, 80),
  ('PER_KM', 'Per kilometre', false, NULL, false, 90),
  ('PER_PIECE', 'Per piece', false, NULL, false, 100),
  ('PER_TRAY', 'Per tray', false, NULL, false, 110),
  ('PER_PERSON_DAY', 'Per person per day', false, NULL, false, 120),
  ('PER_METRE', 'Per metre', false, NULL, false, 130),
  ('PER_FOOT', 'Per foot', false, NULL, false, 140),
  ('PER_JOB', 'Per job', false, NULL, false, 150),
  ('NEGOTIABLE', 'Negotiable', false, NULL, true, 900)
ON CONFLICT (code) DO NOTHING;

-- ── 3. equipment types, with the attributes each type may carry ─────────────
CREATE TABLE IF NOT EXISTS public.equipment_types (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,47}$'),
  label_en    text NOT NULL,
  attribute_definitions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attribute_definitions) = 'array'),
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.equipment_types IS 'Kinds of equipment a provider can list. attribute_definitions is a JSON array of {code, label_en, type: number|text|boolean, unit?}; provider_save_equipment() accepts only these attribute codes with these types.';

INSERT INTO public.equipment_types (code, label_en, attribute_definitions, sort_order) VALUES
  ('TRACTOR', 'Tractor', '[{"code":"POWER_HP","label_en":"Power","type":"number","unit":"hp"},{"code":"FOUR_WHEEL_DRIVE","label_en":"Four-wheel drive","type":"boolean"}]'::jsonb, 10),
  ('POWER_TILLER', 'Power tiller', '[{"code":"POWER_HP","label_en":"Power","type":"number","unit":"hp"}]'::jsonb, 20),
  ('TILLAGE_IMPLEMENT', 'Tillage implement', '[{"code":"WORKING_WIDTH_FT","label_en":"Working width","type":"number","unit":"ft"}]'::jsonb, 30),
  ('SEEDER_PLANTER', 'Seed drill or planter', '[{"code":"ROWS","label_en":"Rows","type":"number"}]'::jsonb, 40),
  ('TRANSPLANTER', 'Transplanter', '[{"code":"ROWS","label_en":"Rows","type":"number"}]'::jsonb, 50),
  ('SPRAYER', 'Sprayer', '[{"code":"TANK_LITRES","label_en":"Tank capacity","type":"number","unit":"l"}]'::jsonb, 60),
  ('DRONE', 'Agricultural drone', '[{"code":"TANK_LITRES","label_en":"Tank capacity","type":"number","unit":"l"},{"code":"CERTIFIED_PILOT","label_en":"Certified pilot","type":"boolean"}]'::jsonb, 70),
  ('COMBINE_HARVESTER', 'Combine harvester', '[{"code":"CUTTER_WIDTH_FT","label_en":"Cutter width","type":"number","unit":"ft"}]'::jsonb, 80),
  ('CANE_HARVESTER', 'Sugarcane harvester', '[{"code":"POWER_HP","label_en":"Power","type":"number","unit":"hp"}]'::jsonb, 90),
  ('THRESHER', 'Thresher', '[]'::jsonb, 100),
  ('BALER', 'Baler', '[]'::jsonb, 110),
  ('LASER_LEVELLER', 'Laser leveller', '[]'::jsonb, 120),
  ('EARTHMOVER', 'Earthmover', '[{"code":"POWER_HP","label_en":"Power","type":"number","unit":"hp"}]'::jsonb, 130),
  ('BOREWELL_RIG', 'Borewell rig', '[{"code":"MAX_DEPTH_FT","label_en":"Maximum depth","type":"number","unit":"ft"}]'::jsonb, 140),
  ('PUMP_SET', 'Pump set', '[{"code":"POWER_HP","label_en":"Power","type":"number","unit":"hp"}]'::jsonb, 150),
  ('TRANSPORT_VEHICLE', 'Transport vehicle', '[{"code":"PAYLOAD_TONNES","label_en":"Payload","type":"number","unit":"t"},{"code":"REFRIGERATED","label_en":"Refrigerated","type":"boolean"}]'::jsonb, 160),
  ('TRAILER', 'Trailer', '[{"code":"PAYLOAD_TONNES","label_en":"Payload","type":"number","unit":"t"}]'::jsonb, 170),
  ('OTHER', 'Other equipment', '[]'::jsonb, 900)
ON CONFLICT (code) DO NOTHING;

-- ── 4. provider_types ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_types (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,47}$'),
  label_en    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.provider_types IS 'Who the provider is.';
INSERT INTO public.provider_types (code, label_en, sort_order) VALUES
  ('INDIVIDUAL', 'Individual operator', 10),
  ('BUSINESS', 'Business', 20),
  ('CUSTOM_HIRING_CENTRE', 'Custom hiring centre', 30),
  ('FPO_COOPERATIVE', 'FPO or cooperative', 40),
  ('NURSERY', 'Nursery', 50),
  ('STARTUP', 'Startup', 60),
  ('INSTITUTION', 'Institution', 70)
ON CONFLICT (code) DO NOTHING;

-- ── 5. skill_tiers ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.skill_tiers (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,47}$'),
  label_en    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.skill_tiers IS 'Skill level of a labour crew or operator.';
INSERT INTO public.skill_tiers (code, label_en, sort_order) VALUES
  ('UNSKILLED', 'General', 10),
  ('SEMI_SKILLED', 'Semi-skilled', 20),
  ('SKILLED', 'Skilled', 30),
  ('SPECIALIST', 'Specialist', 40)
ON CONFLICT (code) DO NOTHING;

-- ── 6. nursery_item_kinds ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nursery_item_kinds (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,47}$'),
  label_en    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.nursery_item_kinds IS 'What a nursery sells.';
INSERT INTO public.nursery_item_kinds (code, label_en, sort_order) VALUES
  ('SEEDLING', 'Seedling', 10),
  ('SAPLING', 'Sapling', 20),
  ('GRAFT', 'Grafted plant', 30),
  ('TISSUE_CULTURE', 'Tissue-culture plant', 40),
  ('SETT_CUTTING', 'Sett or cutting', 50),
  ('ROOTSTOCK', 'Rootstock', 60)
ON CONFLICT (code) DO NOTHING;

-- ── 7. provider_payment_methods ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_payment_methods (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,47}$'),
  label_en    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.provider_payment_methods IS 'How a provider accepts payment (named provider_* because a billing table payment_methods already exists). Recorded for information only; the app takes no payment.';
INSERT INTO public.provider_payment_methods (code, label_en, sort_order) VALUES
  ('CASH', 'Cash', 10),
  ('UPI', 'UPI', 20),
  ('BANK_TRANSFER', 'Bank transfer', 30),
  ('CREDIT_AFTER_HARVEST', 'Credit until harvest', 40)
ON CONFLICT (code) DO NOTHING;

-- ── 8. provider_availability_states ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_availability_states (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,47}$'),
  label_en    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.provider_availability_states IS 'The only availability states a farmer ever sees (D13).';
INSERT INTO public.provider_availability_states (code, label_en, sort_order) VALUES
  ('AVAILABLE', 'Available', 10),
  ('BUSY', 'Busy until a date', 20),
  ('NOT_ACCEPTING', 'Not accepting requests', 30),
  ('OFFLINE', 'Offline', 40)
ON CONFLICT (code) DO NOTHING;

-- ── 9. access: read ACTIVE rows, write nothing ─────────────────────────────

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_categories_read_active" ON public.service_categories;
CREATE POLICY "service_categories_read_active" ON public.service_categories FOR SELECT TO anon, authenticated USING (is_active = true);
REVOKE ALL ON public.service_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_categories TO anon, authenticated;
GRANT ALL ON public.service_categories TO service_role;

ALTER TABLE public.pricing_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pricing_units_read_active" ON public.pricing_units;
CREATE POLICY "pricing_units_read_active" ON public.pricing_units FOR SELECT TO anon, authenticated USING (is_active = true);
REVOKE ALL ON public.pricing_units FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pricing_units TO anon, authenticated;
GRANT ALL ON public.pricing_units TO service_role;

ALTER TABLE public.equipment_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_types_read_active" ON public.equipment_types;
CREATE POLICY "equipment_types_read_active" ON public.equipment_types FOR SELECT TO anon, authenticated USING (is_active = true);
REVOKE ALL ON public.equipment_types FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.equipment_types TO anon, authenticated;
GRANT ALL ON public.equipment_types TO service_role;

ALTER TABLE public.provider_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provider_types_read_active" ON public.provider_types;
CREATE POLICY "provider_types_read_active" ON public.provider_types FOR SELECT TO anon, authenticated USING (is_active = true);
REVOKE ALL ON public.provider_types FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.provider_types TO anon, authenticated;
GRANT ALL ON public.provider_types TO service_role;

ALTER TABLE public.skill_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "skill_tiers_read_active" ON public.skill_tiers;
CREATE POLICY "skill_tiers_read_active" ON public.skill_tiers FOR SELECT TO anon, authenticated USING (is_active = true);
REVOKE ALL ON public.skill_tiers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.skill_tiers TO anon, authenticated;
GRANT ALL ON public.skill_tiers TO service_role;

ALTER TABLE public.nursery_item_kinds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nursery_item_kinds_read_active" ON public.nursery_item_kinds;
CREATE POLICY "nursery_item_kinds_read_active" ON public.nursery_item_kinds FOR SELECT TO anon, authenticated USING (is_active = true);
REVOKE ALL ON public.nursery_item_kinds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nursery_item_kinds TO anon, authenticated;
GRANT ALL ON public.nursery_item_kinds TO service_role;

ALTER TABLE public.provider_payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provider_payment_methods_read_active" ON public.provider_payment_methods;
CREATE POLICY "provider_payment_methods_read_active" ON public.provider_payment_methods FOR SELECT TO anon, authenticated USING (is_active = true);
REVOKE ALL ON public.provider_payment_methods FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.provider_payment_methods TO anon, authenticated;
GRANT ALL ON public.provider_payment_methods TO service_role;

ALTER TABLE public.provider_availability_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provider_availability_states_read_active" ON public.provider_availability_states;
CREATE POLICY "provider_availability_states_read_active" ON public.provider_availability_states FOR SELECT TO anon, authenticated USING (is_active = true);
REVOKE ALL ON public.provider_availability_states FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.provider_availability_states TO anon, authenticated;
GRANT ALL ON public.provider_availability_states TO service_role;


-- Verification (read-only) ────────────────────────────────────────────────────
-- "at least": later files add services (20261126130000 adds 35) and this file may be run again after them
SELECT 'catalogue rows: 16 families and at least the 119 starter services' AS check_name,
       ((SELECT count(*) FROM public.service_categories WHERE parent_code IS NULL) = 16
        AND (SELECT count(*) FROM public.service_categories WHERE parent_code IS NOT NULL) >= 119)::text AS actual,
       'true' AS expected;
SELECT 'client write privileges on lookups' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name IN ('service_categories', 'pricing_units', 'equipment_types', 'provider_types', 'skill_tiers', 'nursery_item_kinds', 'provider_payment_methods', 'provider_availability_states')
   AND grantee IN ('anon', 'authenticated', 'PUBLIC') AND privilege_type <> 'SELECT';
