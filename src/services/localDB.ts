import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Core data interfaces matching online schema
interface FarmerData {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  address?: string;
  metadata?: any;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface LandData {
  id: string;
  tenant_id: string;
  farmer_id: string;
  name: string;
  area_acres: number;
  ownership_type: string;
  state?: string;
  district?: string;
  taluka?: string;
  village?: string;
  soil_type?: string;
  water_source?: string;
  irrigation_type?: string;
  crops?: any[];
  boundary?: any;
  metadata?: any;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface ScheduleData {
  id: string;
  tenant_id: string;
  farmer_id: string;
  land_id: string;
  crop_name: string;
  sowing_date: string;
  tasks: any[];
  generation_params?: any;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface ScheduleTask {
  id: string;
  tenant_id: string;
  schedule_id: string;
  task_name: string;
  task_type: string;
  scheduled_date: string;
  status: string;
  description?: string;
  metadata?: any;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface ChatSession {
  id: string;
  tenant_id: string;
  farmer_id: string;
  land_id?: string | null;
  title: string;
  context_summary?: string;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface ChatMessage {
  id: string;
  tenant_id: string;
  session_id: string;
  farmer_id: string;
  land_id?: string | null;
  user_message: string;
  ai_response: string;
  timestamp: number;
  metadata?: any;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface CropData {
  id: string;
  tenant_id: string;
  name_en: string;
  name_local?: string;
  crop_group_id?: string;
  category?: string;
  season?: string;
  metadata?: any;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface WeatherData {
  id: string;
  tenant_id: string;
  location: string;
  temperature: number;
  humidity?: number;
  rainfall?: number;
  wind_speed?: number;
  forecast_data?: any;
  timestamp: number;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface FarmerAlert {
  id: string;
  tenant_id: string;
  farmer_id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  is_read: boolean;
  metadata?: any;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface SyncMetadata {
  id?: string;
  lastSyncTime: number | null;
  lastSchemaCheck: number | null;
  pendingChanges: number;
  syncInProgress: boolean;
  schemaVersion: number;
}

interface KisanDB extends DBSchema {
  farmers: {
    key: string;
    value: FarmerData;
    indexes: { 
      'by-tenant': string;
      'by-sync-status': string;
    };
  };
  lands: {
    key: string;
    value: LandData;
    indexes: { 
      'by-tenant': string;
      'by-farmer': string; 
      'by-sync-status': string;
    };
  };
  schedules: {
    key: string;
    value: ScheduleData;
    indexes: { 
      'by-tenant': string;
      'by-land': string;
      'by-farmer': string;
      'by-sync-status': string;
    };
  };
  scheduleTasks: {
    key: string;
    value: ScheduleTask;
    indexes: { 
      'by-tenant': string;
      'by-schedule': string;
      'by-sync-status': string;
      'by-status': string;
    };
  };
  chatSessions: {
    key: string;
    value: ChatSession;
    indexes: { 
      'by-tenant': string;
      'by-farmer': string;
      'by-land': string | null;
      'by-sync-status': string;
    };
  };
  chatMessages: {
    key: string;
    value: ChatMessage;
    indexes: { 
      'by-tenant': string;
      'by-session': string;
      'by-farmer': string;
      'by-land': string | null; 
      'by-sync-status': string; 
      'by-timestamp': number;
    };
  };
  crops: {
    key: string;
    value: CropData;
    indexes: { 
      'by-tenant': string;
      'by-sync-status': string;
    };
  };
  weather: {
    key: string;
    value: WeatherData;
    indexes: { 
      'by-tenant': string;
      'by-location': string;
      'by-timestamp': number;
    };
  };
  farmerAlerts: {
    key: string;
    value: FarmerAlert;
    indexes: { 
      'by-tenant': string;
      'by-farmer': string;
      'by-sync-status': string;
      'by-read-status': string;
    };
  };
  syncMetadata: {
    key: string;
    value: SyncMetadata;
  };
}

class LocalDatabase {
  private db: IDBPDatabase<KisanDB> | null = null;
  private readonly DB_NAME = 'kisan-shakti-db';
  private readonly DB_VERSION = 3;
  private readonly SCHEMA_VERSION = 1;

  async initialize(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<KisanDB>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db, oldVersion) {
        // Create farmers store with tenant isolation
        if (!db.objectStoreNames.contains('farmers')) {
          const farmerStore = db.createObjectStore('farmers', { keyPath: 'id' });
          farmerStore.createIndex('by-tenant', 'tenant_id');
          farmerStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create lands store with tenant isolation
        if (!db.objectStoreNames.contains('lands')) {
          const landStore = db.createObjectStore('lands', { keyPath: 'id' });
          landStore.createIndex('by-tenant', 'tenant_id');
          landStore.createIndex('by-farmer', 'farmer_id');
          landStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create schedules store with tenant isolation
        if (!db.objectStoreNames.contains('schedules')) {
          const scheduleStore = db.createObjectStore('schedules', { keyPath: 'id' });
          scheduleStore.createIndex('by-tenant', 'tenant_id');
          scheduleStore.createIndex('by-land', 'land_id');
          scheduleStore.createIndex('by-farmer', 'farmer_id');
          scheduleStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create schedule tasks store
        if (!db.objectStoreNames.contains('scheduleTasks')) {
          const taskStore = db.createObjectStore('scheduleTasks', { keyPath: 'id' });
          taskStore.createIndex('by-tenant', 'tenant_id');
          taskStore.createIndex('by-schedule', 'schedule_id');
          taskStore.createIndex('by-sync-status', 'syncStatus');
          taskStore.createIndex('by-status', 'status');
        }

        // Create chat sessions store
        if (!db.objectStoreNames.contains('chatSessions')) {
          const sessionStore = db.createObjectStore('chatSessions', { keyPath: 'id' });
          sessionStore.createIndex('by-tenant', 'tenant_id');
          sessionStore.createIndex('by-farmer', 'farmer_id');
          sessionStore.createIndex('by-land', 'land_id');
          sessionStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create chat messages store with tenant isolation
        if (!db.objectStoreNames.contains('chatMessages')) {
          const chatStore = db.createObjectStore('chatMessages', { keyPath: 'id' });
          chatStore.createIndex('by-tenant', 'tenant_id');
          chatStore.createIndex('by-session', 'session_id');
          chatStore.createIndex('by-farmer', 'farmer_id');
          chatStore.createIndex('by-land', 'land_id');
          chatStore.createIndex('by-sync-status', 'syncStatus');
          chatStore.createIndex('by-timestamp', 'timestamp');
        }

        // Create crops store
        if (!db.objectStoreNames.contains('crops')) {
          const cropStore = db.createObjectStore('crops', { keyPath: 'id' });
          cropStore.createIndex('by-tenant', 'tenant_id');
          cropStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create weather store
        if (!db.objectStoreNames.contains('weather')) {
          const weatherStore = db.createObjectStore('weather', { keyPath: 'id' });
          weatherStore.createIndex('by-tenant', 'tenant_id');
          weatherStore.createIndex('by-location', 'location');
          weatherStore.createIndex('by-timestamp', 'timestamp');
        }

        // Create farmer alerts store
        if (!db.objectStoreNames.contains('farmerAlerts')) {
          const alertStore = db.createObjectStore('farmerAlerts', { keyPath: 'id' });
          alertStore.createIndex('by-tenant', 'tenant_id');
          alertStore.createIndex('by-farmer', 'farmer_id');
          alertStore.createIndex('by-sync-status', 'syncStatus');
          alertStore.createIndex('by-read-status', 'is_read');
        }

        // Create sync metadata store
        if (!db.objectStoreNames.contains('syncMetadata')) {
          db.createObjectStore('syncMetadata', { keyPath: 'id' });
        }
      },
    });

    // Initialize sync metadata if not exists
    const tx = this.db.transaction('syncMetadata', 'readwrite');
    const existing = await tx.objectStore('syncMetadata').get('main');
    if (!existing) {
      await tx.objectStore('syncMetadata').put({
        id: 'main',
        lastSyncTime: null,
        lastSchemaCheck: null,
        pendingChanges: 0,
        syncInProgress: false,
        schemaVersion: this.SCHEMA_VERSION,
      });
    }
    await tx.done;
  }

  // Get data filtered by tenant
  private getTenantFilter(tenantId?: string) {
    return tenantId || '';
  }

  // Farmer operations
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

  // Land operations
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

  // Schedule operations
  async saveSchedule(schedule: Omit<ScheduleData, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: ScheduleData = {
      ...schedule,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('schedules', data);
    await this.updatePendingCount();
  }

  async getSchedulesByLand(landId: string): Promise<ScheduleData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('schedules', 'by-land', landId);
  }

  async getAllSchedules(tenantId?: string, farmerId?: string): Promise<ScheduleData[]> {
    if (!this.db) await this.initialize();
    if (farmerId) {
      return await this.db!.getAllFromIndex('schedules', 'by-farmer', farmerId);
    }
    if (tenantId) {
      return await this.db!.getAllFromIndex('schedules', 'by-tenant', tenantId);
    }
    return await this.db!.getAll('schedules');
  }

  async getScheduleById(id: string): Promise<ScheduleData | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('schedules', id);
  }

  // Schedule Task operations
  async saveScheduleTask(task: Omit<ScheduleTask, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: ScheduleTask = {
      ...task,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('scheduleTasks', data);
    await this.updatePendingCount();
  }

  async getTasksBySchedule(scheduleId: string): Promise<ScheduleTask[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('scheduleTasks', 'by-schedule', scheduleId);
  }

  async getAllScheduleTasks(tenantId?: string): Promise<ScheduleTask[]> {
    if (!this.db) await this.initialize();
    if (tenantId) {
      return await this.db!.getAllFromIndex('scheduleTasks', 'by-tenant', tenantId);
    }
    return await this.db!.getAll('scheduleTasks');
  }

  // Chat Session operations
  async saveChatSession(session: Omit<ChatSession, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: ChatSession = {
      ...session,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('chatSessions', data);
    await this.updatePendingCount();
  }

  async getChatSessions(tenantId?: string, farmerId?: string): Promise<ChatSession[]> {
    if (!this.db) await this.initialize();
    if (farmerId) {
      return await this.db!.getAllFromIndex('chatSessions', 'by-farmer', farmerId);
    }
    if (tenantId) {
      return await this.db!.getAllFromIndex('chatSessions', 'by-tenant', tenantId);
    }
    return await this.db!.getAll('chatSessions');
  }

  async getChatSessionById(id: string): Promise<ChatSession | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('chatSessions', id);
  }

  // Chat message operations
  async saveChatMessage(message: Omit<ChatMessage, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: ChatMessage = {
      ...message,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('chatMessages', data);
    await this.updatePendingCount();
  }

  async getChatMessages(sessionId?: string, farmerId?: string, tenantId?: string): Promise<ChatMessage[]> {
    if (!this.db) await this.initialize();
    if (sessionId) {
      const messages = await this.db!.getAllFromIndex('chatMessages', 'by-session', sessionId);
      return messages.sort((a, b) => a.timestamp - b.timestamp);
    }
    if (farmerId) {
      const messages = await this.db!.getAllFromIndex('chatMessages', 'by-farmer', farmerId);
      return messages.sort((a, b) => a.timestamp - b.timestamp);
    }
    if (tenantId) {
      const messages = await this.db!.getAllFromIndex('chatMessages', 'by-tenant', tenantId);
      return messages.sort((a, b) => a.timestamp - b.timestamp);
    }
    const allMessages = await this.db!.getAll('chatMessages');
    return allMessages.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Crop operations
  async saveCrop(crop: Omit<CropData, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: CropData = {
      ...crop,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('crops', data);
  }

  async getCrops(tenantId?: string): Promise<CropData[]> {
    if (!this.db) await this.initialize();
    if (tenantId) {
      return await this.db!.getAllFromIndex('crops', 'by-tenant', tenantId);
    }
    return await this.db!.getAll('crops');
  }

  // Weather operations
  async saveWeather(weather: Omit<WeatherData, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: WeatherData = {
      ...weather,
      lastModified: Date.now(),
      syncStatus: 'synced', // Weather data doesn't need to be synced back
    };
    await this.db!.put('weather', data);
  }

  async getWeatherByLocation(location: string, tenantId?: string): Promise<WeatherData[]> {
    if (!this.db) await this.initialize();
    const allWeather = await this.db!.getAllFromIndex('weather', 'by-location', location);
    if (tenantId) {
      return allWeather.filter(w => w.tenant_id === tenantId);
    }
    return allWeather;
  }

  // Farmer Alerts operations
  async saveFarmerAlert(alert: Omit<FarmerAlert, 'lastModified' | 'syncStatus'>): Promise<void> {
    if (!this.db) await this.initialize();
    const data: FarmerAlert = {
      ...alert,
      lastModified: Date.now(),
      syncStatus: 'pending',
    };
    await this.db!.put('farmerAlerts', data);
    await this.updatePendingCount();
  }

  async getFarmerAlerts(farmerId?: string, tenantId?: string): Promise<FarmerAlert[]> {
    if (!this.db) await this.initialize();
    if (farmerId) {
      return await this.db!.getAllFromIndex('farmerAlerts', 'by-farmer', farmerId);
    }
    if (tenantId) {
      return await this.db!.getAllFromIndex('farmerAlerts', 'by-tenant', tenantId);
    }
    return await this.db!.getAll('farmerAlerts');
  }

  // Get all pending changes
  async getPendingChanges(): Promise<{
    farmers: FarmerData[];
    lands: LandData[];
    schedules: ScheduleData[];
    scheduleTasks: ScheduleTask[];
    chatSessions: ChatSession[];
    chatMessages: ChatMessage[];
    farmerAlerts: FarmerAlert[];
  }> {
    if (!this.db) await this.initialize();
    
    const [farmers, lands, schedules, scheduleTasks, chatSessions, chatMessages, farmerAlerts] = await Promise.all([
      this.db!.getAllFromIndex('farmers', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('lands', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('schedules', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('scheduleTasks', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('chatSessions', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('chatMessages', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('farmerAlerts', 'by-sync-status', 'pending'),
    ]);

    return { farmers, lands, schedules, scheduleTasks, chatSessions, chatMessages, farmerAlerts };
  }

  // Mark items as synced
  async markAsSynced(
    type: 'farmers' | 'lands' | 'schedules' | 'scheduleTasks' | 'chatSessions' | 'chatMessages' | 'farmerAlerts', 
    ids: string[]
  ): Promise<void> {
    if (!this.db) await this.initialize();
    
    const tx = this.db!.transaction(type, 'readwrite');
    const store = tx.objectStore(type);
    
    for (const id of ids) {
      const item = await store.get(id);
      if (item) {
        item.syncStatus = 'synced';
        await store.put(item);
      }
    }
    
    await tx.done;
    await this.updatePendingCount();
  }

  // Sync metadata operations
  async getSyncMetadata(): Promise<SyncMetadata> {
    if (!this.db) await this.initialize();
    const data = await this.db!.get('syncMetadata', 'main');
    return data || {
      id: 'main',
      lastSyncTime: null,
      lastSchemaCheck: null,
      pendingChanges: 0,
      syncInProgress: false,
      schemaVersion: this.SCHEMA_VERSION,
    };
  }

  async updateSyncMetadata(updates: Partial<SyncMetadata>): Promise<void> {
    if (!this.db) await this.initialize();
    const current = await this.getSyncMetadata();
    await this.db!.put('syncMetadata', {
      ...current,
      ...updates,
      id: 'main',
    });
  }

  private async updatePendingCount(): Promise<void> {
    const pending = await this.getPendingChanges();
    const count = 
      pending.farmers.length + 
      pending.lands.length + 
      pending.schedules.length + 
      pending.scheduleTasks.length +
      pending.chatSessions.length +
      pending.chatMessages.length +
      pending.farmerAlerts.length;
    await this.updateSyncMetadata({ pendingChanges: count });
  }

  // Clear all local data (preserves sync metadata)
  async clearAll(): Promise<void> {
    if (!this.db) await this.initialize();
    
    const tx = this.db!.transaction([
      'farmers', 
      'lands', 
      'schedules', 
      'scheduleTasks',
      'chatSessions',
      'chatMessages',
      'crops',
      'weather',
      'farmerAlerts'
    ], 'readwrite');
    
    await Promise.all([
      tx.objectStore('farmers').clear(),
      tx.objectStore('lands').clear(),
      tx.objectStore('schedules').clear(),
      tx.objectStore('scheduleTasks').clear(),
      tx.objectStore('chatSessions').clear(),
      tx.objectStore('chatMessages').clear(),
      tx.objectStore('crops').clear(),
      tx.objectStore('weather').clear(),
      tx.objectStore('farmerAlerts').clear(),
    ]);
    await tx.done;
    
    await this.updateSyncMetadata({
      lastSyncTime: null,
      lastSchemaCheck: null,
      pendingChanges: 0,
      syncInProgress: false,
    });
  }

  // Bulk save for sync with tenant isolation
  async bulkSave(data: {
    farmers?: FarmerData[];
    lands?: LandData[];
    schedules?: ScheduleData[];
    scheduleTasks?: ScheduleTask[];
    chatSessions?: ChatSession[];
    chatMessages?: ChatMessage[];
    crops?: CropData[];
    weather?: WeatherData[];
    farmerAlerts?: FarmerAlert[];
  }): Promise<void> {
    if (!this.db) await this.initialize();

    const stores: ('farmers' | 'lands' | 'schedules' | 'scheduleTasks' | 'chatSessions' | 'chatMessages' | 'crops' | 'weather' | 'farmerAlerts')[] = [
      'farmers', 
      'lands', 
      'schedules', 
      'scheduleTasks',
      'chatSessions',
      'chatMessages',
      'crops',
      'weather',
      'farmerAlerts'
    ];

    const tx = this.db!.transaction(stores, 'readwrite');

    if (data.farmers) {
      const farmerStore = tx.objectStore('farmers');
      for (const farmer of data.farmers) {
        await farmerStore.put({ ...farmer, syncStatus: 'synced' });
      }
    }

    if (data.lands) {
      const landStore = tx.objectStore('lands');
      for (const land of data.lands) {
        await landStore.put({ ...land, syncStatus: 'synced' });
      }
    }

    if (data.schedules) {
      const scheduleStore = tx.objectStore('schedules');
      for (const schedule of data.schedules) {
        await scheduleStore.put({ ...schedule, syncStatus: 'synced' });
      }
    }

    if (data.scheduleTasks) {
      const taskStore = tx.objectStore('scheduleTasks');
      for (const task of data.scheduleTasks) {
        await taskStore.put({ ...task, syncStatus: 'synced' });
      }
    }

    if (data.chatSessions) {
      const sessionStore = tx.objectStore('chatSessions');
      for (const session of data.chatSessions) {
        await sessionStore.put({ ...session, syncStatus: 'synced' });
      }
    }

    if (data.chatMessages) {
      const chatStore = tx.objectStore('chatMessages');
      for (const message of data.chatMessages) {
        await chatStore.put({ ...message, syncStatus: 'synced' });
      }
    }

    if (data.crops) {
      const cropStore = tx.objectStore('crops');
      for (const crop of data.crops) {
        await cropStore.put({ ...crop, syncStatus: 'synced' });
      }
    }

    if (data.weather) {
      const weatherStore = tx.objectStore('weather');
      for (const weather of data.weather) {
        await weatherStore.put({ ...weather, syncStatus: 'synced' });
      }
    }

    if (data.farmerAlerts) {
      const alertStore = tx.objectStore('farmerAlerts');
      for (const alert of data.farmerAlerts) {
        await alertStore.put({ ...alert, syncStatus: 'synced' });
      }
    }

    await tx.done;
    await this.updatePendingCount();
  }
}

export const localDB = new LocalDatabase();
export type { 
  FarmerData, 
  LandData, 
  ScheduleData, 
  ScheduleTask,
  ChatSession,
  ChatMessage, 
  CropData,
  WeatherData,
  FarmerAlert,
  SyncMetadata 
};