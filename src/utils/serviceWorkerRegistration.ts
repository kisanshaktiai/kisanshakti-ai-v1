/**
 * Service Worker Registration & Lifecycle Management
 * 
 * Handles:
 * - Registration with proper scope
 * - Update detection and user notification
 * - Skip waiting on user approval
 * - Analytics events
 */

type UpdateCallback = (registration: ServiceWorkerRegistration) => void;
type RegistrationCallback = (registration: ServiceWorkerRegistration) => void;

interface ServiceWorkerConfig {
  onUpdate?: UpdateCallback;
  onSuccess?: RegistrationCallback;
  onOfflineReady?: () => void;
}

// CRITICAL: Must match VitePWA filename in vite.config.ts
const SW_URL = '/sw.js';
const SW_SCOPE = '/';

export async function register(config?: ServiceWorkerConfig): Promise<void> {
  if (typeof window === 'undefined') {
    console.log('[SW] Not in browser context, skipping registration');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Worker not supported in this browser');
    return;
  }

  // Wait for page load to avoid slowing down initial render
  window.addEventListener('load', async () => {
    try {
      console.log('[SW] Registering Service Worker...', { url: SW_URL, scope: SW_SCOPE });
      
      const registration = await navigator.serviceWorker.register(SW_URL, {
        scope: SW_SCOPE,
        updateViaCache: 'none' // Always fetch latest SW from network
      });

      console.log('[SW] Service Worker registered successfully', {
        scope: registration.scope,
        active: !!registration.active,
        installing: !!registration.installing,
        waiting: !!registration.waiting
      });

      // Check for updates immediately
      await registration.update();

      // Handle installing worker
      if (registration.installing) {
        console.log('[SW] New Service Worker installing...');
        trackInstalling(registration.installing, config);
      }

      // Handle waiting worker (update available but not activated)
      if (registration.waiting) {
        console.log('[SW] New Service Worker waiting to activate (update available)');
        config?.onUpdate?.(registration);
      }

      // Listen for new updates
      registration.addEventListener('updatefound', () => {
        console.log('[SW] Update found, new worker installing...');
        const newWorker = registration.installing;
        if (newWorker) {
          trackInstalling(newWorker, config);
        }
      });

      // Check for updates every hour
      setInterval(() => {
        console.log('[SW] Checking for updates (hourly check)...');
        registration.update();
      }, 60 * 60 * 1000);

      // Trigger success callback
      if (registration.active) {
        config?.onSuccess?.(registration);
        config?.onOfflineReady?.();
      }

    } catch (error) {
      console.error('[SW] Service Worker registration failed:', error);
      
      // Analytics: track registration failure
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'sw_registration_failed', {
          error_message: (error as Error).message
        });
      }
    }
  });
}

function trackInstalling(worker: ServiceWorker, config?: ServiceWorkerConfig) {
  worker.addEventListener('statechange', () => {
    console.log('[SW] Worker state changed:', worker.state);

    if (worker.state === 'installed') {
      if (navigator.serviceWorker.controller) {
        // New update available
        console.log('[SW] New content available, update ready');
        const registration = navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) {
            config?.onUpdate?.(reg);
          }
        });
      } else {
        // Content cached for offline use
        console.log('[SW] Content cached for offline use');
        config?.onOfflineReady?.();
      }
    }

    if (worker.state === 'activated') {
      console.log('[SW] Service Worker activated, app now works offline');
    }
  });
}

/**
 * Tell the waiting service worker to skip waiting and become active
 */
export function skipWaiting(registration: ServiceWorkerRegistration): void {
  const waiting = registration.waiting;
  if (!waiting) {
    console.warn('[SW] No waiting worker to skip waiting');
    return;
  }

  console.log('[SW] Sending SKIP_WAITING message to worker');
  waiting.postMessage({ type: 'SKIP_WAITING' });

  // Reload page after activation
  waiting.addEventListener('statechange', (e: Event) => {
    const worker = e.target as ServiceWorker;
    if (worker.state === 'activated') {
      console.log('[SW] New worker activated, reloading page...');
      window.location.reload();
    }
  });
}

/**
 * Unregister all service workers (for debugging/development)
 */
export async function unregister(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
    console.log('[SW] All service workers unregistered');
  }
}

/**
 * Check if service worker is registered and active
 */
export async function isActive(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  return !!(registration && registration.active);
}

/**
 * Get current service worker registration
 */
export async function getRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) {
    return undefined;
  }

  return await navigator.serviceWorker.getRegistration();
}
