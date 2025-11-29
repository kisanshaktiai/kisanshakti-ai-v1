/**
 * ToastManager - Prevents duplicate toast spam
 * 
 * ROOT CAUSE: Direct toast.success/error calls can trigger multiple times
 * when effects re-run or during rapid state changes (e.g., pull-to-refresh loop)
 * 
 * FIX: Singleton that deduplicates toasts by ID within a time window
 */

import { toast as sonnerToast } from 'sonner';

interface ToastOptions {
  id: string;
  title?: string;
  description: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}

class ToastManager {
  private activeToasts = new Map<string, number>();
  private readonly DEFAULT_WINDOW = 3000; // 3 seconds dedup window

  /**
   * Show a toast only if the same ID hasn't been shown recently
   */
  show(options: ToastOptions) {
    const { id, title, description, variant = 'default', duration = 4000 } = options;
    
    const now = Date.now();
    const lastShown = this.activeToasts.get(id);
    
    // Suppress duplicate within dedup window
    if (lastShown && (now - lastShown) < this.DEFAULT_WINDOW) {
      console.log(`🚫 [ToastManager] Suppressing duplicate toast: ${id}`);
      return;
    }
    
    // Show toast
    this.activeToasts.set(id, now);
    
    if (variant === 'destructive') {
      sonnerToast.error(description, { id, duration });
    } else {
      sonnerToast.success(description, { id, duration });
    }
    
    // Clean up after duration
    setTimeout(() => {
      this.activeToasts.delete(id);
    }, duration + this.DEFAULT_WINDOW);
  }

  success(description: string, id?: string) {
    this.show({
      id: id || `success-${Date.now()}`,
      description,
      variant: 'default'
    });
  }

  error(description: string, id?: string) {
    this.show({
      id: id || `error-${Date.now()}`,
      description,
      variant: 'destructive'
    });
  }

  /**
   * Clear a specific toast from the dedup cache
   */
  clear(id: string) {
    this.activeToasts.delete(id);
  }

  /**
   * Reset all toast tracking (useful for tests)
   */
  reset() {
    this.activeToasts.clear();
  }
}

export const toastManager = new ToastManager();
