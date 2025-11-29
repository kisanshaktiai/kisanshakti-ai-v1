/**
 * Unit tests for ToastManager
 * Verifies toast deduplication logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toastManager } from '@/utils/ToastManager';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('ToastManager', () => {
  beforeEach(() => {
    toastManager.reset();
    vi.clearAllMocks();
  });

  it('should show toast on first call', () => {
    toastManager.success('Test message', 'test-id');
    
    // Toast should be shown
    expect(vi.mocked(require('sonner').toast.success)).toHaveBeenCalledWith(
      'Test message',
      expect.objectContaining({ id: 'test-id' })
    );
  });

  it('should suppress duplicate toast within dedup window', () => {
    const id = 'duplicate-test';
    
    toastManager.success('Message 1', id);
    toastManager.success('Message 2', id); // Should be suppressed
    
    // Only first toast should be shown
    expect(vi.mocked(require('sonner').toast.success)).toHaveBeenCalledTimes(1);
  });

  it('should allow same toast after dedup window expires', async () => {
    const id = 'time-test';
    
    toastManager.success('Message 1', id);
    
    // Fast-forward time past dedup window
    await new Promise(resolve => setTimeout(resolve, 3100));
    
    toastManager.success('Message 2', id);
    
    // Both toasts should be shown
    expect(vi.mocked(require('sonner').toast.success)).toHaveBeenCalledTimes(2);
  });

  it('should handle error toasts correctly', () => {
    toastManager.error('Error message', 'error-id');
    
    expect(vi.mocked(require('sonner').toast.error)).toHaveBeenCalledWith(
      'Error message',
      expect.objectContaining({ id: 'error-id' })
    );
  });

  it('should allow different toast IDs simultaneously', () => {
    toastManager.success('Message 1', 'id-1');
    toastManager.success('Message 2', 'id-2');
    
    // Both should be shown since they have different IDs
    expect(vi.mocked(require('sonner').toast.success)).toHaveBeenCalledTimes(2);
  });

  it('should clear specific toast from cache', () => {
    const id = 'clear-test';
    
    toastManager.success('Message 1', id);
    toastManager.clear(id);
    toastManager.success('Message 2', id);
    
    // After clear, second toast should be shown
    expect(vi.mocked(require('sonner').toast.success)).toHaveBeenCalledTimes(2);
  });
});
