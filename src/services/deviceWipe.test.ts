import { afterEach, describe, expect, it, vi } from 'vitest';
import { wipeDeviceAfterLogout } from './deviceWipe';

describe('wipeDeviceAfterLogout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('removes the offline PIN cache and the other per-person keys, and keeps device settings', () => {
    for (const key of ['offline_auth_data', 'landFormDraft', 'userLocation', 'scheduledReminders', 'voice_dialog_context']) {
      localStorage.setItem(key, '{"x":1}');
    }
    localStorage.setItem('tenantId', 'tenant-1');
    wipeDeviceAfterLogout();
    expect(Object.keys(localStorage)).toEqual(['tenantId']);
  });

  it('deletes the service-worker caches of API responses and images', () => {
    const deleted: string[] = [];
    vi.stubGlobal('caches', { delete: (name: string) => { deleted.push(name); return Promise.resolve(true); } });
    wipeDeviceAfterLogout();
    expect(deleted.sort()).toEqual(['api-cache', 'images-cache']);
  });

  it('does not throw where Cache Storage does not exist', () => {
    vi.stubGlobal('caches', undefined);
    expect(() => wipeDeviceAfterLogout()).not.toThrow();
  });
});
