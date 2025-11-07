import { openDB, DBSchema, IDBPDatabase } from 'idb';

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
  
  // Authentication
  pin: string | null;
  pin_hash: string | null;
  pin_updated_at: string | null;
  failed_login_attempts: number | null;
  last_failed_login: string | null;
  last_login_at: string | null;
  login_attempts: number | null;
  
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
  weather_data: any;
  
  // AI model information
  ai_model: string | null;
  
  // Status
  is_active: boolean | null;
  completed_at: string | null;
  
  // Timestamps
  created_at: string | null;
  updated_at: string | null;
  
  // Sync metadata (local only)
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

/**
 * Schedule Tasks table - matches Supabase schedule_tasks table exactly
 */
export interface ScheduleTaskData {
  // Core fields
  id: string;
  schedule_id: string;
  
  // Task information
  task_name: string;
  task_type: string;
  task_date: string;  // Note: Supabase uses task_date, not scheduled_date
  task_description: string | null;
  
  // Additional task details
  duration_hours: number | null;
  priority: string | null;
  weather_dependent: boolean | null;
  
  // Resources and cost
  resources: any;
  estimated_cost: number | null;
  currency: string | null;
  
  // Instructions
  instructions: string[] | null;
  precautions: string[] | null;
  
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
  
  // Language
  language: string | null;
  
  // Timestamps
  created_at: string | null;
  updated_at: string | null;
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
  
  // Analysis
  word_count: number | null;
  
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
 * Sync metadata (local only)
 */
export interface SyncMetadata {
  key: string;
  lastSyncTime: number | null;
  lastSchemaCheck: number | null;
  pendingChanges: number;
  syncInProgress: boolean;
  schemaVersion: number;
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
      'by-date': string;
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
  
  // syncMetadata table (local only)
  syncMetadata: {
    key: string;
    value: SyncMetadata;
  };
}

// ============================================================================
// LOCAL DATABASE CLASS
// ============================================================================

const DB_NAME = 'KisanDB';
const DB_VERSION = 6; // Incremented for schema improvements
const SCHEMA_VERSION = 4; // Bumped for better schema validation

class LocalDatabase {
  private db: IDBPDatabase<KisanDB> | null = null;

  async initialize(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<KisanDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        console.log(`📦 [LocalDB] Upgrading from version ${oldVersion} to ${newVersion}`);

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

        // Create or update scheduleTasks store
        if (!db.objectStoreNames.contains('scheduleTasks')) {
          const tasksStore = db.createObjectStore('scheduleTasks', { keyPath: 'id' });
          tasksStore.createIndex('by-schedule', 'schedule_id');
          tasksStore.createIndex('by-date', 'task_date');
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

        // Create syncMetadata store
        if (!db.objectStoreNames.contains('syncMetadata')) {
          db.createObjectStore('syncMetadata', { keyPath: 'key' });
        }
        
        console.log('✅ [LocalDB] Schema upgrade complete');
      },
    });

    // Initialize or validate sync metadata and schema version
    await this.validateSchemaVersion();
    
    console.log('✅ [LocalDB] Initialized with DB v', DB_VERSION, 'Schema v', SCHEMA_VERSION);
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
    if (tenantId) {
      return await this.db!.getAllFromIndex('farmers', 'by-tenant', tenantId);
    }
    return await this.db!.getAll('farmers');
  }

  async getFarmerById(id: string): Promise<FarmerData | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('farmers', id);
  }

  // ========== LAND OPERATIONS ==========

  async saveLand(land: Omit<LandData, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
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
    if (farmerId) {
      return await this.db!.getAllFromIndex('lands', 'by-farmer', farmerId);
    }
    if (tenantId) {
      return await this.db!.getAllFromIndex('lands', 'by-tenant', tenantId);
    }
    return await this.db!.getAll('lands');
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

  async getAllSchedules(): Promise<CropScheduleData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAll('cropSchedules');
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

  async getTasksBySchedule(scheduleId: string): Promise<ScheduleTaskData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('scheduleTasks', 'by-schedule', scheduleId);
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
    return await this.db!.getAllFromIndex('aiChatSessions', 'by-farmer', farmerId);
  }

  async getChatSessionsByLand(landId: string | null): Promise<AIChatSessionData[]> {
    if (!this.db) await this.initialize();
    if (landId) {
      return await this.db!.getAllFromIndex('aiChatSessions', 'by-land', landId);
    }
    return [];
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

  async getChatMessages(landId?: string | null): Promise<AIChatMessageData[]> {
    if (!this.db) await this.initialize();
    // Get all messages and filter if needed
    const allMessages = await this.db!.getAll('aiChatMessages');
    if (landId) {
      // Filter by land_context if available
      return allMessages.filter(m => m.land_context?.id === landId);
    }
    return allMessages;
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
    
    const tx = this.db!.transaction(
      ['farmers', 'lands', 'cropSchedules', 'scheduleTasks', 'aiChatSessions', 'aiChatMessages', 'crops', 'weather', 'farmerAlerts'],
      'readwrite'
    );
    
    await tx.objectStore('farmers').clear();
    await tx.objectStore('lands').clear();
    await tx.objectStore('cropSchedules').clear();
    await tx.objectStore('scheduleTasks').clear();
    await tx.objectStore('aiChatSessions').clear();
    await tx.objectStore('aiChatMessages').clear();
    await tx.objectStore('crops').clear();
    await tx.objectStore('weather').clear();
    await tx.objectStore('farmerAlerts').clear();
    
    await tx.done;

    // Reset pending changes counter
    await this.updateSyncMetadata({ 
      pendingChanges: 0,
      lastSyncTime: null
    });

    console.log('✅ [LocalDB] All data cleared');
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
}

export const localDB = new LocalDatabase();
