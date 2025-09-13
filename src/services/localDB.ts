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
  syncMetadata: {
    key: string;
    value: SyncMetadata;
  };
}

class LocalDatabase {
  private db: IDBPDatabase<KisanDB> | null = null;
  private readonly DB_NAME = 'kisan-shakti-db';
  private readonly DB_VERSION = 1;

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

  // Get all pending changes
  async getPendingChanges(): Promise<{
    farmers: FarmerData[];
    lands: LandData[];
    schedules: ScheduleData[];
  }> {
    if (!this.db) await this.initialize();
    
    const [farmers, lands, schedules] = await Promise.all([
      this.db!.getAllFromIndex('farmers', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('lands', 'by-sync-status', 'pending'),
      this.db!.getAllFromIndex('schedules', 'by-sync-status', 'pending'),
    ]);

    return { farmers, lands, schedules };
  }

  // Mark items as synced
  async markAsSynced(type: 'farmers' | 'lands' | 'schedules', ids: string[]): Promise<void> {
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
    const count = pending.farmers.length + pending.lands.length + pending.schedules.length;
    await this.updateSyncMetadata({ pendingChanges: count });
  }

  // Clear all local data
  async clearAll(): Promise<void> {
    if (!this.db) await this.initialize();
    
    const tx = this.db!.transaction(['farmers', 'lands', 'schedules'], 'readwrite');
    await Promise.all([
      tx.objectStore('farmers').clear(),
      tx.objectStore('lands').clear(),
      tx.objectStore('schedules').clear(),
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
  }): Promise<void> {
    if (!this.db) await this.initialize();

    const tx = this.db!.transaction(['farmers', 'lands', 'schedules'], 'readwrite');

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

    await tx.done;
    await this.updatePendingCount();
  }
}

export const localDB = new LocalDatabase();
export type { FarmerData, LandData, ScheduleData, SyncMetadata };