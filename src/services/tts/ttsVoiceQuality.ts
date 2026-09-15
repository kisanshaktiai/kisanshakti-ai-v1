/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEVICE VOICE QUALITY — availability is not quality
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A handset reporting mr-IN does not mean it has a voice worth listening to.
 * That distinction is why Read Aloud could be technically correct and still
 * sound like a machine.
 *
 * IMPORTANT LIMITATION, verified against @capacitor-community/text-to-speech
 * v6.1.0 `src/definitions.ts`: the plugin's SpeechSynthesisVoice exposes only
 * `default`, `lang`, `localService`, `name` and `voiceURI`. There is NO quality
 * field, even though AVSpeechSynthesisVoice carries one natively on iOS. So
 * quality here is INFERRED from the voice identifier, not read from the OS.
 * These are documented naming conventions, not guarantees; a voice that
 * matches nothing scores as unknown rather than being rejected.
 *
 * `speak()` does accept `voice: number`, an index into getSupportedVoices(),
 * so once a voice is chosen it can actually be used.
 */

export type VoiceQuality = 'premium' | 'enhanced' | 'network' | 'standard' | 'unknown';

export interface DeviceVoice {
  index: number;
  name: string;
  lang: string;
  voiceURI: string;
  /** Reported by the platform: true when synthesis happens on the handset. */
  local: boolean;
  quality: VoiceQuality;
  /** Higher is better. Used only to order candidates for the same language. */
  score: number;
}

const QUALITY_SCORE: Record<VoiceQuality, number> = {
  premium: 100,
  enhanced: 80,
  network: 60,
  standard: 40,
  unknown: 30,
};

/**
 * Infer quality from the identifier.
 *
 * iOS: Apple voice identifiers carry the tier, for example
 *   com.apple.voice.premium.hi-IN.Lekha
 *   com.apple.voice.enhanced.hi-IN.Lekha
 *   com.apple.ttsbundle.Lekha-compact
 *
 * Android: Google's speech engine names voices with a network or local suffix,
 * for example mr-in-x-mrf-network and mr-in-x-mrf-local. The network variants
 * are the higher-quality ones and cost nothing, but they need connectivity and
 * the text is sent to Google by the OS, so they are only chosen when the
 * quality policy allows it.
 */
export function inferQuality(voiceURI: string, name: string): VoiceQuality {
  const id = `${voiceURI} ${name}`.toLowerCase();

  if (id.includes('premium')) return 'premium';
  if (id.includes('enhanced')) return 'enhanced';
  if (id.includes('-network') || id.endsWith('network')) return 'network';
  if (id.includes('compact') || id.includes('-local') || id.endsWith('local')) return 'standard';
  return 'unknown';
}

export function toDeviceVoice(
  raw: { name?: string; lang?: string; voiceURI?: string; localService?: boolean },
  index: number
): DeviceVoice {
  const name = raw.name || '';
  const voiceURI = raw.voiceURI || '';
  const quality = inferQuality(voiceURI, name);

  return {
    index,
    name,
    lang: raw.lang || '',
    voiceURI,
    local: raw.localService !== false,
    quality,
    score: QUALITY_SCORE[quality],
  };
}

/**
 * Pick the best voice for a locale under the current policy.
 * `requireLocal` is set when the farmer is offline or has chosen to keep speech
 * on the handset; a network voice is then never returned.
 */
export function pickBestVoice(
  voices: DeviceVoice[],
  locale: string,
  requireLocal: boolean
): DeviceVoice | null {
  const base = locale.split('-')[0].toLowerCase();

  let candidates = voices.filter((v) => v.lang.split('-')[0].toLowerCase() === base);
  if (candidates.length === 0) return null;

  const exact = candidates.filter((v) => v.lang.toLowerCase() === locale.toLowerCase());
  if (exact.length > 0) candidates = exact;

  if (requireLocal) {
    const local = candidates.filter((v) => v.local);
    if (local.length === 0) return null;
    candidates = local;
  }

  return [...candidates].sort((a, b) => b.score - a.score)[0] || null;
}
