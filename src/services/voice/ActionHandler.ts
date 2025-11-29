/**
 * ActionHandler - Executes voice command actions
 * Handles navigation, CRUD operations, form actions, and confirmations
 */

import { VoiceIntent, VoiceUtterance } from './types';
import { DialogManager, UndoAction } from './DialogManager';
import { toast } from '@/hooks/use-toast';

export interface ActionContext {
  navigate: (route: string) => void;
  goBack: () => void;
  onUIAction?: (action: string, params?: any) => void;
  onFormAction?: (action: string, params?: any) => void;
  onCRUDAction?: (action: string, entity: string, params?: any) => Promise<any>;
  speak?: (text: string) => Promise<void>;
  language: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  data?: any;
}

export class ActionHandler {
  private dialogManager: DialogManager;
  private context: ActionContext;

  constructor(dialogManager: DialogManager, context: ActionContext) {
    this.dialogManager = dialogManager;
    this.context = context;
  }

  updateContext(context: Partial<ActionContext>): void {
    this.context = { ...this.context, ...context };
  }

  async executeIntent(utterance: VoiceUtterance, intent: VoiceIntent): Promise<ActionResult> {
    console.log('[ActionHandler] Executing intent:', intent.id, 'with slots:', utterance.slots);

    // Check for pending confirmation first
    const pendingConfirmation = this.dialogManager.getPendingConfirmation();
    if (pendingConfirmation) {
      const confirmType = this.dialogManager.isConfirmationIntent(intent.id);
      if (confirmType) {
        return this.handleConfirmation(confirmType, pendingConfirmation);
      }
    }

    // Resolve references in slots (e.g., "that", "this", "last")
    const resolvedSlots = this.dialogManager.resolveReferences(utterance.text, utterance.slots);

    // Route to appropriate handler based on action type
    switch (intent.action) {
      case 'navigate':
        return this.handleNavigation(intent, resolvedSlots);
      
      case 'back':
        return this.handleBack();
      
      case 'ui_action':
        return this.handleUIAction(intent, resolvedSlots);
      
      case 'form_action':
        return this.handleFormAction(intent, resolvedSlots);
      
      case 'create':
      case 'edit':
      case 'delete':
        return this.handleCRUD(intent, resolvedSlots);
      
      case 'confirm':
        return this.handleDirectConfirmation(intent, resolvedSlots);
      
      case 'undo':
        return this.handleUndo();
      
      case 'help':
        return this.handleHelp(intent, resolvedSlots);
      
      case 'accessibility':
        return this.handleAccessibility(intent, resolvedSlots);
      
      case 'emergency':
        return this.handleEmergency(intent, resolvedSlots);
      
      default:
        return {
          success: false,
          message: 'Unknown action type',
        };
    }
  }

  // ============ Navigation ============

  private async handleNavigation(intent: VoiceIntent, slots: Record<string, any>): Promise<ActionResult> {
    if (!intent.route) {
      return { success: false, message: 'No route specified' };
    }

    try {
      // Update dialog context
      this.dialogManager.updateRoute(intent.route);

      // Speak announcement
      if (this.context.speak) {
        const routeName = intent.id.split('.')[1] || 'page';
        const message = this.getLocalizedMessage('opening', { name: routeName });
        await this.context.speak(message);
      }

      // Navigate
      this.context.navigate(intent.route);

      return {
        success: true,
        message: `Navigated to ${intent.route}`,
      };
    } catch (error) {
      console.error('[ActionHandler] Navigation error:', error);
      return {
        success: false,
        message: 'Navigation failed',
      };
    }
  }

  private async handleBack(): Promise<ActionResult> {
    try {
      this.context.goBack();
      
      if (this.context.speak) {
        await this.context.speak(this.getLocalizedMessage('going_back'));
      }

      return { success: true, message: 'Went back' };
    } catch (error) {
      return { success: false, message: 'Cannot go back' };
    }
  }

  // ============ UI Actions ============

