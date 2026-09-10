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
      } catch {
        cachedStatus = { available: [], languages: [] };
      }
      return cachedStatus;
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

    try {
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { action: 'synthesize', text: chunk, language: locale },
      });
      if (error || !data?.audioContent) return null;

      const mime = data.mimeType || 'audio/mpeg';
      const url = `data:${mime};base64,${data.audioContent}`;

      if (audioCache.size >= AUDIO_CACHE_MAX) {
        const oldest = audioCache.keys().next().value;
        if (oldest) audioCache.delete(oldest);
      }
      audioCache.set(key, url);
      return url;
    } catch {
      return null;
    }
  },

  clearCache(): void {
    audioCache.clear();
    cachedStatus = null;
    statusPromise = null;
  },
};
