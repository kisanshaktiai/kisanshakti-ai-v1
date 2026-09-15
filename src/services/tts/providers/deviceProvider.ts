/**
 * Device speech provider — the primary source of truth for Read Aloud.
 *
 * Runs entirely on the handset: no network, no cost, no farmer text leaving the
 * device. Native uses the system speech engine through nativeTTSService; the
 * browser/PWA uses the Web Speech API restricted to voices the browser reports
 * as local.
 */

import { Capacitor } from '@capacitor/core';
import { nativeTTSService } from '@/services/nativeTTSService';
import { baseOf, toLocale } from '@/services/tts/ttsLanguages';
import { pickBestVoice, toDeviceVoice, type DeviceVoice } from '@/services/tts/ttsVoiceQuality';

export interface SpeakChunkOptions {
  rate: number;
  pitch: number;
  volume: number;
  /** Index into the device voice list, chosen for quality. */
  voiceIndex?: number;
}

let voiceCache: DeviceVoice[] | null = null;

const VOICES_READY_TIMEOUT_MS = 1500;

function webSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis;
}

/** Resolve once the browser has voices, or after a short timeout. */
function waitForWebVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = webSynth();
    if (!synth) return resolve([]);

    const existing = synth.getVoices();
    if (existing.length > 0) return resolve(existing);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.onvoiceschanged = null;
      resolve(synth.getVoices());
    };
    synth.onvoiceschanged = finish;
    setTimeout(finish, VOICES_READY_TIMEOUT_MS);
  });
}

export const deviceProvider = {
  id: 'device' as const,

  isNative(): boolean {
    return Capacitor.isNativePlatform();
  },

  /**
   * Whether this platform can open a voice installer at all.
   * Android launches the system voice-data screen. iOS has no equivalent and
   * the plugin's openInstall is an empty stub that resolves without doing
   * anything, so offering the farmer an Install button there would clear the
   * warning and change nothing.
   */
  canInstallVoice(): boolean {
    return Capacitor.getPlatform() === 'android';
  },

  isSupported(): boolean {
    return Capacitor.isNativePlatform() || !!webSynth();
  },

  async ready(): Promise<void> {
    if (Capacitor.isNativePlatform()) await nativeTTSService.ensureInitialized();
  },

  /**
   * Which locale this device would actually speak the language in.
   * Returns null when the handset has no voice for it or its same-script
   * fallback, so the caller can move to a cloud provider or offer the installer.
   */
  /**
   * The device's voices, with an inferred quality tier.
   * Cached for the session; the list only changes when the farmer installs a
   * voice, and that path already refreshes it.
   */
  async listVoices(): Promise<DeviceVoice[]> {
    if (voiceCache) return voiceCache;

    if (Capacitor.isNativePlatform()) {
      const raw = await nativeTTSService.getDeviceVoices();
      voiceCache = raw.map((v, i) => toDeviceVoice(v as Record<string, never>, i));
    } else {
      const voices = await waitForWebVoices();
      voiceCache = voices.map((v, i) =>
        toDeviceVoice({ name: v.name, lang: v.lang, voiceURI: v.voiceURI, localService: v.localService }, i)
      );
    }
    return voiceCache;
  },

  refreshVoices(): void {
    voiceCache = null;
  },

  /**
   * Best available voice for this language under the current policy.
   * requireLocal keeps speech on the handset: no network voice is returned.
   */
  async bestVoice(language: string, requireLocal: boolean): Promise<DeviceVoice | null> {
    const voices = await this.listVoices();
    return pickBestVoice(voices, toLocale(language), requireLocal);
  },

  async resolveLocale(language: string): Promise<{ locale: string; isFallback: boolean } | null> {
    if (Capacitor.isNativePlatform()) {
      await nativeTTSService.ensureInitialized();
      const r = nativeTTSService.getLanguageCode(language);
      if (!r.available) return null;
      return { locale: r.code, isFallback: r.isFallback };
    }

    const voices = await waitForWebVoices();
    const requested = toLocale(language);
    const base = baseOf(requested);
    const matching = voices.filter((v) => baseOf(v.lang) === base);
    if (matching.length === 0) return null;

    const local = matching.filter((v) => v.localService);
    const chosen = local[0] || matching[0];
    return { locale: chosen.lang || requested, isFallback: false };
  },

  /** Speak one prepared chunk. Resolves when the chunk has finished. */
  async speakChunk(chunk: string, language: string, opts: SpeakChunkOptions): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      const result = await nativeTTSService.speak(
        chunk,
        language,
        { rate: opts.rate, pitch: opts.pitch, volume: opts.volume, voiceIndex: opts.voiceIndex },
        {}
      );
      return result.success;
    }

    const synth = webSynth();
    if (!synth) return false;

    const voices = await waitForWebVoices();
    const requested = toLocale(language);
    const base = baseOf(requested);
    const matching = voices.filter((v) => baseOf(v.lang) === base);
    const voice =
      typeof opts.voiceIndex === 'number' && voices[opts.voiceIndex]
        ? voices[opts.voiceIndex]
        : matching.filter((v) => v.localService)[0] || matching[0] || null;
    if (!voice) return false;

    return new Promise<boolean>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.voice = voice;
      utterance.lang = voice.lang || requested;
      utterance.rate = opts.rate;
      utterance.pitch = opts.pitch;
      utterance.volume = opts.volume;
      utterance.onend = () => resolve(true);
      utterance.onerror = (e) => {
        const err = (e as SpeechSynthesisErrorEvent).error;
        resolve(err === 'canceled' || err === 'interrupted');
      };
      synth.speak(utterance);
    });
  },

  stop(): void {
    const synth = webSynth();
    if (synth) synth.cancel();
    if (Capacitor.isNativePlatform()) nativeTTSService.stop();
  },

  /**
   * Open the system voice-data screen. Android launches the installer; iOS has
   * no equivalent and the plugin resolves without doing anything, so this
   * reports false there rather than pretending a voice was installed.
   */
  async openVoiceInstall(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') return false;
    const opened = await nativeTTSService.openVoiceInstall();
    if (opened) {
      await nativeTTSService.refreshDeviceLanguages();
      voiceCache = null;
    }
    return opened;
  },
};
