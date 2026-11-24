/**
 * deviceWipe — what a logout removes from the device besides the stores that
 * authStore.logout() and localDB.clearAll() already clear.
 *
 * A phone is often shared. After logout the next person must not be able to
 * read the previous person's data or recover their PIN, so this removes:
 *   - the offline PIN cache (farmer row, profile and PIN hash) from localStorage
 *     (its IndexedDB copy lives in the syncMetadata store, wiped by clearAll);
 *   - other per-person keys the farmer app writes to localStorage;
 *   - the service-worker caches of API responses and images.
 *
 * Consequence: after a logout the next login needs a network connection, because
 * the offline PIN copy is gone. Closing the app without logging out keeps it.
 */

/** Same key as offlineAuthService.STORAGE_KEY. */
const OFFLINE_AUTH_KEY = 'offline_auth_data';

/** Per-person values written by farmer screens. */
const PERSONAL_KEYS = [
  OFFLINE_AUTH_KEY,
  'landFormDraft',
  'userLocation',
  'scheduledReminders',
  'voice_dialog_context',
];

/** Runtime caches named in vite.config.ts (workbox runtimeCaching). */
const RESPONSE_CACHES = ['api-cache', 'images-cache'];

export function wipeDeviceAfterLogout(): void {
  for (const key of PERSONAL_KEYS) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
  try {
    if (typeof caches !== 'undefined') {
      for (const name of RESPONSE_CACHES) {
        caches.delete(name).catch(() => { /* cache not present */ });
      }
    }
  } catch { /* Cache Storage unavailable */ }
}