  private async handleUIAction(intent: VoiceIntent, slots: Record<string, any>): Promise<ActionResult> {
    const action = intent.params?.action;
    if (!action) {
      return { success: false, message: 'No UI action specified' };
    }

    if (this.context.onUIAction) {
      try {
        this.context.onUIAction(action, slots);
        return { success: true, message: `UI action ${action} executed` };
      } catch (error) {
        return { success: false, message: `UI action ${action} failed` };
      }
    }

    return { success: false, message: 'UI action handler not configured' };
  }

  // ============ Form Actions ============

  private async handleFormAction(intent: VoiceIntent, slots: Record<string, any>): Promise<ActionResult> {
    const action = intent.params?.action;
    if (!action) {
      return { success: false, message: 'No form action specified' };
    }

    if (this.context.onFormAction) {
      try {
        this.context.onFormAction(action, slots);
        
        // Speak feedback
        if (this.context.speak) {
          await this.context.speak(this.getFormActionMessage(action));
        }

        return { success: true, message: `Form action ${action} executed` };
      } catch (error) {
        return { success: false, message: `Form action ${action} failed` };
      }
    }

    return { success: false, message: 'Form action handler not configured' };
  }

  // ============ CRUD Operations ============

  private async handleCRUD(intent: VoiceIntent, slots: Record<string, any>): Promise<ActionResult> {
    const entity = intent.params?.entity;
    if (!entity) {
      return { success: false, message: 'No entity specified' };
    }

    // Check if confirmation is required
    if (intent.params?.requiresConfirmation && intent.action === 'delete') {
      const prompt = this.dialogManager.getConfirmationPrompt(intent.id, slots, this.context.language);
      
      this.dialogManager.setPendingConfirmation({
        action: intent.action,
        intent: intent.id,
        slots,
        prompt,
      });

      if (this.context.speak) {
        await this.context.speak(prompt);
      }

      return {
        success: true,
        message: 'Awaiting confirmation',
        requiresConfirmation: true,
        confirmationPrompt: prompt,
      };
    }

    // Execute CRUD operation
    if (this.context.onCRUDAction) {
      try {
        const result = await this.context.onCRUDAction(intent.action, entity, slots);
        
        // Save undo action for non-read operations
        if (intent.action !== 'read') {
          this.dialogManager.pushUndoAction({
            timestamp: Date.now(),
            action: intent.action,
            intent: intent.id,
            previousState: result?.previousState,
            description: `${intent.action} ${entity}`,
          });
        }

        if (this.context.speak) {
          await this.context.speak(this.getCRUDSuccessMessage(intent.action, entity));
        }

        return {
          success: true,
          message: `${intent.action} ${entity} completed`,
          data: result,
        };
      } catch (error) {
        console.error('[ActionHandler] CRUD error:', error);
        return {
          success: false,
          message: `${intent.action} ${entity} failed: ${error}`,
        };
      }
    }

    return { success: false, message: 'CRUD handler not configured' };
  }

  // ============ Confirmation Handling ============

  private async handleConfirmation(
    confirmType: 'yes' | 'no' | 'cancel',
    pendingConfirmation: any
  ): Promise<ActionResult> {
    this.dialogManager.clearPendingConfirmation();

    if (confirmType === 'yes') {
      // Execute the pending action
      const mockIntent: VoiceIntent = {
        id: pendingConfirmation.intent,
        patterns: [],
        priority: 'high',
        offline: false,
        action: pendingConfirmation.action,
        params: { entity: pendingConfirmation.slots?.entity },
      };

      const mockUtterance: VoiceUtterance = {
        text: '',
        intent: pendingConfirmation.intent,
        confidence: 1.0,
        slots: pendingConfirmation.slots,
        language: this.context.language,
        timestamp: Date.now(),
      };

      // Execute without confirmation check
      if (this.context.onCRUDAction && mockIntent.action) {
        try {
          const result = await this.context.onCRUDAction(
            mockIntent.action,
            pendingConfirmation.slots?.entity || 'item',
            pendingConfirmation.slots
          );

          if (this.context.speak) {
            await this.context.speak(this.getLocalizedMessage('confirmed'));
          }

          return { success: true, message: 'Action confirmed and executed', data: result };
        } catch (error) {
          return { success: false, message: `Confirmed action failed: ${error}` };
        }
      }
    } else {
      if (this.context.speak) {
        await this.context.speak(this.getLocalizedMessage('cancelled'));
      }
      return { success: true, message: 'Action cancelled' };
    }

    return { success: false, message: 'Confirmation handling failed' };
  }

