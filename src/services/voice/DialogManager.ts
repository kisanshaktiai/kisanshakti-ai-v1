/**
 * DialogManager - Stateful dialog manager for voice interactions
 * Tracks conversation context, focused elements, and multi-turn interactions
 */

export interface DialogContext {
  currentRoute: string;
  focusedElement: string | null;
  lastAction: string | null;
  lastIntent: string | null;
  lastSlots: Record<string, any>;
  screenContext: Record<string, any>;
  conversationHistory: ConversationTurn[];
  pendingConfirmation: PendingConfirmation | null;
  undoStack: UndoAction[];
}

export interface ConversationTurn {
  timestamp: number;
  userInput: string;
  intent: string;
  slots: Record<string, any>;
  response: string;
  success: boolean;
}

export interface PendingConfirmation {
  action: string;
  intent: string;
  slots: Record<string, any>;
  prompt: string;
  timestamp: number;
}

export interface UndoAction {
  timestamp: number;
  action: string;
  intent: string;
  previousState: any;
  description: string;
}

export interface CorrectionIntent {
  type: 'field' | 'value' | 'action';
  target: string;
  newValue?: any;
}

export class DialogManager {
  private context: DialogContext;
  private maxHistoryLength: number = 10;
  private maxUndoStackSize: number = 5;
  private confirmationTimeoutMs: number = 30000; // 30 seconds

  constructor() {
    this.context = this.initializeContext();
    this.loadFromStorage();
  }

  private initializeContext(): DialogContext {
    return {
      currentRoute: '/app',
      focusedElement: null,
      lastAction: null,
      lastIntent: null,
      lastSlots: {},
      screenContext: {},
      conversationHistory: [],
      pendingConfirmation: null,
      undoStack: [],
    };
  }

  // ============ Context Management ============

  updateRoute(route: string): void {
    this.context.currentRoute = route;
    this.context.focusedElement = null; // Reset focus on route change
    this.persist();
  }

  updateFocusedElement(elementId: string | null): void {
    this.context.focusedElement = elementId;
    this.persist();
  }

  updateScreenContext(context: Record<string, any>): void {
    this.context.screenContext = { ...this.context.screenContext, ...context };
    this.persist();
  }

  getContext(): Readonly<DialogContext> {
    return { ...this.context };
  }

  getCurrentRoute(): string {
    return this.context.currentRoute;
  }

  getFocusedElement(): string | null {
    return this.context.focusedElement;
  }

  getScreenContext(): Record<string, any> {
    return { ...this.context.screenContext };
  }

  // ============ Conversation History ============

  addTurn(turn: ConversationTurn): void {
    this.context.conversationHistory.push(turn);
    this.context.lastAction = turn.intent;
    this.context.lastIntent = turn.intent;
    this.context.lastSlots = turn.slots;

    // Trim history to max length
    if (this.context.conversationHistory.length > this.maxHistoryLength) {
      this.context.conversationHistory = this.context.conversationHistory.slice(-this.maxHistoryLength);
    }

    this.persist();
  }

  getConversationHistory(limit?: number): ConversationTurn[] {
    if (limit) {
      return this.context.conversationHistory.slice(-limit);
    }
    return [...this.context.conversationHistory];
  }

  getLastTurn(): ConversationTurn | null {
    if (this.context.conversationHistory.length === 0) return null;
    return this.context.conversationHistory[this.context.conversationHistory.length - 1];
  }

  // ============ Multi-turn Corrections ============

  /**
   * Handles corrections like "No, not that one" or "The green one"
   * Returns the corrected intent/slots based on context
   */
  handleCorrection(correctionText: string): CorrectionIntent | null {
    const lastTurn = this.getLastTurn();
    if (!lastTurn) return null;

    const normalizedText = correctionText.toLowerCase().trim();

    // Detect correction type
    if (normalizedText.match(/no|not|wrong|incorrect|नहीं|गलत/)) {
      // User is rejecting the last action
      return {
        type: 'action',
        target: lastTurn.intent,
      };
    }

    // Extract color/descriptor corrections
    const colorMatch = normalizedText.match(/\b(green|red|blue|yellow|हरा|लाल|नीला|पीला)\b/i);
    if (colorMatch && this.context.focusedElement) {
      return {
        type: 'field',
        target: this.context.focusedElement,
        newValue: colorMatch[1],
      };
    }

    // Extract numeric corrections
    const numberMatch = normalizedText.match(/\b(\d+)\b/);
    if (numberMatch && this.context.focusedElement) {
      return {
        type: 'value',
        target: this.context.focusedElement,
        newValue: parseInt(numberMatch[1], 10),
      };
    }

    return null;
  }

  // ============ Confirmation Management ============

  setPendingConfirmation(confirmation: Omit<PendingConfirmation, 'timestamp'>): void {
    this.context.pendingConfirmation = {
      ...confirmation,
      timestamp: Date.now(),
    };
    this.persist();
  }

