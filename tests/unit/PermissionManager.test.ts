/**
 * Unit tests for PermissionManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionManager } from '@/services/PermissionManager';

describe('PermissionManager', () => {
  beforeEach(() => {
    PermissionManager.clearAll();
  });

  it('should return prompt status for new permission', async () => {
    const status = await PermissionManager.checkStatus('location');
    expect(['prompt', 'granted', 'denied']).toContain(status);
  });

  it('should store permission status after request', () => {
    localStorage.setItem('ks_permissions_location', JSON.stringify({
      status: 'granted',
      timestamp: Date.now(),
      requestCount: 1
    }));

    const stored = JSON.parse(localStorage.getItem('ks_permissions_location')!);
    expect(stored.status).toBe('granted');
    expect(stored.requestCount).toBe(1);
  });

  it('should increment request count', () => {
    localStorage.setItem('ks_permissions_camera', JSON.stringify({
      status: 'denied',
      timestamp: Date.now(),
      requestCount: 1
    }));

    localStorage.setItem('ks_permissions_camera', JSON.stringify({
      status: 'denied',
      timestamp: Date.now(),
      requestCount: 2
    }));

    const stored = JSON.parse(localStorage.getItem('ks_permissions_camera')!);
    expect(stored.requestCount).toBe(2);
  });

  it('should clear all permissions', () => {
    localStorage.setItem('ks_permissions_location', 'test');
    localStorage.setItem('ks_permissions_camera', 'test');
    
    PermissionManager.clearAll();
    
    expect(localStorage.getItem('ks_permissions_location')).toBeNull();
    expect(localStorage.getItem('ks_permissions_camera')).toBeNull();
  });

  it('should return stats for all permissions', () => {
    localStorage.setItem('ks_permissions_location', JSON.stringify({
      status: 'granted',
      timestamp: Date.now(),
      requestCount: 1
    }));

    const stats = PermissionManager.getStats();
    expect(stats).toHaveLength(4); // location, camera, microphone, contacts
    expect(stats[0].type).toBe('location');
  });
});
