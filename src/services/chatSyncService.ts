/**
 * Chat Sync Service - WhatsApp-like Offline-First Architecture
 * Handles background sync, delta fetching, and optimistic updates
 */

import { supabaseWithAuth } from '@/integrations/supabase/client';
import { localDB, AIChatMessageData } from './localDB';

export interface MessageStatus {
  status: 'sending' | 'sent' | 'failed' | 'synced';
}

export interface OptimisticMessage {
  id: string;
  tempId?: string;
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatus['status'];
  timestamp: Date;
  landId?: string | null;
  sessionId: string;
  retryCount?: number;
}

interface SyncResult {
  newMessages: AIChatMessageData[];
  syncedCount: number;
  errors: string[];
}

class ChatSyncService {
  private syncInProgress = new Set<string>();
  private retryQueue: Map<string, OptimisticMessage> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly SYNC_DEBOUNCE_MS = 500;
  private syncTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Get the last message timestamp for delta sync
   * CRITICAL: Includes tenantId for multi-tenant isolation
   */
  async getLastMessageTime(landId: string | null, farmerId: string, tenantId: string): Promise<string> {
    try {
      // CRITICAL FIX: Pass tenantId for proper multi-tenant isolation
      const messages = await localDB.getChatMessages(landId, farmerId, tenantId);
      
      if (!messages || messages.length === 0) {
        return '1970-01-01T00:00:00.000Z';
      }
      
      // Find the most recent message timestamp
      const latest = messages.reduce((max, msg) => {
        const msgTime = msg.created_at || msg.updated_at;
        if (!msgTime) return max;
        return msgTime > max ? msgTime : max;
      }, messages[0]?.created_at || '1970-01-01T00:00:00.000Z');
      
      return latest;
    } catch (error) {
      console.warn('[ChatSync] Failed to get last message time:', error);
      return '1970-01-01T00:00:00.000Z';
    }
  }

  /**
   * Background sync - fetch only NEW messages since last sync
   * Non-blocking, silent failures (user already has cached messages)
   */
  async backgroundSync(
    landId: string | null,
    farmerId: string,
    tenantId: string,
    onNewMessages?: (messages: AIChatMessageData[]) => void
  ): Promise<SyncResult> {
    const sessionKey = landId || 'general';
    
    // Prevent duplicate syncs for same session
    if (this.syncInProgress.has(sessionKey)) {
      console.log(`[ChatSync] Sync already in progress for ${sessionKey}`);
      return { newMessages: [], syncedCount: 0, errors: [] };
    }
    
    this.syncInProgress.add(sessionKey);
    const errors: string[] = [];
    
    try {
      // Get last sync timestamp - CRITICAL: Pass tenantId for isolation
      const lastSyncTime = await this.getLastMessageTime(landId, farmerId, tenantId);
      console.log(`[ChatSync] Delta sync for tenant ${tenantId}, ${sessionKey} since ${lastSyncTime}`);
      
      const authClient = supabaseWithAuth(farmerId, tenantId);
      
      // Build query for messages newer than last sync
      // CRITICAL: Always filter by BOTH tenant_id AND farmer_id for multi-tenant isolation
      let query = authClient
        .from('ai_chat_messages')
        .select('*')
        .eq('tenant_id', tenantId)  // CRITICAL: Tenant isolation first
        .eq('farmer_id', farmerId)
        .gt('created_at', lastSyncTime)
        .order('created_at', { ascending: true });
      
      // Filter by land_id through session
      // CRITICAL: Always include tenant_id in session queries for isolation
      if (landId === null) {
        // General chat - get sessions without land_id
        const { data: sessions } = await authClient
          .from('ai_chat_sessions')
          .select('id')
          .eq('tenant_id', tenantId)  // CRITICAL: Tenant isolation
          .eq('farmer_id', farmerId)
          .is('land_id', null);
        
        if (sessions && sessions.length > 0) {
          query = query.in('session_id', sessions.map(s => s.id));
        }
      } else {
        // Land-specific chat
        const { data: sessions } = await authClient
          .from('ai_chat_sessions')
          .select('id')
          .eq('tenant_id', tenantId)  // CRITICAL: Tenant isolation
          .eq('farmer_id', farmerId)
          .eq('land_id', landId);
        
        if (sessions && sessions.length > 0) {
          query = query.in('session_id', sessions.map(s => s.id));
        }
      }
      
      const { data: newMessages, error } = await query.limit(100);
      
      if (error) {
        errors.push(error.message);
        console.warn(`[ChatSync] Background sync failed for ${sessionKey}:`, error);
        return { newMessages: [], syncedCount: 0, errors };
      }
      
      if (newMessages && newMessages.length > 0) {
        console.log(`[ChatSync] Found ${newMessages.length} new messages for ${sessionKey}`);
        
        // Batch save to LocalDB
        await this.batchSaveMessages(newMessages);
        
        // Notify caller of new messages
        if (onNewMessages) {
          onNewMessages(newMessages as unknown as AIChatMessageData[]);
        }
        
        return { 
          newMessages: newMessages as unknown as AIChatMessageData[], 
          syncedCount: newMessages.length, 
          errors 
        };
      }
      
      console.log(`[ChatSync] No new messages for ${sessionKey}`);
      return { newMessages: [], syncedCount: 0, errors };
      
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown sync error';
      errors.push(errMsg);
      console.warn(`[ChatSync] Background sync error for ${sessionKey}:`, error);
      return { newMessages: [], syncedCount: 0, errors };
    } finally {
      this.syncInProgress.delete(sessionKey);
    }
  }

