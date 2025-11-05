import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface FarmerData {
  id: string;
  name: string;
  phone: string;
  address?: string;
  metadata?: any;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface LandData {
  id: string;
  farmer_id: string;
  name: string;
  area_acres: number;
  ownership_type: string;
  crops?: any[];
  boundary?: any;
  metadata?: any;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface ScheduleData {
  id: string;
  land_id: string;
  crop_id: string;
  tasks: any[];
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface ChatMessage {
  id: string;
  land_id: string | null;
  user_message: string;
  ai_response: string;
  timestamp: number;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface SyncMetadata {
  id?: string;
  lastSyncTime: number | null;
  pendingChanges: number;
  syncInProgress: boolean;
}

interface KisanDB extends DBSchema {
  farmers: {
    key: string;
    value: FarmerData;
    indexes: { 'by-sync-status': string };
  };
  lands: {
    key: string;
    value: LandData;
    indexes: { 'by-farmer': string; 'by-sync-status': string };
  };
  schedules: {
    key: string;
    value: ScheduleData;
    indexes: { 'by-land': string; 'by-sync-status': string };
  };
  chatMessages: {
    key: string;
    value: ChatMessage;
    indexes: { 'by-land': string | null; 'by-sync-status': string; 'by-timestamp': number };
  };
  syncMetadata: {
    key: string;
    value: SyncMetadata;
  };
}

class LocalDatabase {
  private db: IDBPDatabase<KisanDB> | null = null;
  private readonly DB_NAME = 'kisan-shakti-db';
  private readonly DB_VERSION = 2;

  async initialize(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<KisanDB>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db) {
        // Create farmers store
        if (!db.objectStoreNames.contains('farmers')) {
          const farmerStore = db.createObjectStore('farmers', { keyPath: 'id' });
          farmerStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create lands store
        if (!db.objectStoreNames.contains('lands')) {
          const landStore = db.createObjectStore('lands', { keyPath: 'id' });
          landStore.createIndex('by-farmer', 'farmer_id');
          landStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create schedules store
        if (!db.objectStoreNames.contains('schedules')) {
          const scheduleStore = db.createObjectStore('schedules', { keyPath: 'id' });
          scheduleStore.createIndex('by-land', 'land_id');
          scheduleStore.createIndex('by-sync-status', 'syncStatus');
        }

        // Create chat messages store
        if (!db.objectStoreNames.contains('chatMessages')) {
          const chatStore = db.createObjectStore('chatMessages', { keyPath: 'id' });
          chatStore.createIndex('by-land', 'land_id');
          chatStore.createIndex('by-sync-status', 'syncStatus');
          chatStore.createIndex('by-timestamp', 'timestamp');
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
        pendingChanges: 0,
        syncInProgress: false,
      });
    }
    await tx.done;
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

  async getFarmers(): Promise<FarmerData[]> {
    if (!this.db) await this.initialize();
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

  async getLands(): Promise<LandData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAll('lands');
  }

  async getLandsByFarmer(farmerId: string): Promise<LandData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('lands', 'by-farmer', farmerId);
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

  async getAllSchedules(): Promise<ScheduleData[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAll('schedules');
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

  async getChatMessages(landId?: string | null): Promise<ChatMessage[]> {
    if (!this.db) await this.initialize();
    if (landId) {
      return await this.db!.getAllFromIndex('chatMessages', 'by-land', landId);
    }
    // Get all messages sorted by timestamp
    const allMessages = await this.db!.getAll('chatMessages');
    return allMessages.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Get all pending changes
  async getPendingChanges(): Promise<{
    farmers: FarmerData[];
    lands: LandData[];
    schedules: ScheduleData[];
    chatMessages: ChatMessage[];
  }> {
    if (!this.db) await this.initialize();
    
    const [farmers, lands, schedules, chatMessages] = await Promise.all([
      this.db!.getAllFromIndex('farmers', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('lands', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('schedules', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('chatMessages', 'by-sync-status', 'pending'),
    ]);

    return { farmers, lands, schedules, chatMessages };
  }

  // Mark items as synced
  async markAsSynced(type: 'farmers' | 'lands' | 'schedules' | 'chatMessages', ids: string[]): Promise<void> {
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
      pendingChanges: 0,
      syncInProgress: false,
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
    const count = pending.farmers.length + pending.lands.length + pending.schedules.length + pending.chatMessages.length;
    await this.updateSyncMetadata({ pendingChanges: count });
  }

  // Clear all local data
  async clearAll(): Promise<void> {
    if (!this.db) await this.initialize();
    
    const tx = this.db!.transaction(['farmers', 'lands', 'schedules', 'chatMessages'], 'readwrite');
    await Promise.all([
      tx.objectStore('farmers').clear(),
      tx.objectStore('lands').clear(),
      tx.objectStore('schedules').clear(),
      tx.objectStore('chatMessages').clear(),
    ]);
    await tx.done;
    
    await this.updateSyncMetadata({
      lastSyncTime: null,
      pendingChanges: 0,
      syncInProgress: false,
    });
  }

  // Bulk save for sync
  async bulkSave(data: {
    farmers?: FarmerData[];
    lands?: LandData[];
    schedules?: ScheduleData[];
    chatMessages?: ChatMessage[];
  }): Promise<void> {
    if (!this.db) await this.initialize();

    const tx = this.db!.transaction(['farmers', 'lands', 'schedules', 'chatMessages'], 'readwrite');

    if (data.farmers) {
      const farmerStore = tx.objectStore('farmers');
      for (const farmer of data.farmers) {
        await farmerStore.put({
          ...farmer,
          syncStatus: 'synced',
        });
      }
    }

    if (data.lands) {
      const landStore = tx.objectStore('lands');
      for (const land of data.lands) {
        await landStore.put({
          ...land,
          syncStatus: 'synced',
        });
      }
    }

    if (data.schedules) {
      const scheduleStore = tx.objectStore('schedules');
      for (const schedule of data.schedules) {
        await scheduleStore.put({
          ...schedule,
          syncStatus: 'synced',
        });
      }
    }

    if (data.chatMessages) {
      const chatStore = tx.objectStore('chatMessages');
      for (const message of data.chatMessages) {
        await chatStore.put({
          ...message,
          syncStatus: 'synced',
        });
      }
    }

    await tx.done;
    await this.updatePendingCount();
  }
}

export const localDB = new LocalDatabase();
export type { FarmerData, LandData, ScheduleData, ChatMessage, SyncMetadata };