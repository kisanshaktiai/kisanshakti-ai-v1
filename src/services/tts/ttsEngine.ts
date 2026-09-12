/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TTS ENGINE — the single source of truth for Read Aloud in this app
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every screen speaks through this one object. Before it existed, seven
 * entry points each had their own language map, their own text handling and
 * their own readiness rules, which is how the same bug kept reappearing in
 * different places.
 *
 * Order of preference, always:
 *   1. The device speech engine. Offline, free, no text leaves the handset.
 *   2. A cloud vendor, only when the device has no voice for that language,
 *      only when online, and only when the backend has a secret configured.
 *      Bhashini is preferred over Google when both are present.
 *   3. Nothing is spoken and voiceUnavailable is reported, so the screen can
 *      offer the system voice installer instead of reading in a wrong voice.
 *
 * A language is never faked. If neither the device nor a vendor can speak it,
 * the engine says so.
 */

import { prepareForSpeech } from '@/services/tts/ttsTextPrepare';
import { deviceProvider } from '@/services/tts/providers/deviceProvider';
import { cloudProvider } from '@/services/tts/providers/cloudProvider';
import { languageInfo, toLocale } from '@/services/tts/ttsLanguages';

export type SpeechSource = 'device' | 'cloud' | 'none';

/**
 * How the engine trades voice quality against network, cost and privacy.
 *
 *  auto          the default. Best voice available right now: a cloud voice
 *                when one is configured and the farmer is online, otherwise the
 *                best voice on the handset.
 *  high_quality  prefer a cloud voice wherever one exists.
 *  offline_first never leaves the handset. On-device local voices only.
 *  data_saver    on-device local voices only, and never an OS network voice.
 */
export type QualityMode = 'auto' | 'high_quality' | 'offline_first' | 'data_saver';

export interface SpeechOptions {
  /** 0.5 - 2.0. Slightly under 1 reads more naturally for Indian languages. */
  rate?: number;
  pitch?: number;
  volume?: number;
  /** Set false to forbid any cloud call for this request. */
  allowCloud?: boolean;
  /** Defaults to 'auto'. */
  quality?: QualityMode;
  /**
   * Whether a same-script voice from another language may stand in when the
   * farmer's own language has no voice, for example Hindi reading Marathi.
   *
   * Default FALSE. A Hindi voice pronouncing Marathi text is not Marathi
   * speech, and for a farmer being told a dose it is worse than being told
   * plainly that the voice is missing. Screens can opt in per request.
   */
  allowCrossLanguageVoice?: boolean;
}

export interface SpeechCallbacks {
  onStart?: (source: SpeechSource) => void;
  onChunk?: (index: number, total: number, chunk: string) => void;
  onProgress?: (percent: number) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export interface SpeechResult {
  success: boolean;
  source: SpeechSource;
  /** Locale actually spoken, when anything was spoken. */
  locale?: string;
  /** True when a same-script substitute was used instead of the exact language. */
  isFallback: boolean;
  /** True when neither the device nor any vendor can speak this language. */
  voiceUnavailable: boolean;
  error?: string;
}

const DEFAULTS = { rate: 0.95, pitch: 1.0, volume: 1.0 };

/**
 * No artificial gap between segments.
 * Segments are now paragraph sized, and the engine already produces its own
 * sentence pauses. Adding a fixed gap on top created the stop-start delivery
 * that made the reading sound mechanical.
 */
const INTER_CHUNK_PAUSE_MS = 0;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

class TTSEngine {
  private requestId = 0;
  private stopped = false;
  private paused = false;
  private speaking = false;
  private audio: HTMLAudioElement | null = null;

