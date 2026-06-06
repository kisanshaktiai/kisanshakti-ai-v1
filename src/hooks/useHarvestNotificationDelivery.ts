import { useEffect } from 'react';
import { usePendingHarvests } from './usePendingHarvests';

/**
 * Step 5 — Local push delivery for harvest events.
 *
 * Fires a single browser Notification per matured schedule when the engine
 * surfaces a new HARVEST_READY request. We dedupe by schedule_id in
 * localStorage so the user never gets the same alert twice across reloads.
 *
 * Best-effort only: gracefully no-ops when:
 *   - Notification API is unavailable (older browsers, in-app webviews)
 *   - Permission is not 'granted' (we never auto-prompt here; permission is
 *     requested elsewhere via useNotifications/Permission Hub)
 */
const STORAGE_KEY = 'harvest:notified_schedule_ids';

function readNotified(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeNotified(ids: Set<string>) {
  try {
    // cap to last 200 to avoid unbounded growth
    const arr = Array.from(ids).slice(-200);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore quota errors */
  }
}

export function useHarvestNotificationDelivery() {
  const { data: pending } = usePendingHarvests();

  useEffect(() => {
    if (!pending || pending.length === 0) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const notified = readNotified();
    let dirty = false;

    for (const req of pending) {
      const sid = req.schedule_id;
      if (!sid || notified.has(sid)) continue;
      const crop = req.crop_schedules?.crop_name || 'your crop';
      const land = req.lands?.name || '';
      try {
        new Notification('🌾 Ready for harvest', {
          body: land ? `${crop} • ${land}` : crop,
          tag: `harvest-${sid}`,
          icon: '/icons/icon-192.png',
        });
      } catch {
        /* notification constructor can throw on some platforms */
      }
      notified.add(sid);
      dirty = true;
    }

    if (dirty) writeNotified(notified);
  }, [pending]);
}