  getPendingConfirmation(): PendingConfirmation | null {
    if (!this.context.pendingConfirmation) return null;

    // Check if confirmation has expired
    const elapsed = Date.now() - this.context.pendingConfirmation.timestamp;
    if (elapsed > this.confirmationTimeoutMs) {
      this.context.pendingConfirmation = null;
      this.persist();
      return null;
    }

    return { ...this.context.pendingConfirmation };
  }

  clearPendingConfirmation(): void {
    this.context.pendingConfirmation = null;
    this.persist();
  }

  isConfirmationIntent(intent: string): 'yes' | 'no' | 'cancel' | null {
    const confirmPatterns = {
      yes: ['yes', 'confirm', 'ok', 'sure', 'हाँ', 'ठीक है', 'जी हां'],
      no: ['no', 'cancel', 'stop', 'नहीं', 'रद्द करो'],
      cancel: ['cancel', 'nevermind', 'forget it', 'रद्द करो', 'छोड़ो'],
    };

    const normalized = intent.toLowerCase();

    for (const [type, patterns] of Object.entries(confirmPatterns)) {
      if (patterns.some(p => normalized.includes(p))) {
        return type as 'yes' | 'no' | 'cancel';
      }
    }

    return null;
  }

  // ============ Undo Stack ============

  pushUndoAction(action: UndoAction): void {
    this.context.undoStack.push(action);

    // Trim stack to max size
    if (this.context.undoStack.length > this.maxUndoStackSize) {
      this.context.undoStack = this.context.undoStack.slice(-this.maxUndoStackSize);
    }

    this.persist();
  }

  popUndoAction(): UndoAction | null {
    const action = this.context.undoStack.pop();
    if (action) {
      this.persist();
    }
    return action || null;
  }

  canUndo(): boolean {
    return this.context.undoStack.length > 0;
  }

  getLastUndoAction(): UndoAction | null {
    if (this.context.undoStack.length === 0) return null;
    return this.context.undoStack[this.context.undoStack.length - 1];
  }

  // ============ Context Resolution ============

  /**
   * Resolves pronouns and references in user input based on context
   * Example: "edit that" -> resolves "that" to last item
   */
  resolveReferences(input: string, slots: Record<string, any>): Record<string, any> {
    const resolved = { ...slots };

    const lastTurn = this.getLastTurn();
    if (!lastTurn) return resolved;

    // Resolve "that", "this", "it" references
    const references = ['that', 'this', 'it', 'वह', 'यह', 'वो'];
    const hasReference = references.some(ref => input.toLowerCase().includes(ref));

    if (hasReference && lastTurn.slots.id) {
      resolved.id = lastTurn.slots.id;
    }

    if (hasReference && lastTurn.slots.landId) {
      resolved.landId = lastTurn.slots.landId;
    }

    // Resolve "last" references
    if (input.toLowerCase().includes('last') || input.includes('पिछला')) {
      if (lastTurn.slots.id) {
        resolved.id = lastTurn.slots.id;
      }
    }

    return resolved;
  }

  // ============ Persistence ============

  private persist(): void {
    try {
      localStorage.setItem('voice_dialog_context', JSON.stringify(this.context));
    } catch (error) {
      console.error('[DialogManager] Error persisting context:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('voice_dialog_context');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.context = {
          ...this.initializeContext(),
          ...parsed,
        };

        // Clear expired confirmations on load
        if (this.context.pendingConfirmation) {
          const elapsed = Date.now() - this.context.pendingConfirmation.timestamp;
          if (elapsed > this.confirmationTimeoutMs) {
            this.context.pendingConfirmation = null;
          }
        }
      }
    } catch (error) {
      console.error('[DialogManager] Error loading context from storage:', error);
    }
  }

  reset(): void {
    this.context = this.initializeContext();
    localStorage.removeItem('voice_dialog_context');
  }

  // ============ Helper Methods ============

  shouldRequireConfirmation(intent: string): boolean {
    const destructiveIntents = [
      'delete',
      'remove',
      'clear',
      'reset',
      'cancel',
      'abandon',
    ];

    return destructiveIntents.some(keyword => intent.toLowerCase().includes(keyword));
  }

  getConfirmationPrompt(intent: string, slots: Record<string, any>, language: string = 'en'): string {
    const prompts: Record<string, Record<string, string>> = {
      en: {
        delete: `Are you sure you want to delete ${slots.name || 'this item'}?`,
        remove: `Do you want to remove ${slots.name || 'this'}?`,
        clear: `This will clear all data. Continue?`,
        default: `Are you sure you want to proceed?`,
      },
      hi: {
        delete: `क्या आप ${slots.name || 'इसे'} हटाना चाहते हैं?`,
        remove: `क्या आप ${slots.name || 'इसे'} हटाना चाहते हैं?`,
        clear: `यह सभी डेटा को साफ़ कर देगा। जारी रखें?`,
        default: `क्या आप आगे बढ़ना चाहते हैं?`,
      },
    };

    const langPrompts = prompts[language] || prompts.en;
    const action = intent.split('.')[1] || 'default';
    return langPrompts[action] || langPrompts.default;
  }
}