  isSupported(): boolean {
    return deviceProvider.isSupported();
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Display name of a locale, for telling the farmer which voice is being used. */
  describeLocale(locale: string): string {
    return languageInfo(locale)?.nativeName || locale;
  }

  /** Whether a cloud vendor is configured and reachable right now. */
  async cloudReady(): Promise<boolean> {
    return cloudProvider.isEnabled();
  }

  /**
   * Speak the text exactly as displayed to the farmer.
   * The text is prepared once here, so number safety, chunking and markup
   * handling are identical on every screen.
   */
  async speak(
    text: string,
    language: string,
    options: SpeechOptions = {},
    callbacks: SpeechCallbacks = {}
  ): Promise<SpeechResult> {
    if (!text?.trim()) {
      return { success: false, source: 'none', isFallback: false, voiceUnavailable: false, error: 'empty' };
    }

    this.stop();
    const id = ++this.requestId;
    this.stopped = false;
    this.paused = false;

    const opts = {
      rate: clamp(options.rate ?? DEFAULTS.rate, 0.5, 2.0),
      pitch: clamp(options.pitch ?? DEFAULTS.pitch, 0.5, 2.0),
      volume: clamp(options.volume ?? DEFAULTS.volume, 0, 1),
    };

    const { chunks } = prepareForSpeech(text);
    if (chunks.length === 0) {
      return { success: false, source: 'none', isFallback: false, voiceUnavailable: false, error: 'nothing-speakable' };
    }

    const mode: QualityMode = options.quality ?? 'auto';
    const cloudForbidden = options.allowCloud === false || mode === 'offline_first' || mode === 'data_saver';
    // data_saver and offline_first keep synthesis on the handset, so an OS
    // network voice is not acceptable either.
    const requireLocalVoice = mode === 'offline_first' || mode === 'data_saver';

    await deviceProvider.ready();

    let deviceLocale = await deviceProvider.resolveLocale(language);

    // A substitute voice from another language is not this language.
    if (deviceLocale?.isFallback && options.allowCrossLanguageVoice !== true) {
      deviceLocale = null;
    }

    const deviceVoice = deviceLocale ? await deviceProvider.bestVoice(language, requireLocalVoice) : null;
    const cloudAvailable = !cloudForbidden && (await cloudProvider.isEnabled());

    let source: SpeechSource = 'none';
    let isFallback = false;
    let locale = toLocale(language);

    // The handset speaks first whenever it genuinely has the farmer's language:
    // free, offline and instant. Cloud is the natural-sounding tier, used when
    // the farmer asks for it or when the device simply cannot speak the language.
    const preferCloud = cloudAvailable && (mode === 'high_quality' || !deviceLocale);

    if (preferCloud) {
      source = 'cloud';
    } else if (deviceLocale && (deviceVoice || !requireLocalVoice)) {
      source = 'device';
      isFallback = deviceLocale.isFallback;
      locale = deviceLocale.locale;
    } else if (cloudAvailable) {
      source = 'cloud';
    } else {
      callbacks.onError?.('voice-unavailable');
      return { success: false, source: 'none', isFallback: false, voiceUnavailable: true, error: 'voice-unavailable' };
    }

    const voiceIndex = deviceVoice?.index;

    this.speaking = true;
    callbacks.onStart?.(source);

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (this.stopped || id !== this.requestId) return this.interrupted(source, locale, isFallback);

        while (this.paused) {
          await new Promise((r) => setTimeout(r, 100));
          if (this.stopped || id !== this.requestId) return this.interrupted(source, locale, isFallback);
        }

        callbacks.onChunk?.(i, chunks.length, chunks[i]);
        callbacks.onProgress?.(Math.round((i / chunks.length) * 100));

        const ok =
          source === 'device'
            ? await deviceProvider.speakChunk(chunks[i], language, { ...opts, voiceIndex })
            : await this.playCloudChunk(chunks[i], language, opts);

        if (this.stopped || id !== this.requestId) return this.interrupted(source, locale, isFallback);

        if (!ok) {
          // A device failure mid-read falls through to cloud once, if allowed.
          if (source === 'device' && cloudAvailable) {
            source = 'cloud';
            const retried = await this.playCloudChunk(chunks[i], language, opts);
            if (!retried) {
              this.speaking = false;
              callbacks.onError?.('tts-failed');
              return { success: false, source, locale, isFallback, voiceUnavailable: false, error: 'tts-failed' };
            }
          } else if (source === 'cloud' && deviceLocale) {
            // A cloud failure must never leave the farmer with silence when the
            // handset could have spoken it.
            source = 'device';
            const spoken = await deviceProvider.speakChunk(chunks[i], language, { ...opts, voiceIndex });
            if (!spoken) {
              this.speaking = false;
              callbacks.onError?.('tts-failed');
              return { success: false, source, locale, isFallback, voiceUnavailable: false, error: 'tts-failed' };
            }
          } else {
            this.speaking = false;
            callbacks.onError?.('tts-failed');
            return { success: false, source, locale, isFallback, voiceUnavailable: false, error: 'tts-failed' };
          }
        }

        if (INTER_CHUNK_PAUSE_MS > 0 && i < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, INTER_CHUNK_PAUSE_MS));
        }
      }

      this.speaking = false;
      callbacks.onProgress?.(100);
      callbacks.onEnd?.();
      return { success: true, source, locale, isFallback, voiceUnavailable: false };
    } catch (e) {
      this.speaking = false;
      const message = e instanceof Error ? e.message : 'tts-failed';
      callbacks.onError?.(message);
      return { success: false, source, locale, isFallback, voiceUnavailable: false, error: message };
    }
  }

  private interrupted(source: SpeechSource, locale: string, isFallback: boolean): SpeechResult {
    this.speaking = false;
    return { success: true, source, locale, isFallback, voiceUnavailable: false };
  }

  /**
   * One audio element is reused for every chunk. iOS WKWebView only allows
   * playback on an element that was first started inside a user gesture, so
   * creating a fresh element per chunk gets the second chunk onwards blocked.
   */
  private getAudioElement(): HTMLAudioElement {
    if (!this.audio) this.audio = new Audio();
    return this.audio;
  }

  private async playCloudChunk(chunk: string, language: string, opts: { rate: number; volume: number }): Promise<boolean> {
    const url = await cloudProvider.synthesise(chunk, language);
    if (!url) return false;

    const audio = this.getAudioElement();

    return new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        audio.onended = null;
        audio.onerror = null;
        resolve(ok);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false);

      audio.src = url;
      audio.volume = opts.volume;
      audio.play()
        .then(() => {
          // playbackRate must be set after play() starts on WebKit.
          audio.playbackRate = opts.rate;
        })
        .catch(() => done(false));
    });
  }

  pause(): void {
    if (!this.speaking) return;
    this.paused = true;
    if (this.audio) this.audio.pause();
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.audio) void this.audio.play().catch(() => undefined);
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.resume();
  }

  stop(): void {
    this.stopped = true;
    this.paused = false;
    this.speaking = false;
    this.requestId++;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
    }
    deviceProvider.stop();
  }

  /** Android only. iOS has no voice installer, so this reports false there. */
  async openVoiceInstall(): Promise<boolean> {
    return deviceProvider.openVoiceInstall();
  }

  canInstallVoice(): boolean {
    return deviceProvider.canInstallVoice();
  }

  /**
   * iOS has no voice installer. Screens can use this to show a settings hint
   * instead of an Install button.
   */
  voiceInstallHintOnly(): boolean {
    return deviceProvider.isNative() && !deviceProvider.canInstallVoice();
  }
}

export const ttsEngine = new TTSEngine();
