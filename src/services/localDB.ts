import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { tenantIsolationService } from './tenantIsolationService';

// ============================================================================
// DATA INTERFACES - Exact mirrors of Supabase tables
// ============================================================================

/**
 * Farmers table - matches Supabase farmers table exactly
 */
export interface FarmerData {
  // Core fields
  id: string;
  tenant_id: string;
  
  // Personal information
  farmer_name: string | null;
  farmer_code: string | null;
  mobile_number: string | null;
  aadhaar_number: string | null;
  shc_id: string | null;
  location: string | null;
  
  // Authentication fields are intentionally excluded from the offline farmer projection.
  // PIN/session credentials are handled only by OfflineAuthService and are never synced here.
  
  // Farming details
  farming_experience_years: number | null;
  farm_type: string | null;
  total_land_acres: number | null;
  primary_crops: string[] | null;
  annual_income_range: string | null;
  has_loan: boolean | null;
  loan_amount: number | null;
  has_tractor: boolean | null;
  has_irrigation: boolean | null;
  irrigation_type: string | null;
  has_storage: boolean | null;
  
  // Multi-tenancy
  associated_tenants: string[] | null;
  preferred_dealer_id: string | null;
  
  // Verification
  is_verified: boolean | null;
  verified_at: string | null;
  verified_by: string | null;
  verification_documents: any;
  
  // App usage
  app_install_date: string | null;
  last_app_open: string | null;
  total_app_opens: number | null;
  total_queries: number | null;
  
  // Preferences
  language_preference: string | null;
  preferred_contact_method: string | null;
  notes: string | null;
  metadata: any;
  
  // Marketplace
  seller_profile: any;
  seller_rating: number | null;
  seller_verified: boolean | null;
  total_sales: number | null;
  store_name: string | null;
  store_description: string | null;
  
  // Subscription
  current_subscription_id: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  
  // Status
  is_active: boolean | null;
  archived: boolean | null;
  
  // User profile reference
  user_profile_id: string | null;
  
  // Timestamps
  created_at: string | null;
  updated_at: string | null;
  
  // Sync metadata (local only)
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

/**
 * Lands table - matches Supabase lands table exactly
 */
export interface LandData {
  // Core fields
  id: string;
  tenant_id: string;
  farmer_id: string;
  name: string;
  
  // Area measurements
  area_acres: number;
  area_guntas: number | null;
  area_sqft: number | null;
  
  // Location
  state: string | null;
  state_id: string | null;
  district: string | null;
  district_id: string | null;
  taluka: string | null;
  taluka_id: string | null;
  village: string | null;
  village_id: string | null;
  survey_number: string | null;
  
  // Boundaries and coordinates
  boundary: any;
  boundary_geom: any;
  boundary_polygon_old: any;
  boundary_method: string | null;
  center_lat: number | null;
  center_lon: number | null;
  center_point_old: any;
  location_coords: any;
  location_context: any;
  
  // GPS data
  gps_accuracy_meters: number | null;
  gps_recorded_at: string | null;
  elevation_meters: number | null;
  slope_percentage: number | null;
  
  // Land characteristics
  ownership_type: string | null;
  land_type: string | null;
  soil_type: string | null;
  
  // Soil health data
  soil_tested: boolean | null;
  last_soil_test_date: string | null;
  soil_ph: number | null;
  organic_carbon_percent: number | null;
  nitrogen_kg_per_ha: number | null;
  phosphorus_kg_per_ha: number | null;
  potassium_kg_per_ha: number | null;
  soil_confidence_level: string | null;
  soil_data_source: string | null;
  
  // Irrigation and water
  water_source: string | null;
  irrigation_source: string | null;
  irrigation_type: string | null;
  
  // Current crop information
  current_crop: string | null;
  current_crop_id: string | null;
  crop_stage: string | null;
  planting_date: string | null;
  cultivation_date: string | null;
  last_sowing_date: string | null;
  harvest_date: string | null;
  expected_harvest_date: string | null;
  
  // Moisture
  current_moisture_status: string | null;
  last_moisture_update: string | null;
  
  // Previous crop
  previous_crop: string | null;
  previous_crop_id: string | null;
  last_crop: string | null;
  last_harvest_date: string | null;
  
  // NDVI data
  ndvi_tested: boolean | null;
  last_ndvi_calculation: string | null;
  last_ndvi_value: number | null;
  ndvi_thumbnail_url: string | null;
  ndvi_geotiff_url: string | null;
  ndvi_status: string | null;
  last_processed_at: string | null;
  
  // Tile mapping
  tile_id: string | null;
  tile_ids: string[] | null;
  mgrs_tile_id: string | null;
  
  // Additional data
  land_documents: any;
  notes: string | null;
  marketplace_enabled: boolean | null;
  
  // Status
  is_active: boolean | null;
  deleted_at: string | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  
  // Sync metadata (local only)
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

/**
 * Crop Schedules table - matches Supabase crop_schedules table exactly
 * UPDATED: Full schema parity with Supabase (2025-12-09)
 */
export interface CropScheduleData {
  // Core fields
  id: string;
  tenant_id: string;
  farmer_id: string;
  land_id: string;
  
  // Crop information
  crop_name: string;
  crop_variety: string | null;
  sowing_date: string;
  expected_harvest_date: string | null;
  
  // Schedule metadata
  schedule_version: number | null;
  generated_at: string | null;
  generation_language: string | null;
  generation_params: any;
  country: string | null;
  
  // Weather integration
  last_weather_update: string | null;
  last_weather_check: string | null;
  weather_data: any;
  weather_auto_update_enabled: boolean | null;
  
  // AI model information
  ai_model: string | null;
  
  // Status
  is_active: boolean | null;
  completed_at: string | null;
  status: string | null;
  
  // Actual outcomes
  actual_harvest_date: string | null;
  actual_profit: number | null;
  actual_total_cost: number | null;
  actual_yield_quintals: number | null;
  outcome_recorded_at: string | null;
  
  // Expected yields and revenue
  expected_gross_revenue: number | null;
  expected_market_price_per_quintal: number | null;
  expected_net_profit: number | null;
  expected_profit: number | null;
  expected_yield_per_acre: number | null;
  expected_yield_quintals: number | null;
  
  // Farm inputs - Fertilizers
  fertilizer_k_kg: number | null;
  fertilizer_n_kg: number | null;
  fertilizer_p_kg: number | null;
  organic_fertilizer_kg: number | null;
  organic_manure_kg: number | null;
  vermicompost_kg: number | null;
  bio_fertilizer_units: number | null;
  
  // Farm inputs - Pesticides/Herbicides
  bio_pesticide_ml: number | null;
  fungicide_gm: number | null;
  herbicide_ml: number | null;
  insecticide_ml: number | null;
  pesticide_requirements: any;
  
  // Farm inputs - Other
  seed_quantity_kg: number | null;
  pgr_hormone_ml: number | null;
  growth_regulators: any;
  organic_input_details: any;
  
  // Water and irrigation
  irrigation_count_total: number | null;
  water_per_irrigation_liters: number | null;
  water_requirement_liters_total: number | null;
  total_water_requirement_liters: number | null;
  
  // Cost breakdown
  cost_by_category: any;
  cost_by_stage: any;
  total_estimated_cost: number | null;
  total_labor_cost: number | null;
  total_material_cost: number | null;
  labor_rate_used: number | null;
  
  // Task tracking
  tasks_completed_count: number | null;
  tasks_on_time_count: number | null;
  tasks_total_count: number | null;
  total_duration_days: number | null;
  stages_covered: any;
  
