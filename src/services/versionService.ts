/**
 * Version Service for tracking app version and checking for updates
 */

class VersionService {
  private currentVersion: string;
  private checkInterval: number = 2 * 60 * 1000; // 2 minutes
  private intervalId: NodeJS.Timeout | null = null;
  private lastCheckTime: number = 0;
  private isDevelopment: boolean;

  constructor() {
    // Get version from build-time environment variable
    this.currentVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
    
    // Detect development mode
    this.isDevelopment = import.meta.env.DEV || 
      window.location.hostname === 'localhost' ||
      window.location.hostname.includes('127.0.0.1') ||
      window.location.hostname.includes('preview') ||
      window.location.hostname.includes('lovable.app');
    
    console.log(`[VersionService] App version: ${this.currentVersion}, Build: ${this.getBuildTime()}, Mode: ${this.isDevelopment ? 'Development' : 'Production'}`);
  }

  /**
   * Check if running in development mode
   */
  isDevelopmentMode(): boolean {
    return this.isDevelopment;
  }

  /**
   * Start periodic version checking
   */
  startVersionChecking(callback?: (updateAvailable: boolean) => void) {
    if (this.intervalId) {
      console.log('[VersionService] Version checking already running');
      return;
    }

    console.log('[VersionService] Starting version check interval');
    
    // Check immediately
    this.checkForUpdates().then(callback).catch(console.error);
    
    // Then check periodically
    this.intervalId = setInterval(() => {
      this.checkForUpdates().then(callback).catch(console.error);
    }, this.checkInterval);
  }

  /**
   * Stop periodic version checking
   */
  stopVersionChecking() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[VersionService] Stopped version checking');
    }
  }

  /**
   * Check if a new version is available by comparing manifest ETag
   * NOTE: This is now only for background detection. 
   * Actual update prompts are handled by service worker state.
   */
  async checkForUpdates(): Promise<boolean> {
    const now = Date.now();
    
    // Throttle checks to avoid too frequent requests
    if (now - this.lastCheckTime < 60 * 1000) { // 1 minute
      return false;
    }
    
    this.lastCheckTime = now;

    try {
      // Check manifest.json with cache-busting
      const response = await fetch(`/manifest.json?t=${now}`, {
        method: 'HEAD',
        cache: 'no-cache',
      });

      if (!response.ok) {
        console.warn('[VersionService] Failed to check for updates');
        return false;
      }

      // Get ETag from response
      const etag = response.headers.get('etag');
      const storedEtag = localStorage.getItem('app-manifest-etag');

      // Only compare, DON'T store new ETag yet
      // ETag is stored only after user updates or dismisses
      if (etag && storedEtag && etag !== storedEtag) {
        console.log('[VersionService] New ETag detected (old: %s, new: %s)', storedEtag?.substring(0, 10), etag?.substring(0, 10));
        return true;
      }

      if (etag && !storedEtag) {
        // First time - store it as baseline
        localStorage.setItem('app-manifest-etag', etag);
        console.log('[VersionService] Baseline ETag stored');
      }

      return false;
    } catch (error) {
      console.error('[VersionService] Error checking for updates:', error);
      return false;
    }
  }

  /**
   * Mark current version as acknowledged (called after update or dismissal)
   */
  acknowledgeCurrentVersion(): void {
    // Get fresh ETag and store it
    fetch(`/manifest.json?t=${Date.now()}`, { method: 'HEAD', cache: 'no-cache' })
      .then(response => {
        const etag = response.headers.get('etag');
        if (etag) {
          localStorage.setItem('app-manifest-etag', etag);
          console.log('[VersionService] Current ETag acknowledged');
        }
      })
      .catch(err => console.error('[VersionService] Error acknowledging version:', err));
  }

  /**
   * Force update by clearing caches and reloading
   */
  async forceUpdate() {
    console.log('[VersionService] Force updating app...');

    try {
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[VersionService] Cleared all caches');
      }

      // Unregister service worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
        console.log('[VersionService] Unregistered service workers');
      }

      // Clear version tracking
      localStorage.removeItem('app-manifest-etag');

      // Hard reload
      window.location.reload();
    } catch (error) {
      console.error('[VersionService] Error during force update:', error);
      // Fallback: just reload
      window.location.reload();
    }
  }

  /**
   * Get current app version
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Get build timestamp if available
   */
  getBuildTime(): string | null {
    return import.meta.env.VITE_BUILD_TIMESTAMP || null;
  }

  /**
   * Get update check interval in milliseconds
   */
  getCheckInterval(): number {
    return this.checkInterval;
  }

  /**
   * Set update check interval
   */
  setCheckInterval(intervalMs: number) {
    this.checkInterval = intervalMs;
    
    // Restart checking with new interval if already running
    if (this.intervalId) {
      this.stopVersionChecking();
      this.startVersionChecking();
    }
  }
}

// Singleton instance
export const versionService = new VersionService();

// Export class for testing
export default VersionService;
