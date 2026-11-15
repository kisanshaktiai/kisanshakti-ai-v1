// Fixture transcribed from production rows read on 2026-11-15 for live schedule
// 4fa451a0-f237-4a4a-8494-cff72e4a6218 (Rice Indrayani, transplanted, 3.51 acres, Kodoli, sown 2026-05-25,
// transplanted 2026-07-09). A SUBSET: the transplanted stage graph, the variety's agronomy rows, the
// crop seed-rate standard, the nursery irrigation guideline and the six nursery decision rules.
// Rule fields not read from production (priority, flags that do not decide the case) are neutral values.
// `rules(migrated)` returns the rules as they are before (false) or after (true) migration
// 20261115100000_rice_nursery_establishment_sequence.sql.

export const VARIETY = "5af1ba39-875d-4d4d-824c-4cd0b7c8f9e8";

const stage = (id: string, code: string, growth: string, min: number, max: number, ref: string, clock: string, pi: number | null, node = "biological") =>
  ({ id, crop_code: "rice", growth_stage: growth, stage_code: code, das_min: min, das_max: max, das_reference: ref, clock_reference: clock,
     cultivation_method: "transplanted", crop_cycle: "universal", phenology_index: pi, stage_node_type: node, is_active: true,
     boundary_grace_days: null, is_moisture_critical: null, gdd_min: null, gdd_max: null, base_temperature_c: null, kc_coefficient: null });

const STAGES = [
  stage("6bc89c07-ba0a-4435-91b3-4b9d94ceb4b6", "RICE_NURSERY", "nursery", 0, 24, "nursery_sowing", "nursery_sowing", 1.5),
  stage("6b5ce33d-7a4b-4392-9bba-7397ac2c5681", "RICE_LAND_PREPARATION", "land_preparation", 15, 30, "nursery_sowing", "sowing", null, "operational"),
  stage("429f5182-f516-49fb-b1bd-fb1a7068b342", "RICE_TRANSPLANTING", "transplanting", 25, 35, "nursery_sowing", "nursery_sowing", 3, "operational"),
  stage("cbe2a248-7eaa-44a6-96ad-9a34eb11c236", "RICE_TRANSPLANT_ESTABLISHMENT", "transplant_establishment", 0, 9, "transplanting", "transplanting", 3.2),
  stage("33b31c62-8d7b-4d28-adab-c6085b49be9f", "RICE_TP_TILLERING", "tillering", 10, 34, "transplanting", "transplanting", 4),
  stage("1b177f40-aeca-413c-b9bf-f8126461ab11", "RICE_TP_MATURITY", "maturity", 100, 115, "transplanting", "transplanting", 10),
  stage("d18bed3b-3dcc-4a65-b96b-4649b951e440", "RICE_TP_HARVEST", "harvest", 110, 125, "transplanting", "transplanting", 11, "operational"),
];

const rule = (o: Record<string, unknown>) => ({
  crop_code: "rice", action_type: "recommend", priority: 5, phi_days: null, chemical_class: null, scientific_source: "fixture",
  biological_group: null, etl_threshold: null, dosage_per_acre: null, contraindications: null, organic_alternative: null, ipm_level: null,
  crop_age_days_min: null, crop_age_days_max: null, condition_code: null, is_active: true, is_safety_block: false, is_farmer_servable: true,
  schedule_role: null, schedule_stage: null, region_code: "IN-MH", variety_applicable: null, canonical_status: null,
  stage_offset_days_min: null, stage_offset_days_max: null, application_method: null, sequence_after: null,
  trigger_class: "CONTEXT_SCHEDULE", requires_field_action: true, ...o,
});