  // Location context
  agro_climatic_zone: string | null;
  district_name: string | null;
  state_region: string | null;
  taluka_name: string | null;
  regional_dialect_zone: string | null;
  
  // Farming details
  farming_type: string | null;
  calculated_for_area_acres: number | null;
  
  // Suitability and quality
  suitability_score: number | null;
  suitability_warnings: any;
  data_quality_score: number | null;
  schedule_accuracy_score: number | null;
  
  // Yield optimization
  yield_boosting_techniques: any;
  yield_multiplier_target: number | null;
  
  // Product recommendations
  products_recommended_count: number | null;
  recommendation_order: string | null;
  recommended_products: any;
  
  // Training data flags
  is_training_candidate: boolean | null;
  training_batch_id: string | null;
  training_excluded_reason: string | null;
  training_processed: boolean | null;
  
  // Farmer feedback
  farmer_feedback: string | null;
  farmer_rating: number | null;
  
  // Input data snapshots
  input_land_coordinates: any;
  input_soil_data: any;
  input_weather_data: any;
  
  // Intercrop data
  backdated_consent: boolean | null;
  backdated_consent_at: string | null;
  intercrop_name: string | null;
  intercrop_variety: string | null;
  intercrop_sowing_date: string | null;
  intercrop_area_percent: number | null;
  intercrop_2_name: string | null;
  intercrop_2_variety: string | null;
  intercrop_2_sowing_date: string | null;
  intercrop_2_area_percent: number | null;
  intercrop_3_name: string | null;
  intercrop_3_variety: string | null;
  intercrop_3_sowing_date: string | null;
  intercrop_3_area_percent: number | null;
  
  // Additional metadata
  metadata: any;
  
  // Timestamps
  created_at: string | null;
  updated_at: string | null;
  
  // Sync metadata (local only)
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

/**
 * Schedule Tasks table - matches Supabase schedule_tasks table exactly
 * UPDATED: Full schema parity with Supabase (2025-12-09)
 */
export interface ScheduleTaskData {
  // Core fields
  id: string;
  schedule_id: string;
  tenant_id: string;
  farmer_id: string | null;
  
  // Task information
  task_name: string;
  task_type: string;
  task_date: string;
  task_description: string | null;
  
  // Task ordering and stages
  days_from_sowing: number | null;
  sequence_order: number | null;
  stage_key: string | null;
  stage_name: string | null;
  stage_order: number | null;
  
  // Additional task details
  duration_hours: number | null;
  priority: string | null;
  weather_dependent: boolean | null;
  detailed_steps: any;
  
  // Resources and cost
  resources: any;
  estimated_cost: number | null;
  currency: string | null;
  water_required_liters: number | null;
  
  // Instructions
  instructions: string[] | null;
  precautions: string[] | null;
  regional_terms: any;
  
  // Weather conditions
  ideal_weather: any;
  weather_risk_level: string | null;
  
  // Completion tracking
  status: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completion_notes: string | null;
  
  // Rescheduling
  original_date: string | null;
  reschedule_reason: string | null;
  auto_rescheduled: boolean | null;
  
  // Climate adjustments
  climate_adjusted: boolean | null;
  original_date_before_climate_adjust: string | null;
  climate_adjustment_reason: string | null;
  
  // Product recommendations
  product_recommendations: any;
  product_type: string | null;
  
  // Yield impact
  yield_boost_technique: string | null;
  yield_impact: string | null;
  yield_impact_details: any;
  
  // Skip penalty
  skip_penalty: string | null;
  skip_penalty_details: any;
  
  // Language
  language: string | null;
  
  // Timestamps
  created_at: string | null;
  updated_at: string | null;
  
  // Sync metadata (local only)
  lastModified?: number;
  syncStatus?: 'synced' | 'pending' | 'conflict';
}

/**
 * AI Chat Sessions table - matches Supabase ai_chat_sessions table exactly
 */
export interface AIChatSessionData {
  // Core fields
  id: string;
  tenant_id: string;
  farmer_id: string;
  land_id: string | null;
  
  // Session information
  session_title: string | null;
  session_type: string | null;
  is_active: boolean | null;
  
  // Metadata
  metadata: any;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  
  // Sync metadata (local only)
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

/**
 * AI Chat Messages table - matches Supabase ai_chat_messages table exactly
 */
export interface AIChatMessageData {
  // Core fields
  id: string;
  session_id: string;
  tenant_id: string;
  farmer_id: string;
  
  // Message content
  role: string;  // 'user' or 'assistant'
  content: string;
  
  // Context fields
  land_context: any;
  crop_context: any;
  weather_context: any;
  location_context: any;
  
  // Zone information
  agro_climatic_zone: string | null;
  soil_zone: string | null;
  rainfall_zone: string | null;
  crop_season: string | null;
  
  // AI model information
  ai_model: string | null;
  response_time_ms: number | null;
  tokens_used: number | null;
  
  // Feedback
  feedback_rating: number | null;
  feedback_text: string | null;
  feedback_timestamp: string | null;
  
  // Attachments
  attachments: any;
  image_urls: string[] | null;
  
  // Message tracking
  status: string | null;
  language: string | null;
  message_type: string | null;
  error_details: any;
  
  // Editing
  is_edited: boolean | null;
  edited_at: string | null;
  parent_message_id: string | null;
  
  // Audit fields
  user_agent: string | null;
  ip_address: any;
  partition_key: number | null;
  
  // Analysis & Intent Classification
  word_count: number | null;
  inferred_intent: string | null;
  intent_confidence: number | null;
  
  // Training & Quality fields (Supabase schema)
  is_training_candidate: boolean | null;
  human_verified: boolean | null;
  correction_notes: string | null;
  conversation_quality_score: number | null;
  domain_tags: string[] | null;
  complexity_level: string | null;
  conversation_turn_number: number | null;
  off_topic: boolean | null;
  training_processed: boolean | null;
  preprocessed_content: string | null;
  excluded_reason: string | null;
  agricultural_accuracy: number | null;
  
  // Decision Brain fields
  decision_brain_source: boolean | null;
  actions_returned: any;
  actions_filtered_out: any;
  
  // Metadata
  metadata: any;
  
  // Timestamps
  created_at: string;
  updated_at: string | null;
  
  // Sync metadata (local only)
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

/**
 * Crops table - matches Supabase crops table exactly
 */
export interface CropData {
  // Core fields
  id: string;
  value: string;
  label: string;
  
  // Localization
  label_local: string | null;
  label_hi: string | null;
  label_mr: string | null;
  local_name: string | null;
  
  // Visual
  icon: string;
  
  // Details
  description: string | null;
  duration_days: number | null;
  season: string | null;
  
  // Organization
  crop_group_id: string | null;
  display_order: number;
  is_active: boolean | null;
  is_popular: boolean | null;
  
  // Additional data
  metadata: any;
  
  // Timestamps
  created_at: string | null;
  updated_at: string;
  
  // Sync metadata (local only)
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

/**
 * Weather data (local storage only for now)
 */
export interface WeatherData {
  id: string;
  location: string;
  date: string;
  temperature: number;
  humidity?: number;
  rainfall?: number;
  wind_speed?: number;
  forecast_data?: any;
  metadata?: any;
  lastModified: number;
}

/**
 * Farmer Alerts table - matches Supabase farmer_alerts table exactly
 */
export interface FarmerAlertData {
  // Core fields
  id: string;
  tenant_id: string;
  farmer_id: string;
  land_id: string;
  
  // Alert information
  title: string;
  message: string;
  alert_type: string;
  priority: string;  // Note: Supabase uses priority, not severity
  
  // AI reasoning
  ai_reasoning: string | null;
  action_required: string | null;
  data_source: any;
  