  private async handleDirectConfirmation(intent: VoiceIntent, slots: Record<string, any>): Promise<ActionResult> {
    const confirmation = intent.params?.confirmation as boolean;
    const pending = this.dialogManager.getPendingConfirmation();

    if (!pending) {
      return { success: false, message: 'No pending confirmation' };
    }

    return this.handleConfirmation(confirmation ? 'yes' : 'no', pending);
  }

  // ============ Undo ============

  private async handleUndo(): Promise<ActionResult> {
    if (!this.dialogManager.canUndo()) {
      if (this.context.speak) {
        await this.context.speak(this.getLocalizedMessage('nothing_to_undo'));
      }
      return { success: false, message: 'Nothing to undo' };
    }

    const undoAction = this.dialogManager.popUndoAction();
    if (!undoAction) {
      return { success: false, message: 'Undo failed' };
    }

    // Execute undo logic (would need to be implemented per entity type)
    if (this.context.speak) {
      await this.context.speak(
        this.getLocalizedMessage('undone', { action: undoAction.description })
      );
    }

    return {
      success: true,
      message: `Undone: ${undoAction.description}`,
      data: undoAction,
    };
  }

  // ============ Help & Accessibility ============

  private async handleHelp(intent: VoiceIntent, slots: Record<string, any>): Promise<ActionResult> {
    const helpType = intent.params?.type;

    switch (helpType) {
      case 'repeat':
        // Repeat last spoken message
        if (this.context.speak) {
          const lastTurn = this.dialogManager.getLastTurn();
          if (lastTurn) {
            await this.context.speak(lastTurn.response);
          } else {
            await this.context.speak(this.getLocalizedMessage('nothing_to_repeat'));
          }
        }
        return { success: true, message: 'Repeated last message' };

      case 'examples':
        // Provide examples
        const examples = this.getVoiceExamples();
        if (this.context.speak) {
          await this.context.speak(examples.join(', '));
        }
        return { success: true, message: 'Provided examples', data: examples };

      case 'slow_down':
        // Adjust TTS rate (would need to be implemented in TTS service)
        if (this.context.speak) {
          await this.context.speak(this.getLocalizedMessage('slowing_down'));
        }
        return { success: true, message: 'Slowed down speech' };

      default:
        return { success: false, message: 'Unknown help type' };
    }
  }

  private async handleAccessibility(intent: VoiceIntent, slots: Record<string, any>): Promise<ActionResult> {
    const action = intent.params?.action;

    if (action === 'read_screen') {
      // Read screen content (would need screen reader integration)
      if (this.context.speak) {
        const screenContext = this.dialogManager.getScreenContext();
        const description = this.describeScreen(screenContext);
        await this.context.speak(description);
      }
      return { success: true, message: 'Read screen content' };
    }

    return { success: false, message: 'Unknown accessibility action' };
  }

  // ============ Emergency ============

  private async handleEmergency(intent: VoiceIntent, slots: Record<string, any>): Promise<ActionResult> {
    const type = intent.params?.type;

    if (type === 'support') {
      // Trigger support call/contact
      if (this.context.speak) {
        await this.context.speak(this.getLocalizedMessage('calling_support'));
      }

      // Navigate to support or trigger contact flow
      if (this.context.onUIAction) {
        this.context.onUIAction('emergency_support', { type: 'voice_urgent' });
      }

      return { success: true, message: 'Emergency support triggered' };
    }

    return { success: false, message: 'Unknown emergency type' };
  }