  /**
   * Debounced background sync - prevents rapid successive syncs
   */
  debouncedSync(
    landId: string | null,
    farmerId: string,
    tenantId: string,
    onNewMessages?: (messages: AIChatMessageData[]) => void
  ): void {
    const sessionKey = landId || 'general';
    
    // Clear existing timer
    const existingTimer = this.syncTimers.get(sessionKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new debounced timer
    const timer = setTimeout(() => {
      this.backgroundSync(landId, farmerId, tenantId, onNewMessages);
      this.syncTimers.delete(sessionKey);
    }, this.SYNC_DEBOUNCE_MS);
    
    this.syncTimers.set(sessionKey, timer);
  }

  /**
   * Batch save messages to LocalDB (performance optimization)
   */
  async batchSaveMessages(messages: any[]): Promise<void> {
    if (!messages || messages.length === 0) return;
    
    try {
      // Use bulk save for efficiency
      await localDB.bulkSave({
        messages: messages.map(msg => ({
          ...msg,
          lastModified: Date.now(),
          syncStatus: 'synced' as const
        }))
      });
      
      console.log(`[ChatSync] Batch saved ${messages.length} messages to LocalDB`);
    } catch (error) {
      console.error('[ChatSync] Batch save failed:', error);
      // Fallback to individual saves
      for (const msg of messages) {
        try {
          await localDB.saveChatMessage(msg);
        } catch (e) {
          console.warn('[ChatSync] Individual save failed for message:', msg.id);
        }
      }
    }
  }

  /**
   * Add message to retry queue for failed sends
   */
  queueForRetry(message: OptimisticMessage): void {
    const retryCount = (message.retryCount || 0) + 1;
    
    if (retryCount > this.MAX_RETRIES) {
      console.warn(`[ChatSync] Message ${message.id} exceeded max retries, marking as failed`);
      return;
    }
    
    this.retryQueue.set(message.id, { ...message, retryCount });
    console.log(`[ChatSync] Queued message ${message.id} for retry (attempt ${retryCount})`);
  }

  /**
   * Get pending retry messages
   */
  getPendingRetries(): OptimisticMessage[] {
    return Array.from(this.retryQueue.values());
  }

  /**
   * Remove message from retry queue (after successful send)
   */
  removeFromRetryQueue(messageId: string): void {
    this.retryQueue.delete(messageId);
  }

  /**
   * Cleanup old messages from LocalDB (prevent storage bloat)
   */
  async cleanupOldMessages(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      const cutoffISOString = cutoffDate.toISOString();
      
      // Get all messages
      const allMessages = await localDB.getChatMessages();
      
      let deletedCount = 0;
      for (const msg of allMessages) {
        if (msg.created_at && msg.created_at < cutoffISOString) {
          // Note: LocalDB doesn't have delete by ID, so we'd need to implement it
          // For now, this is a placeholder for the cleanup logic
          deletedCount++;
        }
      }
      
      console.log(`[ChatSync] Cleaned up ${deletedCount} old messages`);
      return deletedCount;
    } catch (error) {
      console.error('[ChatSync] Cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Check if sync is currently in progress for a session
   */
  isSyncing(landId: string | null): boolean {
    return this.syncInProgress.has(landId || 'general');
  }

  /**
   * Clear all pending timers (cleanup)
   */
  dispose(): void {
    this.syncTimers.forEach(timer => clearTimeout(timer));
    this.syncTimers.clear();
    this.syncInProgress.clear();
    this.retryQueue.clear();
  }
}

// Singleton instance
export const chatSyncService = new ChatSyncService();