  // Associated schedule
  schedule_id: string | null;
  
  // Status tracking
  is_read: boolean | null;
  is_actioned: boolean | null;
  actioned_at: string | null;
  expires_at: string | null;
  
  // Timestamps
  created_at: string | null;
  
  // Sync metadata (local only)
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

/**
 * Farmer Subscription - mirrors Supabase farmer_subscriptions table
 */
export interface FarmerSubscriptionData {
  id: string;
  farmer_id: string;
  tenant_id: string;
  tenant_subscription_id: string | null;
  plan_id: string;
  billing_interval: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  trial_end_date: string | null;
  auto_renew: boolean | null;
  payment_method: any;
  metadata: any;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  paid_by_tenant: boolean | null;
  paying_tenant_id: string | null;
  grace_period_ends_at: string | null;
  next_billing_date: string | null;
  last_payment_date: string | null;
  last_payment_amount: number | null;
  payment_method_id: string | null;
  cancellation_reason: string | null;
  trial_days: number | null;
  payment_provider: string | null;
  payment_order_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

/**
 * Subscription Plan - mirrors Supabase subscription_plans table
 */
export interface SubscriptionPlanData {
  id: string;
  name: string;
  description: string | null;
  plan_type: string;
  price_monthly: number | null;
  price_quarterly: number | null;
  price_annually: number | null;
  features: any;
  limits: any;
  is_active: boolean | null;
  is_custom: boolean | null;
  is_public: boolean | null;
  tenant_id: string | null;
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annually: string | null;
  plan_category: string | null;
  billing_interval: string | null;
  trial_days: number | null;
  created_at: string | null;
  updated_at: string | null;
  lastModified: number;
}

/**
 * Subscription Usage Log - mirrors Supabase subscription_usage_logs table
 */
export interface SubscriptionUsageLogData {
  id: string;
  tenant_id: string;
  farmer_id: string | null;
  subscription_id: string;
  metric_name: string;
  quantity: number;
  unit: string | null;
  usage_date: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  metadata: any;
  created_at: string | null;
  lastModified: number;
}

/**
 * Payment Record - mirrors Supabase payment_records table
 */
export interface PaymentRecordData {
  id: string;
  tenant_id: string;
  invoice_id: string | null;
  amount: number;
  currency: string | null;
  payment_method: string | null;
  transaction_id: string | null;
  gateway_response: any;
  status: string;
  processed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Locally derived (joined via invoice → subscription → farmer)
  farmer_id: string | null;
  lastModified: number;
}

/**
 * Tenant Configuration (local cache only)
 */
export interface TenantConfigData {
  tenant_id: string;
  white_label_config: any;
  tenant_data: any;
  cached_at: number;
  expires_at: number;
}

/**
 * Sync metadata (local only)
 */
export interface SyncMetadata {
  key: string;
  lastSyncTime: number | null;
  lastSchemaCheck: number | null;
  pendingChanges: number;
  syncInProgress: boolean;
  schemaVersion: number;
  // PHASE 3C: Per-entity incremental sync timestamps (ISO8601). Optional/additive.
  // When present, the next sync sends `?since=<value>` and only downloads delta rows.
  entityLastSync?: {
    lands?: string | null;
    schedules?: string | null;
    tasks?: string | null;
    proactive_alerts?: string | null;
  };
}

// ============================================================================
// INDEXEDDB SCHEMA DEFINITION - Matches Supabase table names
// ============================================================================

interface KisanDB extends DBSchema {
  // farmers table (matches Supabase)
  farmers: {
    key: string;
    value: FarmerData;
    indexes: {
      'by-tenant': string;
      'by-sync-status': string;
      'by-mobile': string;
    };
  };
  
  // lands table (matches Supabase)
  lands: {
    key: string;
    value: LandData;
    indexes: {
      'by-tenant': string;
      'by-farmer': string;
      'by-sync-status': string;
    };
  };
  
  // cropSchedules table (maps to crop_schedules in Supabase)
  cropSchedules: {
    key: string;
    value: CropScheduleData;
    indexes: {
      'by-tenant': string;
      'by-farmer': string;
      'by-land': string;
      'by-sync-status': string;
    };
  };
  
  // scheduleTasks table (maps to schedule_tasks in Supabase)
  scheduleTasks: {
    key: string;
    value: ScheduleTaskData;
    indexes: {
      'by-schedule': string;
      'by-tenant': string;
      'by-farmer': string;
      'by-date': string;
      'by-sync-status': string;
    };
  };
  
  // aiChatSessions table (maps to ai_chat_sessions in Supabase)
  aiChatSessions: {
    key: string;
    value: AIChatSessionData;
    indexes: {
      'by-tenant': string;
      'by-farmer': string;
      'by-land': string | null;
      'by-sync-status': string;
    };
  };
  
  // aiChatMessages table (maps to ai_chat_messages in Supabase)
  aiChatMessages: {
    key: string;
    value: AIChatMessageData;
    indexes: {
      'by-session': string;
      'by-tenant': string;
      'by-farmer': string;
      'by-sync-status': string;
      'by-role': string;
    };
  };
  
  // crops table (matches Supabase)
  crops: {
    key: string;
    value: CropData;
    indexes: {
      'by-sync-status': string;
      'by-active': string;
    };
  };
  
  // weather table (local storage only for now)
  weather: {
    key: string;
    value: WeatherData;
    indexes: {
      'by-location': string;
      'by-date': string;
    };
  };
  
  // farmerAlerts table (maps to farmer_alerts in Supabase)
  farmerAlerts: {
    key: string;
    value: FarmerAlertData;
    indexes: {
      'by-tenant': string;
      'by-farmer': string;
      'by-land': string;
      'by-read-status': string;
      'by-sync-status': string;
    };
  };
  
  // farmerSubscriptions table (maps to farmer_subscriptions in Supabase)
  farmerSubscriptions: {
    key: string;
    value: FarmerSubscriptionData;
    indexes: {
      'by-farmer': string;
      'by-tenant': string;
      'by-status': string;
      'by-sync-status': string;
    };
  };

  // subscriptionPlans table (reference data)
  subscriptionPlans: {
    key: string;
    value: SubscriptionPlanData;
    indexes: {
      'by-plan-type': string;
      'by-active': string;
    };
  };

  // subscriptionUsageLogs table
  subscriptionUsageLogs: {
    key: string;
    value: SubscriptionUsageLogData;
    indexes: {
      'by-farmer': string;
      'by-subscription': string;
      'by-metric': string;
    };
  };

  // paymentRecords table
  paymentRecords: {
    key: string;
    value: PaymentRecordData;
    indexes: {
      'by-farmer': string;
      'by-tenant': string;
      'by-status': string;
    };
  };

  // tenantConfig table (local cache only)
  tenantConfig: {
    key: string;
    value: TenantConfigData;
    indexes: {
      'by-tenant': string;
    };
  };
  
  // proactiveAlerts table (maps to proactive_alerts in Supabase)
  proactiveAlerts: {
    key: string;
    value: ProactiveAlertData;
    indexes: {
      'by-farmer': string;
      'by-status': string;
      'by-created': string;
    };
  };

