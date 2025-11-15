/**
 * Update State Manager for PWA Updates
 * Manages update dismissal state and determines when to show update prompts
 * Following mobile-first best practices
 */

interface UpdateDismissalState {
  dismissedVersion: string;
  dismissedAt: number;
  dismissalCount: number;
}

class UpdateStateManager {
  private readonly STORAGE_KEY = 'pwa-update-dismissal-state';
  private readonly DISMISSAL_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly EXTENDED_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly MAX_QUICK_DISMISSALS = 3; // After 3 dismissals, extend to 7 days

  /**
   * Get current dismissal state from localStorage
   */
  private getState(): UpdateDismissalState | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;
      return JSON.parse(stored) as UpdateDismissalState;
    } catch (error) {
      console.error('[UpdateStateManager] Error reading dismissal state:', error);
      return null;
    }
  }

  /**
   * Save dismissal state to localStorage
   */
  private setState(state: UpdateDismissalState): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('[UpdateStateManager] Error saving dismissal state:', error);
    }
  }

  /**
   * Check if update prompt should be shown for a given version
   */
  shouldShowUpdatePrompt(newVersion: string): boolean {
    const state = this.getState();
    
    // No previous dismissal - show prompt
    if (!state) {
      console.log('[UpdateStateManager] No dismissal state - showing prompt');
      return true;
    }

    // Different version than previously dismissed - show prompt
    if (state.dismissedVersion !== newVersion) {
      console.log('[UpdateStateManager] New version detected - showing prompt');
      return true;
    }

    // Check if enough time has passed since dismissal
    const now = Date.now();
    const timeSinceDismissal = now - state.dismissedAt;
    
    // Determine duration based on dismissal count
    const duration = state.dismissalCount >= this.MAX_QUICK_DISMISSALS 
      ? this.EXTENDED_DURATION 
      : this.DISMISSAL_DURATION;

    const shouldShow = timeSinceDismissal >= duration;
    
    if (shouldShow) {
      console.log(`[UpdateStateManager] Dismissal period expired (${Math.round(timeSinceDismissal / 1000 / 60 / 60)}h) - showing prompt`);
    } else {
      const remainingHours = Math.round((duration - timeSinceDismissal) / 1000 / 60 / 60);
      console.log(`[UpdateStateManager] Still in dismissal period (${remainingHours}h remaining)`);
    }

    return shouldShow;
  }

  /**
   * Record that user dismissed an update
   */
  recordDismissal(version: string): void {
    const state = this.getState();
    
    const newState: UpdateDismissalState = {
      dismissedVersion: version,
      dismissedAt: Date.now(),
      dismissalCount: state?.dismissedVersion === version 
        ? (state.dismissalCount + 1) 
        : 1
    };

    this.setState(newState);
    
    const nextPromptHours = newState.dismissalCount >= this.MAX_QUICK_DISMISSALS ? 168 : 24;
    console.log(`[UpdateStateManager] Dismissal recorded (count: ${newState.dismissalCount}). Next prompt in ${nextPromptHours}h`);
  }

  /**
   * Record that user accepted an update
   * This clears the dismissal state
   */
  recordUpdateAccepted(version: string): void {
    localStorage.removeItem(this.STORAGE_KEY);
    console.log(`[UpdateStateManager] Update accepted for version ${version} - cleared dismissal state`);
  }

  /**
   * Check if this is a major version update (should override dismissal)
   */
  isMajorUpdate(currentVersion: string, newVersion: string): boolean {
    try {
      const currentMajor = parseInt(currentVersion.split('.')[0], 10);
      const newMajor = parseInt(newVersion.split('.')[0], 10);
      
      return newMajor > currentMajor;
    } catch (error) {
      console.error('[UpdateStateManager] Error comparing versions:', error);
      return false;
    }
  }

  /**
   * Get time until next prompt (in milliseconds)
   * Returns 0 if prompt should be shown now
   */
  getTimeUntilNextPrompt(version: string): number {
    const state = this.getState();
    
    if (!state || state.dismissedVersion !== version) {
      return 0;
    }

    const now = Date.now();
    const timeSinceDismissal = now - state.dismissedAt;
    const duration = state.dismissalCount >= this.MAX_QUICK_DISMISSALS 
      ? this.EXTENDED_DURATION 
      : this.DISMISSAL_DURATION;

    const remaining = duration - timeSinceDismissal;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Clear all dismissal state (for testing or forced updates)
   */
  clearState(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('[UpdateStateManager] Dismissal state cleared');
  }

  /**
   * Get current dismissal info for debugging
   */
  getDebugInfo(): UpdateDismissalState | null {
    return this.getState();
  }
}

// Singleton instance
export const updateStateManager = new UpdateStateManager();

// Export class for testing
export default UpdateStateManager;
