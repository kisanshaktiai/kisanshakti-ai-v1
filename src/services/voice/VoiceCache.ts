/**
 * VoiceCache - Caching layer for voice intents and responses
 * Reduces latency and enables offline operation
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
  expiresAt: number;
}

export interface CacheConfig {
  maxSize: number; // Maximum number of entries
  defaultTTL: number; // Default time-to-live in ms
  enablePersistence: boolean; // Store to localStorage
  storageKey: string;
}

export class VoiceCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private config: CacheConfig;
  private accessLog: Map<string, number[]> = new Map(); // For LRU tracking

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxSize: 500,
      defaultTTL: 3600000, // 1 hour
      enablePersistence: true,
      storageKey: 'voice_cache',
      ...config,
    };

    if (this.config.enablePersistence) {
      this.loadFromStorage();
    }
  }

  /**
   * Get cached data
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.persistIfEnabled();
      return null;
    }

    // Update hit count and access time
    entry.hits++;
    this.trackAccess(key);

    return entry.data as T;
  }

  /**
   * Set cached data
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // Evict if cache is full
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const expiresAt = Date.now() + (ttl || this.config.defaultTTL);

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      hits: 0,
      expiresAt,
    });

    this.trackAccess(key);
    this.persistIfEnabled();
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete cached entry
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.accessLog.delete(key);
      this.persistIfEnabled();
    }
    return deleted;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.accessLog.clear();
    this.persistIfEnabled();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hitRate: number;
    avgHits: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    if (this.cache.size === 0) {
      return {
        size: 0,
        hitRate: 0,
        avgHits: 0,
        oldestEntry: null,
        newestEntry: null,
      };
    }

    let totalHits = 0;
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;

    this.cache.forEach(entry => {
      totalHits += entry.hits;
      if (entry.timestamp < oldestTimestamp) oldestTimestamp = entry.timestamp;
      if (entry.timestamp > newestTimestamp) newestTimestamp = entry.timestamp;
    });

    return {
      size: this.cache.size,
      hitRate: totalHits / this.cache.size,
      avgHits: totalHits / this.cache.size,
      oldestEntry: oldestTimestamp === Infinity ? null : oldestTimestamp,
      newestEntry: newestTimestamp,
    };
  }

  /**
   * Preload commonly used intents
   */
  preloadIntents(intents: Array<{ id: string; data: any }>): void {
    console.log(`[VoiceCache] Preloading ${intents.length} intents`);
    intents.forEach(intent => {
      this.set(`intent:${intent.id}`, intent.data, this.config.defaultTTL * 2); // Double TTL for preloaded
    });
  }

  /**
   * Get popular entries for analytics
   */
  getPopularEntries(limit: number = 10): Array<{ key: string; hits: number }> {
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, hits: entry.hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);

    return entries;
  }

  // ============ Private Methods ============

  private trackAccess(key: string): void {
    if (!this.accessLog.has(key)) {
      this.accessLog.set(key, []);
    }
    this.accessLog.get(key)!.push(Date.now());

    // Keep only last 10 access times
    const accesses = this.accessLog.get(key)!;
    if (accesses.length > 10) {
      this.accessLog.set(key, accesses.slice(-10));
    }
  }

  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    this.accessLog.forEach((times, key) => {
      const lastAccess = times[times.length - 1] || 0;
      if (lastAccess < lruTime) {
        lruTime = lastAccess;
        lruKey = key;
      }
    });

    if (lruKey) {
      console.log('[VoiceCache] Evicting LRU entry:', lruKey);
      this.cache.delete(lruKey);
      this.accessLog.delete(lruKey);
    }
  }

  private persistIfEnabled(): void {
    if (!this.config.enablePersistence) return;

    try {
      // Only persist non-expired entries
      const persistData = Array.from(this.cache.entries())
        .filter(([_, entry]) => Date.now() < entry.expiresAt)
        .map(([key, entry]) => [key, entry]);

      localStorage.setItem(
        this.config.storageKey,
        JSON.stringify(Object.fromEntries(persistData))
      );
    } catch (error) {
      console.error('[VoiceCache] Failed to persist:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (!stored) return;

      const data = JSON.parse(stored);
      const now = Date.now();

      Object.entries(data).forEach(([key, entry]) => {
        const cacheEntry = entry as CacheEntry<any>;
        // Only load non-expired entries
        if (now < cacheEntry.expiresAt) {
          this.cache.set(key, cacheEntry);
        }
      });

      console.log(`[VoiceCache] Loaded ${this.cache.size} entries from storage`);
    } catch (error) {
      console.error('[VoiceCache] Failed to load from storage:', error);
    }
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;

    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.accessLog.delete(key);
        removed++;
      }
    });

    if (removed > 0) {
      console.log(`[VoiceCache] Cleaned up ${removed} expired entries`);
      this.persistIfEnabled();
    }
  }
}

// Global cache instance
export const voiceCache = new VoiceCache();