  // syncMetadata table (local only)
  syncMetadata: {
    key: string;
    value: SyncMetadata;
  };
}

/**
 * Proactive Alerts - mirrors Supabase proactive_alerts table (subset, last 100 per farmer).
 */
export interface ProactiveAlertData {
  id: string;
  farmer_id: string;
  tenant_id: string | null;
  land_id: string | null;
  alert_category: string;
  priority: string;
  title_mr: string | null;
  title_hi: string | null;
  title_en: string;
  message_mr: string | null;
  message_hi: string | null;
  message_en: string;
  action_text_mr: string | null;
  action_text_hi: string | null;
  action_text_en: string | null;
  risk_score: number;
  status: string;
  created_at: string;
  rule_id: string | null;
  trigger_data: any;
  decision_reasoning: string | null;
  lastModified: number;
}

// ============================================================================
// LOCAL DATABASE CLASS
// ============================================================================

const DB_NAME = 'KisanDB';
const DB_VERSION = 12; // Bumped for proactive_alerts offline mirror (2026-04-20)
const SCHEMA_VERSION = 10; // Bumped for proactive alerts parity

class LocalDatabase {
  private db: IDBPDatabase<KisanDB> | null = null;
  private initPromise: Promise<void> | null = null;
  private schemaUpgradeComplete = false;
  private currentTenantId: string | null = null;
  private dbName: string = DB_NAME;

  /**
   * SECURE: Initialize with tenant isolation
   * Creates tenant-prefixed database for complete data isolation
   */
  async initializeWithTenant(tenantId: string): Promise<void> {
    if (!tenantId || tenantId.trim() === '') {
      throw new Error('🚨 [Security] CRITICAL: Cannot initialize LocalDB without valid tenant ID');
    }
    
    // Close existing connection if switching tenants
    if (this.currentTenantId && this.currentTenantId !== tenantId) {
      console.warn('🔄 [Security] Switching tenant, closing old DB connection:', {
        oldTenant: this.currentTenantId,
        newTenant: tenantId
      });
      await this.closeTenantDB();
    }
    
    this.currentTenantId = tenantId;
    // Use tenant-prefixed database name for COMPLETE isolation
    this.dbName = tenantIsolationService.getTenantDatabaseName();
    
    console.log('🔐 [Security] Initializing tenant-scoped database:', this.dbName);
    
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.performInitialization();
    return this.initPromise;
  }

  /**
   * Legacy initialization - now uses tenant isolation service
   */
  async initialize(): Promise<void> {
    const tenantId = tenantIsolationService.getTenantId();
    
    if (!tenantId) {
      console.warn('⚠️ [Security] No tenant context found, checking localStorage...');
      const storedTenantId = localStorage.getItem('tenantId');
      
      if (storedTenantId) {
        console.log('✅ [Security] Loaded tenant from localStorage:', storedTenantId);
        return this.initializeWithTenant(storedTenantId);
      }
      
      throw new Error('🚨 [Security] Cannot initialize LocalDB - tenant not loaded');
    }
    
    return this.initializeWithTenant(tenantId);
  }