  // ============ Localization Helpers ============

  private getLocalizedMessage(key: string, params?: Record<string, any>): string {
    const messages: Record<string, Record<string, string>> = {
      en: {
        opening: `Opening ${params?.name}`,
        going_back: 'Going back',
        confirmed: 'Confirmed',
        cancelled: 'Cancelled',
        nothing_to_undo: 'Nothing to undo',
        undone: `Undone: ${params?.action}`,
        nothing_to_repeat: 'Nothing to repeat',
        slowing_down: 'Speaking slower now',
        calling_support: 'Calling support',
      },
      hi: {
        opening: `${params?.name} खोल रहे हैं`,
        going_back: 'वापस जा रहे हैं',
        confirmed: 'पुष्टि हो गई',
        cancelled: 'रद्द कर दिया',
        nothing_to_undo: 'वापस करने के लिए कुछ नहीं',
        undone: `वापस किया: ${params?.action}`,
        nothing_to_repeat: 'दोहराने के लिए कुछ नहीं',
        slowing_down: 'अब धीरे बोल रहे हैं',
        calling_support: 'सपोर्ट को कॉल कर रहे हैं',
      },
    };

    const lang = this.context.language || 'en';
    return messages[lang]?.[key] || messages.en[key] || key;
  }

  private getFormActionMessage(action: string): string {
    const messages: Record<string, Record<string, string>> = {
      en: {
        next_field: 'Moving to next field',
        previous_field: 'Moving to previous field',
        clear_field: 'Field cleared',
        save: 'Saving',
        cancel: 'Cancelled',
      },
      hi: {
        next_field: 'अगले फील्ड पर जा रहे हैं',
        previous_field: 'पिछले फील्ड पर जा रहे हैं',
        clear_field: 'फील्ड साफ़ हो गया',
        save: 'सेव कर रहे हैं',
        cancel: 'रद्द कर दिया',
      },
    };

    const lang = this.context.language || 'en';
    return messages[lang]?.[action] || action;
  }

  private getCRUDSuccessMessage(action: string, entity: string): string {
    const messages: Record<string, Record<string, string>> = {
      en: {
        create: `${entity} created successfully`,
        edit: `${entity} updated successfully`,
        delete: `${entity} deleted successfully`,
      },
      hi: {
        create: `${entity} बन गया`,
        edit: `${entity} अपडेट हो गया`,
        delete: `${entity} हटा दिया गया`,
      },
    };

    const lang = this.context.language || 'en';
    return messages[lang]?.[action] || `${action} ${entity} completed`;
  }

  private getVoiceExamples(): string[] {
    const examples: Record<string, string[]> = {
      en: [
        'Go home',
        'Show my lands',
        'Add new land',
        'Delete this task',
        'Save changes',
      ],
      hi: [
        'घर जाओ',
        'मेरी जमीन दिखाओ',
        'नई जमीन जोड़ो',
        'काम हटाओ',
        'सेव करो',
      ],
    };

    const lang = this.context.language || 'en';
    return examples[lang] || examples.en;
  }

  private describeScreen(context: Record<string, any>): string {
    // Simple screen description based on context
    const route = this.dialogManager.getCurrentRoute();
    const descriptions: Record<string, Record<string, string>> = {
      en: {
        '/app': 'You are on the home screen',
        '/app/lands': 'You are viewing your lands',
        '/app/weather': 'You are viewing the weather forecast',
        '/app/schedule': 'You are viewing your schedule',
      },
      hi: {
        '/app': 'आप होम स्क्रीन पर हैं',
        '/app/lands': 'आप अपनी जमीनें देख रहे हैं',
        '/app/weather': 'आप मौसम का पूर्वानुमान देख रहे हैं',
        '/app/schedule': 'आप अपना कार्यक्रम देख रहे हैं',
      },
    };

    const lang = this.context.language || 'en';
    return descriptions[lang]?.[route] || 'You are in the app';
  }
}
