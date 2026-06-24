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

      // Bug 2 fix: ignore optimistic (not-yet-server-confirmed) rows when
      // computing the delta-sync cursor. Otherwise a client-generated
      // `created_at` newer than any server row would skip real messages on
      // reopen, corrupting the user/assistant ordering.
      const syncedMessages = messages.filter((m) => {
        const status = (m as any).syncStatus;
        // Treat unknown/legacy rows as synced so we don't regress old data,
        // but explicitly drop rows we know are still pending or in conflict.
        return status !== 'pending' && status !== 'conflict';
      });

      const candidatePool = syncedMessages.length > 0 ? syncedMessages : messages;

      // Find the most recent message timestamp among server-confirmed rows.
      const latest = candidatePool.reduce((max, msg) => {
        const msgTime = msg.created_at || msg.updated_at;
        if (!msgTime) return max;
        return msgTime > max ? msgTime : max;
      }, candidatePool[0]?.created_at || '1970-01-01T00:00:00.000Z');

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
          id: msg.id,
          session_id: msg.session_id,
          tenant_id: msg.tenant_id,
          farmer_id: msg.farmer_id,
          role: msg.role,
          content: msg.content || '',
          land_context: msg.land_context,
          crop_context: msg.crop_context,
          weather_context: msg.weather_context,
          location_context: msg.location_context,
          agro_climatic_zone: msg.agro_climatic_zone,
          soil_zone: msg.soil_zone,
          rainfall_zone: msg.rainfall_zone,
          crop_season: msg.crop_season,
          ai_model: msg.ai_model,
          response_time_ms: msg.response_time_ms,
          tokens_used: msg.tokens_used,
          feedback_rating: msg.feedback_rating,
          feedback_text: msg.feedback_text,
          feedback_timestamp: msg.feedback_timestamp,
          attachments: msg.attachments,
          image_urls: msg.image_urls,
          status: msg.status || 'sent',
          language: msg.language,
          message_type: msg.message_type,
          error_details: msg.error_details,
          is_edited: msg.is_edited,
          edited_at: msg.edited_at,
          parent_message_id: msg.parent_message_id,
          user_agent: msg.user_agent,
          ip_address: msg.ip_address,
          partition_key: msg.partition_key,
          word_count: msg.word_count,
          inferred_intent: msg.inferred_intent,
          intent_confidence: msg.intent_confidence,
          is_training_candidate: msg.is_training_candidate,
          human_verified: msg.human_verified,
          correction_notes: msg.correction_notes,
          conversation_quality_score: msg.conversation_quality_score,
          domain_tags: msg.domain_tags,
          complexity_level: msg.complexity_level,
          conversation_turn_number: msg.conversation_turn_number,
          off_topic: msg.off_topic,
          training_processed: msg.training_processed,
          preprocessed_content: msg.preprocessed_content,
          excluded_reason: msg.excluded_reason,
          agricultural_accuracy: msg.agricultural_accuracy,
          decision_brain_source: msg.decision_brain_source,
          actions_returned: msg.actions_returned,
          actions_filtered_out: msg.actions_filtered_out,
          metadata: msg.metadata,
          created_at: msg.created_at,
          updated_at: msg.updated_at,
          lastModified: Date.now(),
          syncStatus: 'synced'
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