  private async performInitialization(): Promise<void> {
    console.log('🚀 [LocalDB] Starting tenant-isolated initialization...');
    console.log('🔐 [Security] Database name:', this.dbName, 'Tenant:', this.currentTenantId);

    this.db = await openDB<KisanDB>(this.dbName, DB_VERSION, {
      upgrade: (db, oldVersion, newVersion, transaction) => {
        console.log(`📦 [LocalDB] Schema upgrade ${oldVersion} → ${newVersion} (background)`);

        // Create or update farmers store
        if (!db.objectStoreNames.contains('farmers')) {
          const farmersStore = db.createObjectStore('farmers', { keyPath: 'id' });
          farmersStore.createIndex('by-tenant', 'tenant_id');
          farmersStore.createIndex('by-sync-status', 'syncStatus');
          farmersStore.createIndex('by-mobile', 'mobile_number');
        }

        // Create or update lands store
        if (!db.objectStoreNames.contains('lands')) {
          const landsStore = db.createObjectStore('lands', { keyPath: 'id' });
          landsStore.createIndex('by-tenant', 'tenant_id');
          landsStore.createIndex('by-farmer', 'farmer_id');
          landsStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create cropSchedules store (maps to crop_schedules in Supabase)
        if (!db.objectStoreNames.contains('cropSchedules')) {
          const schedulesStore = db.createObjectStore('cropSchedules', { keyPath: 'id' });
          schedulesStore.createIndex('by-tenant', 'tenant_id');
          schedulesStore.createIndex('by-farmer', 'farmer_id');
          schedulesStore.createIndex('by-land', 'land_id');
          schedulesStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create or update scheduleTasks store with full indexes
        if (!db.objectStoreNames.contains('scheduleTasks')) {
          const tasksStore = db.createObjectStore('scheduleTasks', { keyPath: 'id' });
          tasksStore.createIndex('by-schedule', 'schedule_id');
          tasksStore.createIndex('by-tenant', 'tenant_id');
          tasksStore.createIndex('by-farmer', 'farmer_id');
          tasksStore.createIndex('by-date', 'task_date');
          tasksStore.createIndex('by-sync-status', 'syncStatus');
        } else if (oldVersion < 8) {
          // Add new indexes to existing store
          const tasksStore = transaction.objectStore('scheduleTasks');
          if (!tasksStore.indexNames.contains('by-tenant')) {
            tasksStore.createIndex('by-tenant', 'tenant_id');
          }
          if (!tasksStore.indexNames.contains('by-farmer')) {
            tasksStore.createIndex('by-farmer', 'farmer_id');
          }
          if (!tasksStore.indexNames.contains('by-sync-status')) {
            tasksStore.createIndex('by-sync-status', 'syncStatus');
          }
        }

        // Create aiChatSessions store (maps to ai_chat_sessions in Supabase)
        if (!db.objectStoreNames.contains('aiChatSessions')) {
          const sessionsStore = db.createObjectStore('aiChatSessions', { keyPath: 'id' });
          sessionsStore.createIndex('by-tenant', 'tenant_id');
          sessionsStore.createIndex('by-farmer', 'farmer_id');
          sessionsStore.createIndex('by-land', 'land_id');
          sessionsStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create aiChatMessages store (maps to ai_chat_messages in Supabase)
        if (!db.objectStoreNames.contains('aiChatMessages')) {
          const messagesStore = db.createObjectStore('aiChatMessages', { keyPath: 'id' });
          messagesStore.createIndex('by-session', 'session_id');
          messagesStore.createIndex('by-tenant', 'tenant_id');
          messagesStore.createIndex('by-farmer', 'farmer_id');
          messagesStore.createIndex('by-sync-status', 'syncStatus');
          messagesStore.createIndex('by-role', 'role');
        }

        // Create or update crops store
        if (!db.objectStoreNames.contains('crops')) {
          const cropsStore = db.createObjectStore('crops', { keyPath: 'id' });
          cropsStore.createIndex('by-sync-status', 'syncStatus');
          cropsStore.createIndex('by-active', 'is_active');
        }

        // Create or update weather store
        if (!db.objectStoreNames.contains('weather')) {
          const weatherStore = db.createObjectStore('weather', { keyPath: 'id' });
          weatherStore.createIndex('by-location', 'location');
          weatherStore.createIndex('by-date', 'date');
        }

        // Create or update farmerAlerts store
        if (!db.objectStoreNames.contains('farmerAlerts')) {
          const alertsStore = db.createObjectStore('farmerAlerts', { keyPath: 'id' });
          alertsStore.createIndex('by-tenant', 'tenant_id');
          alertsStore.createIndex('by-farmer', 'farmer_id');
          alertsStore.createIndex('by-land', 'land_id');
          alertsStore.createIndex('by-read-status', 'is_read');
          alertsStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create tenantConfig store for caching white label configurations
        if (!db.objectStoreNames.contains('tenantConfig')) {
          const configStore = db.createObjectStore('tenantConfig', { keyPath: 'tenant_id' });
          configStore.createIndex('by-tenant', 'tenant_id');
          console.log('✅ [LocalDB] Created tenantConfig store for offline theme support');
        }

        // Create farmerSubscriptions store (offline subscription mirror)
        if (!db.objectStoreNames.contains('farmerSubscriptions')) {
          const subStore = db.createObjectStore('farmerSubscriptions', { keyPath: 'id' });
          subStore.createIndex('by-farmer', 'farmer_id');
          subStore.createIndex('by-tenant', 'tenant_id');
          subStore.createIndex('by-status', 'status');
          subStore.createIndex('by-sync-status', 'syncStatus');
          console.log('✅ [LocalDB] Created farmerSubscriptions store');
        }

        // Create subscriptionPlans store (reference data)
        if (!db.objectStoreNames.contains('subscriptionPlans')) {
          const planStore = db.createObjectStore('subscriptionPlans', { keyPath: 'id' });
          planStore.createIndex('by-plan-type', 'plan_type');
          planStore.createIndex('by-active', 'is_active');
          console.log('✅ [LocalDB] Created subscriptionPlans store');
        }

        // Create subscriptionUsageLogs store
        if (!db.objectStoreNames.contains('subscriptionUsageLogs')) {
          const usageStore = db.createObjectStore('subscriptionUsageLogs', { keyPath: 'id' });
          usageStore.createIndex('by-farmer', 'farmer_id');
          usageStore.createIndex('by-subscription', 'subscription_id');
          usageStore.createIndex('by-metric', 'metric_name');
          console.log('✅ [LocalDB] Created subscriptionUsageLogs store');
        }

        // Create paymentRecords store
        if (!db.objectStoreNames.contains('paymentRecords')) {
          const payStore = db.createObjectStore('paymentRecords', { keyPath: 'id' });
          payStore.createIndex('by-farmer', 'farmer_id');
          payStore.createIndex('by-tenant', 'tenant_id');
          payStore.createIndex('by-status', 'status');
          console.log('✅ [LocalDB] Created paymentRecords store');
        }

        // Create proactiveAlerts store (offline alerts mirror)
        if (!db.objectStoreNames.contains('proactiveAlerts')) {
          const paStore = db.createObjectStore('proactiveAlerts', { keyPath: 'id' });
          paStore.createIndex('by-farmer', 'farmer_id');
          paStore.createIndex('by-status', 'status');
          paStore.createIndex('by-created', 'created_at');
          console.log('✅ [LocalDB] Created proactiveAlerts store');
        }

        // Create syncMetadata store
        if (!db.objectStoreNames.contains('syncMetadata')) {
          db.createObjectStore('syncMetadata', { keyPath: 'key' });
        }
        
        this.schemaUpgradeComplete = true;
        console.log('✅ [LocalDB] Schema upgrade complete (background)');
      },
    });

    console.log('✅ [LocalDB] Tenant-isolated database ready:', this.dbName);

    // Run schema validation in background, don't block
    this.validateSchemaVersion().catch(err => {
      console.error('❌ [LocalDB] Schema validation error:', err);
    });
  }

  /**
   * Close database connection (for tenant switching)
   */
  async closeTenantDB(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
      this.schemaUpgradeComplete = false;
      console.log('🔒 [LocalDB] Database connection closed for tenant:', this.currentTenantId);
      this.currentTenantId = null;
    }
  }

  /**
   * SECURITY: Validate tenant context on read operations
   */
  private validateTenantContext(data: any): void {
    if (!this.currentTenantId) {
      console.warn('⚠️ [Security] No tenant context for validation');
      return;
    }
    
    if (data && data.tenant_id && data.tenant_id !== this.currentTenantId) {
      console.error('🚨 [Security] TENANT ISOLATION VIOLATION DETECTED!', {
        recordTenant: data.tenant_id,
        currentTenant: this.currentTenantId,
        dataId: data.id
      });
      throw new Error('Tenant isolation violation: Data belongs to different tenant');
    }
  }

  /**
   * Validate schema version and clear DB if mismatch
   */
  async validateSchemaVersion(): Promise<void> {
    if (!this.db) return;
    
    const tx = this.db.transaction('syncMetadata', 'readwrite');
    const store = tx.objectStore('syncMetadata');
    const existing = await store.get('main');
    
    if (!existing) {
      // First time initialization
      await store.put({
        key: 'main',
        lastSyncTime: null,
        lastSchemaCheck: Date.now(),
        pendingChanges: 0,
        syncInProgress: false,
        schemaVersion: SCHEMA_VERSION,
      });
      console.log('✅ [LocalDB] Schema metadata initialized');
    } else if (existing.schemaVersion !== SCHEMA_VERSION) {
      // Schema version mismatch - clear all data
      console.warn(`⚠️ [LocalDB] Schema version mismatch: ${existing.schemaVersion} vs ${SCHEMA_VERSION}`);
      console.log('🗑️ [LocalDB] Clearing all data due to schema mismatch...');
      
      await tx.done;
      await this.clearAll();
      
      // Reinitialize metadata with new schema version
      const newTx = this.db.transaction('syncMetadata', 'readwrite');
      await newTx.objectStore('syncMetadata').put({
        key: 'main',
        lastSyncTime: null,
        lastSchemaCheck: Date.now(),
        pendingChanges: 0,
        syncInProgress: false,
        schemaVersion: SCHEMA_VERSION,
      });
      await newTx.done;
      
      console.log('✅ [LocalDB] Data cleared and schema updated to v', SCHEMA_VERSION);
    } else {
      // Update last schema check time
      existing.lastSchemaCheck = Date.now();
      await store.put(existing);
      console.log('✅ [LocalDB] Schema version validated (v', SCHEMA_VERSION, ')');
    }
    
    await tx.done;
  }

  // ========== FARMER OPERATIONS ==========

  async saveFarmer(farmer: Omit<FarmerData, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    
    // SECURITY: Verify tenant_id matches current context
    const validation = tenantIsolationService.validateContext(false);
    if (!validation.valid) {
      throw new Error(`[Security] Cannot save farmer: ${validation.error}`);
    }
    
    if (farmer.tenant_id !== validation.tenantId) {
      throw new Error(`[Security] CRITICAL: Farmer tenant_id mismatch! Expected: ${validation.tenantId}, Got: ${farmer.tenant_id}`);
    }
    
    const data: FarmerData = {
      ...farmer,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('farmers', data);
    await this.updatePendingCount();
  }

  async getFarmers(tenantId?: string): Promise<FarmerData[]> {
    if (!this.db) await this.initialize();
    
    // SECURITY: Default to current tenant if not specified
    const contextTenantId = tenantIsolationService.getTenantId();
    const filterTenantId = tenantId || contextTenantId;
    
    if (!filterTenantId) {
      console.error('❌ [Security] Cannot get farmers without tenant context');
      return [];
    }
    
    return await this.db!.getAllFromIndex('farmers', 'by-tenant', filterTenantId);
  }

  async getFarmerById(id: string): Promise<FarmerData | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('farmers', id);
  }

  // ========== LAND OPERATIONS ==========

  async saveLand(land: Omit<LandData, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    
    // SECURITY: Verify tenant_id matches current context
    const validation = tenantIsolationService.validateContext(false);
    if (!validation.valid) {
      throw new Error(`[Security] Cannot save land: ${validation.error}`);
    }
    
    if (land.tenant_id !== validation.tenantId) {
      throw new Error(`[Security] CRITICAL: Land tenant_id mismatch! Expected: ${validation.tenantId}, Got: ${land.tenant_id}`);
    }
    
    const data: LandData = {
      ...land,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('lands', data);
    await this.updatePendingCount();
  }

  async getLands(tenantId?: string, farmerId?: string): Promise<LandData[]> {
    if (!this.db) await this.initialize();
    
    // SECURITY: Default to current tenant if not specified
    const contextTenantId = tenantIsolationService.getTenantId();
    const filterTenantId = tenantId || contextTenantId;
    
    if (!filterTenantId && !farmerId) {
      console.error('❌ [Security] Cannot get lands without tenant or farmer context');
      return [];
    }
    
    if (farmerId) {
      return await this.db!.getAllFromIndex('lands', 'by-farmer', farmerId);
    }
    if (filterTenantId) {
      return await this.db!.getAllFromIndex('lands', 'by-tenant', filterTenantId);
    }
    return [];
  }

  async getLandsByFarmer(farmerId: string): Promise<LandData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('lands', 'by-farmer', farmerId);
  }

  async getLandById(id: string): Promise<LandData | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('lands', id);
  }

  // ========== CROP SCHEDULE OPERATIONS (Updated table name) ==========

  async saveSchedule(schedule: Omit<CropScheduleData, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: CropScheduleData = {
      ...schedule,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('cropSchedules', data);
    await this.updatePendingCount();
  }

  async getAllSchedules(farmerId?: string): Promise<CropScheduleData[]> {
    if (!this.db) await this.initialize();
    
    // SECURITY: Require farmer_id for data isolation in multi-tenant SaaS
    if (!farmerId) {
      console.error('❌ [LocalDB] SECURITY: getAllSchedules() called without farmerId!');
      return [];
    }
    
    return await this.db!.getAllFromIndex('cropSchedules', 'by-farmer', farmerId);
  }

  async getSchedulesByLand(landId: string): Promise<CropScheduleData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('cropSchedules', 'by-land', landId);
  }

  async getSchedulesByFarmer(farmerId: string): Promise<CropScheduleData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('cropSchedules', 'by-farmer', farmerId);
  }

  async getScheduleById(id: string): Promise<CropScheduleData | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('cropSchedules', id);
  }