export function rules(migrated: boolean) {
  return [
    rule({ rule_id: "RICE_NURSERY_SEED_MH_DRAFT_001", category: "management", stage_applicable: ["nursery"], cultivation_method_applicable: ["transplanted"], expert_approved: true,
      action_text: migrated ? "Use certified seed of a variety recommended for your district. Float the seed in water and discard what floats."
                            : "Use certified seed of a variety recommended for your district. Float the seed in water and discard what floats, then sow on a raised bed." }),
    rule({ rule_id: "RICE_MGT_SEED_RATE_TP_MH_001", category: "management", stage_applicable: ["nursery"], cultivation_method_applicable: ["transplanted"], expert_approved: false,
      action_text: "For transplanted paddy in Maharashtra use 30 to 40 kg of seed per hectare, and 20 kg per hectare for hybrid varieties; buy good, pure, healthy, quality seed from the government agency or the agricultural university sales centre." }),
    rule({ rule_id: "RICE_MGT_NURSERY_SOWING_WINDOW_MH_001", category: "management", stage_applicable: ["nursery"], cultivation_method_applicable: ["transplanted"], expert_approved: false,
      sequence_after: migrated ? ["RICE_MGT_SEED_BIOFERT_MH_001"] : null,
      action_text: "In Maharashtra, sow the kharif rice nursery on raised beds between 25 May and 7 July; make the beds 1 metre wide and 15 cm high and as long as needed. A nursery of 10 guntha is enough to plant one hectare." }),
    rule({ rule_id: "RICE_MGT_CHAAR_SUTRI_MH_001", category: "management", stage_applicable: ["nursery", "transplanting"], cultivation_method_applicable: ["transplanted"], expert_approved: false,
      requires_field_action: !migrated,
      action_text: "For four-point (chaar sutri) rice farming in Maharashtra: spread rice husk ash at 0.5 to 1.0 kg per square metre in the nursery and 2 tonnes of rice straw per hectare at the first ploughing; bury 3 tonnes of gliricidia leaves per hectare at puddling; plant improved varieties in controlled paired rows at 15-25 x 15-25 cm; and apply urea-DAP briquettes in a 60:40 proportion at 170 kg per hectare." }),
    rule({ rule_id: "RICE_DISEASE_SEED_TREATMENT_001", category: "disease", trigger_class: "OBSERVATION", schedule_role: "operation", schedule_stage: "nursery",
      stage_applicable: ["nursery"], cultivation_method_applicable: ["any"], expert_approved: true, application_method: "seed_treatment_slurry",
      sequence_after: migrated ? ["RICE_NURSERY_SEED_MH_DRAFT_001", "RICE_MGT_SEED_RATE_TP_MH_001"] : null,
      action_text: "BEFORE SOWING: Treat seed with Tricyclazole 75 WP @ 2 g/kg seed (prevents blast + seed-borne) OR Carbendazim 50 WP @ 2 g/kg seed. ALSO: hot water treatment 25 min @ 52-54°C kills Bakanae+BLB. After treatment, dry seed in shade and sow within 24h. Apply Pseudomonas fluorescens 1% @ 10 g/kg seed for biological + chemical combination." }),
    rule({ rule_id: "RICE_MGT_SEED_BIOFERT_MH_001", category: "organic", stage_applicable: ["nursery"], cultivation_method_applicable: ["any"], expert_approved: false,
      application_method: migrated ? "seed_treatment_biofertilizer" : null,
      sequence_after: migrated ? ["RICE_DISEASE_SEED_TREATMENT_001"] : null,
      action_text: "After the seed dressing, treat paddy seed in Maharashtra with the biofertilizers Azotobacter at 25 g and phosphorus-solubilising bacteria at 25 g per kilogram of seed." }),
  ];
}

export function fixture(migrated: boolean) {
  return {
    tables: {
      crop_stage_master: STAGES,
      variety_phenology_profile: [],
      crop_baseline_guidelines_v2: [{ id: "5a0abc33-dea8-4f30-b9ed-b80d984fb516", crop_code: "rice", growth_stage: "nursery", das_start: 0, das_end: 24, irrigation_interval_days: 2, water_requirement_mm: 40, variety_id: null, stage_master_id: "6bc89c07-ba0a-4435-91b3-4b9d94ceb4b6", source_reference: "ICAR-IIRR Hyderabad; TNAU Agritech paddy water mgmt", notes: null, critical_moisture_percent: null, is_active: true }],
      decision_rules: rules(migrated),
      observation_master: [],
      observation_translations: [],
      variety_cultivation_agronomy: [
        { variety_id: VARIETY, crop_code: "rice", cultivation_method: "transplanted", is_active: true, seed_rate_kg_per_acre_min: 8.1, seed_rate_kg_per_acre_max: 10.1, evidence_tier: "D_unverified", seed_rate_variety_type: "opv_coarse_fine", seed_rate_basis_code: "NURSERY", target_plants_per_m2: null, duration_days_min: 110, duration_days_max: 119, duration_reference: "transplanting", source: "Standard transplanted rice seed rate, medium-duration OPV" },
      ],
      crop_seed_rate_standard: [
        { id: "std-tp-nh", crop_code: "rice", cultivation_method: "transplanted", seed_rate_variety_type: "non_hybrid", region_code: null, seed_rate_kg_per_acre_min: 12.14, seed_rate_kg_per_acre_max: 16.19, seed_rate_basis_code: "NURSERY", seed_rate_rationale: "Improved (non-hybrid) transplanted paddy nursery seed for the whole main field: 30-40 kg/ha.", source: "MPKV Krishi Darshani 2026", evidence_tier: "C_documented_source", review_status: "approved", is_active: true },
      ],
      fertilizer_recommendation_master: [],
      task_type_map: [["management", "advisory"], ["organic", "nutrition"], ["disease", "disease_management"], ["seed_treatment", "seed_treatment"], ["nursery", "nursery"], ["sowing", "sowing"], ["irrigation", "irrigation"], ["monitoring", "monitoring"], ["harvest", "harvest"]].map(([raw_value, canonical]) => ({ raw_value, canonical })),
      master_products: [], labor_rates: [], chemical_regulatory_status: [],
      cultivation_method_master: [{ method_code: "direct_seeded" }, { method_code: "transplanted" }],
    },
    rpc: {},
  };
}

export const INPUTS = {
  cropCode: "rice", cropId: "b8e73e32-d97d-4324-ba60-d3ebb79ff8b7", cropLabel: "Rice", cropLabelLocal: null,
  varietyId: VARIETY, varietyName: "Rice Indrayani", varietyNameLocal: null,
  cultivationMethod: "transplanted", stageClockMethod: "transplanted", cropCycle: "universal",
  landAreaAcres: 3.51, landAreaHa: 1.42044786, state: "Maharashtra", district: "Kolhapur", regionCode: "IN-MH",
  soilFertilityClass: null, soilTestId: null, farmingPolicy: "fertilizer_pesticide",
  sowingDate: "2026-05-25", transplantDate: "2026-07-09", gaps: [] as string[], provenance: {}, language: "en",
};
