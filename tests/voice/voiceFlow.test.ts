/**
 * E2E Voice Flow Tests
 * Tests complete voice interaction flows from speech to action
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VoiceService } from '@/services/voice/voiceService';
import { DialogManager } from '@/services/voice/DialogManager';
import { ActionHandler } from '@/services/voice/ActionHandler';
import { VoiceConfig } from '@/services/voice/types';

// Mock dependencies
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

describe('Voice Flow E2E Tests', () => {
  let voiceService: VoiceService;
  let dialogManager: DialogManager;
  let actionHandler: ActionHandler;
  const mockConfig: VoiceConfig = {
    language: 'en',
    asrProvider: 'browser',
    ttsProvider: 'browser',
    privacyMode: 'local',
    telemetryEnabled: false,
  };

  beforeEach(() => {
    voiceService = new VoiceService(mockConfig, 'test-tenant');
    dialogManager = voiceService.getDialogManager();
    actionHandler = new ActionHandler(vi.fn(), dialogManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Navigation Flow', () => {
    it('should navigate to home on "go home" command', async () => {
      const transcript = 'go home';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('navigate.home');
      expect(utterance?.confidence).toBeGreaterThan(0.6);
    });

    it('should navigate to lands page on "show my lands" command', async () => {
      const transcript = 'show my lands';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('navigate.lands');
    });

    it('should handle back navigation', async () => {
      const transcript = 'go back';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('navigate.back');
    });
  });

  describe('CRUD Flow', () => {
    it('should recognize create land intent', async () => {
      const transcript = 'add new land';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('crud.create_land');
    });

    it('should extract land name from create command', async () => {
      const transcript = 'create land named "North Field"';
      const slotExtractor = voiceService.getSlotExtractor();
      const landName = slotExtractor.extractLandName(transcript);

      expect(landName).toBe('North Field');
    });

    it('should recognize delete intent and require confirmation', async () => {
      const transcript = 'delete this land';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('crud.delete_land');

      // Check if confirmation is required
      const requiresConfirmation = dialogManager.shouldRequireConfirmation(utterance!.intent);
      expect(requiresConfirmation).toBe(true);
    });
  });

  describe('Form Interaction Flow', () => {
    it('should navigate to next field', async () => {
      const transcript = 'next field';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('form.next_field');
    });

    it('should save form on "save" command', async () => {
      const transcript = 'save';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('form.save');
    });

    it('should cancel form on "cancel" command', async () => {
      const transcript = 'cancel';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('form.cancel');
    });
  });

  describe('Confirmation Flow', () => {
    it('should handle confirmation dialog', async () => {
      // Set up a pending confirmation
      dialogManager.setPendingConfirmation({
        action: 'delete',
        intent: 'crud.delete_land',
        slots: { landId: '123' },
        prompt: 'Are you sure you want to delete this land?',
      });

      // User says "yes"
      const transcript = 'yes';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('confirm.yes');

      const confirmation = dialogManager.getPendingConfirmation();
      expect(confirmation).not.toBeNull();
      expect(confirmation?.action).toBe('delete');
    });

    it('should handle confirmation rejection', async () => {
      dialogManager.setPendingConfirmation({
        action: 'delete',
        intent: 'crud.delete_land',
        slots: { landId: '123' },
        prompt: 'Are you sure?',
      });

      const transcript = 'no';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('confirm.no');
    });
  });

  describe('Multi-turn Conversation', () => {
    it('should track conversation history', () => {
      dialogManager.addTurn({
        timestamp: Date.now(),
        userInput: 'go home',
        intent: 'navigate.home',
        slots: {},
        response: 'Opening home',
        success: true,
      });

      const history = dialogManager.getConversationHistory();
      expect(history).toHaveLength(1);
      expect(history[0].intent).toBe('navigate.home');
    });

    it('should handle corrections', () => {
      // User says something
      dialogManager.addTurn({
        timestamp: Date.now(),
        userInput: 'delete land 123',
        intent: 'crud.delete_land',
        slots: { landId: '123' },
        response: 'Deleting land 123',
        success: true,
      });

      // User corrects
      const correction = dialogManager.handleCorrection('no not that one');
      expect(correction).not.toBeNull();
      expect(correction?.type).toBe('action');
    });
  });

  describe('Undo Flow', () => {
    it('should track undo actions', () => {
      dialogManager.pushUndoAction({
        timestamp: Date.now(),
        action: 'delete',
        intent: 'crud.delete_land',
        previousState: { landId: '123', name: 'Test Land' },
        description: 'Deleted land "Test Land"',
      });

      expect(dialogManager.canUndo()).toBe(true);
      
      const lastAction = dialogManager.getLastUndoAction();
      expect(lastAction).not.toBeNull();
      expect(lastAction?.action).toBe('delete');
    });

    it('should pop undo action when executed', () => {
      dialogManager.pushUndoAction({
        timestamp: Date.now(),
        action: 'create',
        intent: 'crud.create_land',
        previousState: {},
        description: 'Created land',
      });

      const action = dialogManager.popUndoAction();
      expect(action).not.toBeNull();
      expect(dialogManager.canUndo()).toBe(false);
    });
  });

  describe('Offline Mode', () => {
    it('should match intents offline with offline-enabled intents', () => {
      const transcript = 'go home';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, true);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('navigate.home');
    });

    it('should not match online-only intents when offline', () => {
      const transcript = 'open chat';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, true);

      // Chat requires online, should not match in offline mode
      expect(utterance).toBeNull();
    });
  });

  describe('Help Commands', () => {
    it('should recognize help request', async () => {
      const transcript = 'help';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('help.examples');
    });

    it('should recognize repeat request', async () => {
      const transcript = 'repeat that';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).not.toBeNull();
      expect(utterance?.intent).toBe('help.repeat');
    });
  });

  describe('Error Handling', () => {
    it('should handle low confidence gracefully', () => {
      const transcript = 'xyz123 undefined command';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      // Should return null for unrecognized commands
      expect(utterance).toBeNull();
    });

    it('should handle empty transcript', () => {
      const transcript = '';
      const utterance = voiceService.getIntentMatcher().matchIntent(transcript, false);

      expect(utterance).toBeNull();
    });
  });
});