  // ========== SCHEDULE TASK OPERATIONS ==========

  async saveTask(task: ScheduleTaskData): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('scheduleTasks', task);
  }

  async saveTasks(tasks: ScheduleTaskData[]): Promise<void> {
    if (!this.db) await this.initialize();
    const tx = this.db!.transaction('scheduleTasks', 'readwrite');
    for (const task of tasks) {
      await tx.objectStore('scheduleTasks').put(task);
    }
    await tx.done;
  }

  async getTasksBySchedule(scheduleId: string): Promise<ScheduleTaskData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('scheduleTasks', 'by-schedule', scheduleId);
  }

  async getTasksByFarmer(farmerId: string): Promise<ScheduleTaskData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('scheduleTasks', 'by-farmer', farmerId);
  }

  async getAllTasks(farmerId?: string): Promise<ScheduleTaskData[]> {
    if (!this.db) await this.initialize();
    if (farmerId) {
      return await this.db!.getAllFromIndex('scheduleTasks', 'by-farmer', farmerId);
    }
    return await this.db!.getAll('scheduleTasks');
  }

  async getTaskById(id: string): Promise<ScheduleTaskData | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('scheduleTasks', id);
  }

  // ========== AI CHAT OPERATIONS (Updated table names) ==========

  async saveChatSession(session: Omit<AIChatSessionData, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: AIChatSessionData = {
      ...session,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('aiChatSessions', data);
    await this.updatePendingCount();
  }

  async getChatSessionsByFarmer(farmerId: string): Promise<AIChatSessionData[]> {
    if (!this.db) await this.initialize();
    
    // CRITICAL: Also filter by tenant_id for multi-tenant isolation
    const tenantId = tenantIsolationService.getTenantId();
    const allSessions = await this.db!.getAllFromIndex('aiChatSessions', 'by-farmer', farmerId);
    
    if (tenantId) {
      return allSessions.filter(s => s.tenant_id === tenantId);
    }
    return allSessions;
  }

  async getChatSessionsByLand(landId: string | null, farmerId?: string): Promise<AIChatSessionData[]> {
    if (!this.db) await this.initialize();
    
    // CRITICAL FIX: Get farmer and tenant context for proper isolation
    const currentFarmerId = farmerId || tenantIsolationService.getUserId();
    const tenantId = tenantIsolationService.getTenantId();
    
    let sessions: AIChatSessionData[];
    
    if (landId) {
      sessions = await this.db!.getAllFromIndex('aiChatSessions', 'by-land', landId);
    } else {
      // CRITICAL FIX: For general sessions (landId === null), we cannot use index lookup
      // because IndexedDB doesn't index null values. Instead, filter all sessions manually.
      const allSessions = await this.db!.getAll('aiChatSessions');
      sessions = allSessions.filter(s => s.land_id === null || s.land_id === undefined);
    }
    
    // CRITICAL: Apply tenant and farmer isolation
    return sessions.filter(s => {
      const tenantMatch = !tenantId || s.tenant_id === tenantId;
      const farmerMatch = !currentFarmerId || s.farmer_id === currentFarmerId;
      return tenantMatch && farmerMatch;
    });
  }

  async saveChatMessage(message: Omit<AIChatMessageData, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: AIChatMessageData = {
      ...message,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('aiChatMessages', data);
    await this.updatePendingCount();
  }

  async getChatMessages(landId?: string | null, farmerId?: string, tenantIdParam?: string): Promise<AIChatMessageData[]> {
    if (!this.db) await this.initialize();
    
    // CRITICAL FIX: Get farmer and tenant IDs from context if not provided
    const currentFarmerId = farmerId || tenantIsolationService.getUserId();
    const currentTenantId = tenantIdParam || tenantIsolationService.getTenantId();
    
    if (!currentFarmerId) {
      console.warn('⚠️ [LocalDB] getChatMessages called without farmer context');
    }
    if (!currentTenantId) {
      console.warn('⚠️ [LocalDB] getChatMessages called without tenant context');
    }
    
    // =========================================================================
    // CRITICAL FIX (2026-01-14): Multi-tenant isolation in message retrieval
    // All messages MUST be filtered by tenant_id AND farmer_id
    // =========================================================================
    
    // Get all messages and apply strict tenant + farmer isolation
    const allMessages = await this.db!.getAll('aiChatMessages');
    const isolatedMessages = allMessages.filter(m => {
      const tenantMatch = !currentTenantId || m.tenant_id === currentTenantId;
      const farmerMatch = !currentFarmerId || m.farmer_id === currentFarmerId;
      return tenantMatch && farmerMatch;
    });
    
    if (isolatedMessages.length === 0) {
      console.log(`📱 [LocalDB] No messages found for tenant ${currentTenantId}, farmer ${currentFarmerId} in IndexedDB`);
      return [];
    }
    
    // Get sessions to determine land association - also with tenant/farmer isolation
    const allSessions = await this.db!.getAll('aiChatSessions');
    const relevantSessions = allSessions.filter(s => {
      const tenantMatch = !currentTenantId || s.tenant_id === currentTenantId;
      const farmerMatch = !currentFarmerId || s.farmer_id === currentFarmerId;
      
      if (!tenantMatch || !farmerMatch) return false;
      
      if (landId === null || landId === undefined) {
        // General chat: sessions without land_id
        return s.land_id === null || s.land_id === undefined;
      }
      // Land-specific: sessions with matching land_id
      return s.land_id === landId;
    });
    
    const sessionIds = new Set(relevantSessions.map(s => s.id));
    
    // Filter messages by session, with fallback for messages that may have missing session links
    const sessionFilteredMessages = isolatedMessages.filter(m => sessionIds.has(m.session_id));
    
    // CRITICAL FIX: SMART CONTENT-BASED FILTERING
    const filteredMessages = sessionFilteredMessages.filter(msg => {
      // Filter 1: Skip empty content messages
      if (!msg.content || msg.content.trim().length === 0) {
        return false;
      }
      
      const content = msg.content.trim();
      
      // Filter 2: Skip ACTUAL system prompts (NOT farmer messages)
      // These are internal prompts sent TO the LLM, not real farmer questions
      const isSystemPrompt = 
        content.startsWith('Based on the ') ||
        content.startsWith('Based on ') && content.includes('provide') ||
        content.startsWith('🧠 DECISION BRAIN OUTPUT') ||
        content.startsWith('🧠') ||
        content.startsWith('[PREVIOUS_RECOMMENDATIONS') ||
        content.startsWith('Analyze this') ||
        content.startsWith('Provide ') ||
        content.includes('DO NOT CHANGE THE FORMAT') ||
        content.includes('DECISION BRAIN OUTPUT');
      
      if (msg.role === 'user' && isSystemPrompt) {
        return false;
      }
      
      // Filter 3: Skip system acknowledgment messages
      if (content === 'Response generated' || content === 'Processing...') {
        return false;
      }
      
      // Filter 4: Skip minimal decision brain responses (< 20 chars)
      if (msg.role === 'assistant' && msg.decision_brain_source === true && content.length < 20) {
        return false;
      }
      
      // KEEP: All other messages including real farmer questions
      return true;
    });
    
    console.log(`📱 [LocalDB] getChatMessages: Found ${filteredMessages.length}/${sessionFilteredMessages.length} displayable messages for tenant ${currentTenantId}, farmer ${currentFarmerId} and land ${landId || 'general'}`);
    return filteredMessages;
  }

  async getChatMessagesBySession(sessionId: string): Promise<AIChatMessageData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('aiChatMessages', 'by-session', sessionId);
  }

  // ========== CROP OPERATIONS ==========

  async saveCrop(crop: Omit<CropData, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: CropData = {
      ...crop,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('crops', data);
    await this.updatePendingCount();
  }

  async getCrops(): Promise<CropData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAll('crops');
  }

  // ========== WEATHER OPERATIONS ==========

  async saveWeather(weather: WeatherData): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('weather', weather);
  }

