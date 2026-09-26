/**
 * KisanShakti AI PWA Update Coordinator
 *
 * Automatic application-code updates for non-technical farmers:
 * - one Service Worker registration (owned by main.tsx)
 * - background update checks
 * - newly installed workers wait for explicit activation
 * - first installation activates without a page reload
 * - subsequent updates activate automatically only at a safe/idle point
 * - controllerchange reloads only when this coordinator explicitly approved the update
 *
 * IMPORTANT:
 * controllerchange by itself NEVER means "reload".
 */

import { useCallback, useEffect, useRef } from 'react';
import { isPwaReloadSafe } from '@/utils/pwaActivity';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

const UPDATE_APPROVED_KEY = '__ksai_sw_update_approved__';
const RELOAD_SCHEDULED_KEY = '__ksai_sw_reload_scheduled__';

const INITIAL_UPDATE_CHECK_MS = 30_000;
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const SAFE_IDLE_MS = 20_000;
const ACTIVATION_RETRY_MS = 5_000;
const ACTIVATION_REQUEST_TIMEOUT_MS = 15_000;

export function PWAUpdatePrompt() {
  const activeFetches = useIsFetching();
  const activeMutations = useIsMutating();

  const activeFetchesRef = useRef(activeFetches);
  const activeMutationsRef = useRef(activeMutations);

  // Keep these refs synchronized whenever React Query activity changes.
  // The explicit dependencies are critical: an empty dependency array would
  // freeze both refs at their mount-time values.
  useEffect(() => {
    activeFetchesRef.current = activeFetches;
    activeMutationsRef.current = activeMutations;
  }, [activeFetches, activeMutations]);

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastActivityRef = useRef(Date.now());
  const pendingUpdateRef = useRef(false);
  const activationRequestedRef = useRef(false);
  const reloadScheduledRef = useRef(false);
  const reloadPendingRef = useRef(false);

  const isSafeToActivate = useCallback(() => {
    if (document.visibilityState !== 'visible') return false;
    if (activeFetchesRef.current > 0 || activeMutationsRef.current > 0) return false;
    if (!isPwaReloadSafe()) return false;

    return Date.now() - lastActivityRef.current >= SAFE_IDLE_MS;
  }, []);

  const activateWaitingWorker = useCallback((registration: ServiceWorkerRegistration) => {
    const waiting = registration.waiting;

    if (!waiting || activationRequestedRef.current) return;

    activationRequestedRef.current = true;

    const isFirstInstall = !navigator.serviceWorker.controller;

    if (isFirstInstall) {
      // First installation must activate the worker, but must never cause a
      // surprise reload of the initial page.
      sessionStorage.removeItem(UPDATE_APPROVED_KEY);
      console.log('[PWA] First service worker install: activating without reload');
    } else {
      // Existing controlled application: explicitly authorize the activation.
      sessionStorage.setItem(UPDATE_APPROVED_KEY, String(Date.now()));
      sessionStorage.removeItem(RELOAD_SCHEDULED_KEY);
      console.log('[PWA] Update activation approved automatically');
    }

    waiting.postMessage({ type: 'SKIP_WAITING' });

    window.setTimeout(() => {
      activationRequestedRef.current = false;
    }, ACTIVATION_REQUEST_TIMEOUT_MS);
  }, []);

  const tryActivatePendingUpdate = useCallback(() => {
    const registration = registrationRef.current;
    if (!registration?.waiting) {
      pendingUpdateRef.current = false;
      return;
    }

    // First install: the worker must be activated so it can become the
    // controller. It is explicitly prevented from triggering a reload.
    if (!navigator.serviceWorker.controller) {
      pendingUpdateRef.current = false;
      activateWaitingWorker(registration);
      return;
    }

    if (!pendingUpdateRef.current) return;

    if (isSafeToActivate()) {
      pendingUpdateRef.current = false;
      activateWaitingWorker(registration);
      return;
    }

    console.log('[PWA] Update ready but deferred until the app is safe/idle');
  }, [activateWaitingWorker, isSafeToActivate]);

  const processWaitingWorker = useCallback((registration: ServiceWorkerRegistration) => {
    if (!registration.waiting) return;

    registrationRef.current = registration;

    if (!navigator.serviceWorker.controller) {
      tryActivatePendingUpdate();
      return;
    }

    pendingUpdateRef.current = true;
    tryActivatePendingUpdate();
  }, [tryActivatePendingUpdate]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let disposed = false;
    let initialCheckTimer: number | undefined;
    let updateInterval: number | undefined;
    let pendingRetryInterval: number | undefined;

    // Fail-safe reset: a previous crashed page must not inherit a reload command.
    sessionStorage.removeItem(UPDATE_APPROVED_KEY);
    sessionStorage.removeItem(RELOAD_SCHEDULED_KEY);
    reloadScheduledRef.current = false;
    reloadPendingRef.current = false;

    const markActivity = () => {
      lastActivityRef.current = Date.now();
      if (pendingUpdateRef.current) {
        window.setTimeout(() => {
          if (!disposed) tryActivatePendingUpdate();
        }, SAFE_IDLE_MS);
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'touchstart',
      'keydown',
      'input',
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    const tryReloadWhenSafe = () => {
      const approved = sessionStorage.getItem(UPDATE_APPROVED_KEY);
      const alreadyScheduled = reloadScheduledRef.current
        || sessionStorage.getItem(RELOAD_SCHEDULED_KEY) === '1';

      if (!approved || alreadyScheduled || !reloadPendingRef.current) return;

      if (!isSafeToActivate()) {
        console.log('[PWA] Controller changed, but reload is deferred until work is complete');
        return;
      }

      reloadPendingRef.current = false;
      reloadScheduledRef.current = true;
      sessionStorage.setItem(RELOAD_SCHEDULED_KEY, '1');
      sessionStorage.removeItem(UPDATE_APPROVED_KEY);

      console.log('[PWA] Reload authorized after completed update transaction');

      // Give the newly-activated worker one event-loop turn to settle before
      // reloading the current route.
      window.setTimeout(() => {
        if (disposed) return;

        // Final safety gate: work can start in the small window between the
        // first safety check and this reload timer.
        if (!isSafeToActivate()) {
          reloadScheduledRef.current = false;
          sessionStorage.removeItem(RELOAD_SCHEDULED_KEY);
          reloadPendingRef.current = true;
          console.log('[PWA] Reload was deferred because new work started');
          return;
        }

        window.location.reload();
      }, 100);
    };

    const handleControllerChange = () => {
      console.log('[PWA] Service worker controller changed');

      const approved = sessionStorage.getItem(UPDATE_APPROVED_KEY);
      if (approved) {
        // Activation and reload are separate gates. A request can start between
        // SKIP_WAITING and controllerchange, so controllerchange must never
        // blindly reload the page.
        reloadPendingRef.current = true;
        tryReloadWhenSafe();
      } else {
        console.log('[PWA] Controller change detected without approved update; no reload');
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    const setup = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;

        if (disposed) return;

        registrationRef.current = registration;

        console.log('[PWA] Service worker ready; automatic application updates enabled');

        const watchInstallingWorker = (worker: ServiceWorker) => {
          worker.addEventListener('statechange', () => {
            console.log('[PWA] Service worker state:', worker.state);

            if (worker.state === 'installed') {
              processWaitingWorker(registration);
            }
          });
        };

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          console.log('[PWA] New service worker installing in background');

          if (worker) {
            watchInstallingWorker(worker);
          }
        });

        if (registration.installing) {
          watchInstallingWorker(registration.installing);
        }

        // A waiting worker can already exist when this component mounts.
        processWaitingWorker(registration);

        const checkForUpdate = async () => {
          try {
            await registration.update();
          } catch (error) {
            console.warn('[PWA] Background update check failed:', error);
          }

          if (!disposed) {
            processWaitingWorker(registration);
          }
        };

        // Keep the existing non-aggressive background update cadence.
        initialCheckTimer = window.setTimeout(checkForUpdate, INITIAL_UPDATE_CHECK_MS);
        updateInterval = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

        pendingRetryInterval = window.setInterval(() => {
          if (!disposed) {
            if (pendingUpdateRef.current) {
              tryActivatePendingUpdate();
            }
            tryReloadWhenSafe();
          }
        }, ACTIVATION_RETRY_MS);

        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            if (pendingUpdateRef.current) {
              lastActivityRef.current = Date.now();
              window.setTimeout(() => {
                if (!disposed) tryActivatePendingUpdate();
              }, SAFE_IDLE_MS);
            } else if (reloadPendingRef.current) {
              lastActivityRef.current = Date.now();
              window.setTimeout(() => {
                if (!disposed) tryReloadWhenSafe();
              }, SAFE_IDLE_MS);
            } else {
              void checkForUpdate();
            }
          }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        if (registration.waiting) {
          processWaitingWorker(registration);
        }

        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
      } catch (error) {
        console.error('[PWA] Failed to initialize automatic update coordinator:', error);
      }
    };

    let innerCleanup: (() => void) | undefined;

    void setup().then((cleanup) => {
      innerCleanup = cleanup;
    });

    return () => {
      disposed = true;
      reloadPendingRef.current = false;

      if (initialCheckTimer !== undefined) window.clearTimeout(initialCheckTimer);
      if (updateInterval !== undefined) window.clearInterval(updateInterval);
      if (pendingRetryInterval !== undefined) window.clearInterval(pendingRetryInterval);

      innerCleanup?.();

      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);

      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
    };
  }, [processWaitingWorker, tryActivatePendingUpdate]);

  // This component intentionally renders no update prompt.
  // Software updates are automatic for the farmer.
  return null;
}
