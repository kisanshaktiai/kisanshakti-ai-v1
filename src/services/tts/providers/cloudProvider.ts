/**
 * Cloud speech provider — used only to cover what the device cannot.
 *
 * Both Google and Bhashini live behind the single existing `text-to-speech`
 * edge function, chosen there by which API secret is configured. Adding
 * BHASHINI_API_KEY to Supabase secrets is all that is needed to switch the app
 * onto Bhashini; no client change is required.
 *
 * This provider is never reached while the handset can speak the language
 * itself, and never while offline.
 */

import { supabase } from '@/integrations/supabase/client';
import { toLocale } from '@/services/tts/ttsLanguages';

export type CloudVendor = 'bhashini' | 'google' | 'none';

export interface CloudStatus {
  /** Vendors the backend has secrets for, in preference order. */
  available: CloudVendor[];
  /** Locales the preferred vendor can speak, when the backend reports them. */
  languages: string[];
}

let cachedStatus: CloudStatus | null = null;
let statusPromise: Promise<CloudStatus> | null = null;

/** Cheap audio cache so a repeated phrase is synthesised once per device. */
const audioCache = new Map<string, string>();
const AUDIO_CACHE_MAX = 120;

/**
 * One request per chunk. The engine prefetches the next chunk while the
 * current one plays and then asks for it again when its turn comes; without
 * this map that second ask was a second identical vendor call.
 */
const inFlight = new Map<string, Promise<string | null>>();

function evictOldest() {
  const oldest = audioCache.keys().next().value;
  if (!oldest) return;
  const url = audioCache.get(oldest);
  audioCache.delete(oldest);
  if (url && url.startsWith('blob:') && typeof URL !== 'undefined') URL.revokeObjectURL(url);
}

function cacheKey(text: string, locale: string, vendor: string) {
  return `${vendor}|${locale}|${text}`;
}

export const cloudProvider = {
  id: 'cloud' as const,

  /**
   * Ask the backend which vendors are configured. Cached for the session.
   * A backend with no speech secret reports none, and the app stays on device
   * speech without any error being shown to the farmer.
   */
  async status(): Promise<CloudStatus> {
    if (cachedStatus) return cachedStatus;
    if (statusPromise) return statusPromise;

    statusPromise = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('text-to-speech', {
          body: { action: 'status' },
        });
        if (error || !data) throw error || new Error('no status');
        cachedStatus = {
          available: Array.isArray(data.available) ? data.available : [],
          languages: Array.isArray(data.languages) ? data.languages : [],
        };
        return cachedStatus;
      } catch {
        // Not cached: a status call that failed because the farmer was offline
        // must not disable the cloud voice for the rest of the session. The
        // next request that needs cloud asks again.
        statusPromise = null;
        return { available: [], languages: [] };
      }
    })();

    return statusPromise;
  },

  async isEnabled(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const s = await this.status();
    return s.available.length > 0;
  },

  /**
   * Synthesise one prepared chunk and return a playable object URL.
   * Returns null when no vendor is configured or the call fails, so the caller
   * can fall back rather than surface an error to the farmer.
   */
  async synthesise(chunk: string, language: string): Promise<string | null> {
    const s = await this.status();
    const vendor = s.available[0];
    if (!vendor) return null;

    const locale = toLocale(language);
    const key = cacheKey(chunk, locale, vendor);
    const hit = audioCache.get(key);
    if (hit) return hit;

    const pending = inFlight.get(key);
    if (pending) return pending;

    const request = (async (): Promise<string | null> => {
      try {
        // format: 'binary' asks the function for the audio bytes themselves.
        // supabase-js hands a non-JSON body back as a Blob, which plays from an
        // object URL without the base64 decode and the 33% larger transfer.
        const { data, error } = await supabase.functions.invoke('text-to-speech', {
          body: { action: 'synthesize', text: chunk, language: locale, format: 'binary' },
        });
        if (error || !data) return null;

        let url: string;
        if (typeof Blob !== 'undefined' && data instanceof Blob) {
          if (data.size === 0) return null;
          url = URL.createObjectURL(data);
        } else if (data.audioContent) {
          // Older function build: base64 JSON.
          const mime = data.mimeType || 'audio/mpeg';
          url = `data:${mime};base64,${data.audioContent}`;
        } else {
          return null;
        }

        if (audioCache.size >= AUDIO_CACHE_MAX) evictOldest();
        audioCache.set(key, url);
        return url;
      } catch {
        return null;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, request);
    return request;
  },
  /**
   * Synthesise ahead of time into the same cache, so the next paragraph is
   * ready while the current one is still playing. Failures are ignored: the
   * normal path will simply synthesise it again when it is needed.
   */
  prefetch(chunk: string, language: string): void {
    void this.synthesise(chunk, language).catch(() => null);
  },

  /**
   * Called when a screen that reads aloud opens, so the vendor check is
   * already done by the time the farmer taps the speaker icon.
   */
  warmUp(): void {
    void this.status().catch(() => null);
  },


  clearCache(): void {
    for (const url of audioCache.values()) {
      if (url.startsWith('blob:') && typeof URL !== 'undefined') URL.revokeObjectURL(url);
    }
    audioCache.clear();
    inFlight.clear();
    cachedStatus = null;
    statusPromise = null;
  },
};