  async getWeatherByLocation(location: string): Promise<WeatherData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('weather', 'by-location', location);
  }

  // ========== ALERT OPERATIONS ==========

  async saveFarmerAlert(alert: Omit<FarmerAlertData, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: FarmerAlertData = {
      ...alert,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('farmerAlerts', data);
    await this.updatePendingCount();
  }

  async getFarmerAlerts(farmerId: string): Promise<FarmerAlertData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('farmerAlerts', 'by-farmer', farmerId);
  }

  // ========== BULK OPERATIONS ==========

  async bulkSave(data: {
    farmers?: FarmerData[];
    lands?: LandData[];
    schedules?: CropScheduleData[];
    tasks?: ScheduleTaskData[];
    sessions?: AIChatSessionData[];
    messages?: AIChatMessageData[];
    crops?: CropData[];
    alerts?: FarmerAlertData[];
  }): Promise<void> {
    if (!this.db) await this.initialize();

    const tx = this.db!.transaction(
      ['farmers', 'lands', 'cropSchedules', 'scheduleTasks', 'aiChatSessions', 'aiChatMessages', 'crops', 'farmerAlerts'],
      'readwrite'
    );

    if (data.farmers) {
      for (const farmer of data.farmers) {
        await tx.objectStore('farmers').put(farmer);
      }
    }

    if (data.lands) {
      for (const land of data.lands) {
        await tx.objectStore('lands').put(land);
      }
    }

    if (data.schedules) {
      for (const schedule of data.schedules) {
        await tx.objectStore('cropSchedules').put(schedule);
      }
    }

    if (data.tasks) {
      for (const task of data.tasks) {
        await tx.objectStore('scheduleTasks').put(task);
      }
    }

    if (data.sessions) {
      for (const session of data.sessions) {
        await tx.objectStore('aiChatSessions').put(session);
      }
    }

    if (data.messages) {
      for (const message of data.messages) {
        await tx.objectStore('aiChatMessages').put(message);
      }
    }

    if (data.crops) {
      for (const crop of data.crops) {
        await tx.objectStore('crops').put(crop);
      }
    }

    if (data.alerts) {
      for (const alert of data.alerts) {
        await tx.objectStore('farmerAlerts').put(alert);
      }
    }

    await tx.done;
    await this.updatePendingCount();
  }

  // ========== SYNC OPERATIONS ==========

  async getPendingChanges(): Promise<{
    farmers: FarmerData[];
    lands: LandData[];
    schedules: CropScheduleData[];
    sessions: AIChatSessionData[];
    messages: AIChatMessageData[];
    crops: CropData[];
    alerts: FarmerAlertData[];
  }> {
    if (!this.db) await this.initialize();

    const [farmers, lands, schedules, sessions, messages, crops, alerts] = await Promise.all([
      this.db!.getAllFromIndex('farmers', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('lands', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('cropSchedules', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('aiChatSessions', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('aiChatMessages', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('crops', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('farmerAlerts', 'by-sync-status', 'pending'),
    ]);

    return { farmers, lands, schedules, sessions, messages, crops, alerts };
  }

  async markAsSynced(type: string, id: string): Promise<void> {
    if (!this.db) await this.initialize();

    const storeMap: Record<string, keyof KisanDB> = {
      farmer: 'farmers',
      land: 'lands',
      schedule: 'cropSchedules',
      task: 'scheduleTasks',
      session: 'aiChatSessions',
      message: 'aiChatMessages',
      crop: 'crops',
      alert: 'farmerAlerts',
    };

    const storeName = storeMap[type];
    if (!storeName) return;

    const item = await this.db!.get(storeName as any, id);
    if (item) {
      (item as any).syncStatus = 'synced';
      await this.db!.put(storeName as any, item as any);
      await this.updatePendingCount();
    }
  }

  async updatePendingCount(): Promise<void> {
    if (!this.db) await this.initialize();

    const pending = await this.getPendingChanges();
    const count =
      pending.farmers.length +
      pending.lands.length +
      pending.schedules.length +
      pending.sessions.length +
      pending.messages.length +
      pending.crops.length +
      pending.alerts.length;

    const tx = this.db!.transaction('syncMetadata', 'readwrite');
    const metadata = await tx.objectStore('syncMetadata').get('main');
    if (metadata) {
      metadata.pendingChanges = count;
      await tx.objectStore('syncMetadata').put(metadata);
    }
    await tx.done;
  }

  async getSyncMetadata(): Promise<SyncMetadata | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('syncMetadata', 'main');
  }

  async updateSyncMetadata(updates: Partial<SyncMetadata>): Promise<void> {
    if (!this.db) await this.initialize();
    const metadata = await this.getSyncMetadata();
    if (metadata) {
      await this.db!.put('syncMetadata', { ...metadata, ...updates });
    }
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.initialize();
    
    console.log('🗑️ [LocalDB] Clearing all data stores...');
    
    // List of all object stores that may exist
    const storeNames: Array<'farmers' | 'lands' | 'cropSchedules' | 'scheduleTasks' | 'aiChatSessions' | 'aiChatMessages' | 'crops' | 'weather' | 'farmerAlerts' | 'tenantConfig' | 'farmerSubscriptions' | 'subscriptionPlans' | 'subscriptionUsageLogs' | 'paymentRecords'> = [
      'farmers', 'lands', 'cropSchedules', 'scheduleTasks', 
      'aiChatSessions', 'aiChatMessages', 'crops', 'weather', 
      'farmerAlerts', 'tenantConfig',
      'farmerSubscriptions', 'subscriptionPlans', 'subscriptionUsageLogs', 'paymentRecords'
    ];
    
    // Get list of existing stores from the database
    const existingStores = Array.from(this.db!.objectStoreNames);
    
    // Filter to only stores that actually exist
    const storesToClear = storeNames.filter(store => existingStores.includes(store));
    
    if (storesToClear.length === 0) {
      console.log('⚠️ [LocalDB] No object stores found to clear');
      return;
    }
    
    console.log(`🗑️ [LocalDB] Clearing ${storesToClear.length} stores:`, storesToClear);
    
    try {
      const tx = this.db!.transaction(storesToClear as any, 'readwrite');
      
      // Clear each existing store
      for (const storeName of storesToClear) {
        await tx.objectStore(storeName as any).clear();
        console.log(`  ✓ Cleared ${storeName}`);
      }
      
      await tx.done;

      // Reset pending changes counter
      await this.updateSyncMetadata({ 
        pendingChanges: 0,
        lastSyncTime: null
      });

      console.log('✅ [LocalDB] All data cleared successfully');
    } catch (error) {
      console.error('❌ [LocalDB] Error clearing stores:', error);
      // Don't throw - allow operation to continue
      console.log('⚠️ [LocalDB] Continuing despite clear error');
    }
  }
  
  /**
   * Force clear and reload all data from server
   * Used for full sync/refresh operations
   */
  async forceClearAndReload(): Promise<void> {
    console.log('🔄 [LocalDB] Starting force clear and reload...');
    
    // Clear all local data
    await this.clearAll();
    
    // Mark that a full reload is needed
    await this.updateSyncMetadata({
      lastSyncTime: null,
      pendingChanges: 0,
      syncInProgress: false,
    });
    
    console.log('✅ [LocalDB] Ready for full reload from server');
  }

  /**
   * Save tenant configuration (white label, branding) for offline use
   */
  async saveTenantConfig(tenantId: string, whiteLabelConfig: any, tenantData: any): Promise<void> {
    if (!this.db) await this.initialize();
    
    const config: TenantConfigData = {
      tenant_id: tenantId,
      white_label_config: whiteLabelConfig,
      tenant_data: tenantData,
      cached_at: Date.now(),
      expires_at: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
    
    await this.db!.put('tenantConfig', config);
    console.log('💾 [LocalDB] Saved tenant configuration for offline use:', tenantId);
  }

  /**
   * Get cached tenant configuration
   */
  async getTenantConfig(tenantId: string): Promise<TenantConfigData | undefined> {
    if (!this.db) await this.initialize();
    
    const config = await this.db!.get('tenantConfig', tenantId);
    
    if (config) {
      // Check if expired
      if (config.expires_at < Date.now()) {
        console.log('⚠️ [LocalDB] Cached tenant config expired, will fetch fresh');
        return undefined;
      }
      
      console.log('✅ [LocalDB] Retrieved cached tenant config:', tenantId);
      return config;
    }
    
    return undefined;
  }

  /**
   * Clear tenant configuration cache
   */
  async clearTenantConfig(tenantId?: string): Promise<void> {
    if (!this.db) await this.initialize();
    
    if (tenantId) {
      await this.db!.delete('tenantConfig', tenantId);
      console.log('🗑️ [LocalDB] Cleared tenant config cache for:', tenantId);
    } else {
      const tx = this.db!.transaction('tenantConfig', 'readwrite');
      await tx.objectStore('tenantConfig').clear();
      await tx.done;
      console.log('🗑️ [LocalDB] Cleared all tenant config caches');
    }
  }

  // ========== SUBSCRIPTION OPERATIONS ==========

  async saveFarmerSubscriptions(subs: Omit<FarmerSubscriptionData, 'lastModified' | 'syncStatus'>[]): Promise<void> {
    if (!this.db) await this.initialize();
    const tx = this.db!.transaction('farmerSubscriptions', 'readwrite');
    for (const s of subs) {
      await tx.objectStore('farmerSubscriptions').put({
        ...s,
        lastModified: Date.now(),
        syncStatus: 'synced',
      });
    }
    await tx.done;
  }

  async getActiveSubscription(farmerId: string): Promise<FarmerSubscriptionData | undefined> {
    if (!this.db) await this.initialize();
    const all = await this.db!.getAllFromIndex('farmerSubscriptions', 'by-farmer', farmerId);
    // Prefer 'active', then 'trial', then 'grace_period'
    const priority = ['active', 'trial', 'grace_period'];
    for (const status of priority) {
      const match = all.find(s => s.status === status);
      if (match) return match;
    }
    return all[0];
  }

  async getFarmerSubscriptions(farmerId: string): Promise<FarmerSubscriptionData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('farmerSubscriptions', 'by-farmer', farmerId);
  }

  async saveSubscriptionPlans(plans: Omit<SubscriptionPlanData, 'lastModified'>[]): Promise<void> {
    if (!this.db) await this.initialize();
    const tx = this.db!.transaction('subscriptionPlans', 'readwrite');
    for (const p of plans) {
      await tx.objectStore('subscriptionPlans').put({ ...p, lastModified: Date.now() });
    }
    await tx.done;
  }

  async getPlans(): Promise<SubscriptionPlanData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAll('subscriptionPlans');
  }

  async getPlanById(planId: string): Promise<SubscriptionPlanData | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('subscriptionPlans', planId);
  }

  async saveUsageLogs(logs: Omit<SubscriptionUsageLogData, 'lastModified'>[]): Promise<void> {
    if (!this.db) await this.initialize();
    const tx = this.db!.transaction('subscriptionUsageLogs', 'readwrite');
    for (const l of logs) {
      await tx.objectStore('subscriptionUsageLogs').put({ ...l, lastModified: Date.now() });
    }
    await tx.done;
  }

  async getUsageLogs(farmerId: string): Promise<SubscriptionUsageLogData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('subscriptionUsageLogs', 'by-farmer', farmerId);
  }

  async savePaymentRecords(records: Omit<PaymentRecordData, 'lastModified'>[]): Promise<void> {
    if (!this.db) await this.initialize();
    const tx = this.db!.transaction('paymentRecords', 'readwrite');
    for (const r of records) {
      await tx.objectStore('paymentRecords').put({ ...r, lastModified: Date.now() });
    }
    await tx.done;
  }

  async getPaymentRecords(farmerId: string): Promise<PaymentRecordData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('paymentRecords', 'by-farmer', farmerId);
  }

  // ========== PROACTIVE ALERTS OPERATIONS ==========

  async saveProactiveAlerts(alerts: Omit<ProactiveAlertData, 'lastModified'>[]): Promise<void> {
    if (!this.db) await this.initialize();
    const tx = this.db!.transaction('proactiveAlerts', 'readwrite');
    for (const a of alerts) {
      await tx.objectStore('proactiveAlerts').put({ ...a, lastModified: Date.now() });
    }
    await tx.done;
  }

  async getProactiveAlerts(farmerId: string, includeHistory = false): Promise<ProactiveAlertData[]> {
    if (!this.db) await this.initialize();
    const all = await this.db!.getAllFromIndex('proactiveAlerts', 'by-farmer', farmerId);
    const filtered = includeHistory
      ? all
      : all.filter(a => ['PENDING', 'DELIVERED', 'SEEN'].includes(a.status));
    // Sort newest first
    return filtered.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
}

export const localDB = new LocalDatabase();
