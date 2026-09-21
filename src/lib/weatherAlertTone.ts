export interface WeatherAlertSignal {
  provider?: string | null;
  severity?: string | null;
  color_code?: number | null;
}

export interface ProviderWeatherSignal {
  provider?: string | null;
  main?: string | null;
  description?: string | null;
}

const TONES = {
  neutral: 'text-info bg-info/15 border-info/25',
  blue: 'text-chat-section-blue-icon bg-chat-section-blue-bg border-chat-section-blue-border',
  green: 'text-chat-section-green-icon bg-chat-section-green-bg border-chat-section-green-border',
  yellow: 'text-chat-section-yellow-icon bg-chat-section-yellow-bg border-chat-section-yellow-border',
  orange: 'text-warning bg-warning-soft border-warning/40',
  red: 'text-chat-section-red-icon bg-chat-section-red-bg border-chat-section-red-border',
  purple: 'text-chat-section-purple-icon bg-chat-section-purple-bg border-chat-section-purple-border',
} as const;

/** Probability colors are deliberately simple for quick field decisions. */
export function resolveRainProbabilityTone(probability: number): string {
  const value = Math.max(0, Math.min(100, probability));
  if (value <= 20) return TONES.blue;
  if (value <= 40) return TONES.green;
  if (value <= 60) return TONES.yellow;
  if (value <= 80) return TONES.orange;
  return TONES.red;
}

/** Temperature bands use familiar cool-to-hot semantic colors. */
export function resolveTemperatureTone(temperatureC: number | null | undefined): string {
  if (temperatureC == null || !Number.isFinite(temperatureC)) return 'text-foreground';
  if (temperatureC <= 15) return 'text-chat-section-blue-icon';
  if (temperatureC <= 25) return 'text-chat-section-green-icon';
  if (temperatureC <= 32) return 'text-chat-section-yellow-icon';
  if (temperatureC <= 38) return 'text-warning';
  return 'text-chat-section-red-icon';
}

/**
 * Uses only classifications supplied by an authenticated weather provider.
 * Rain probability is deliberately excluded: a percentage is not an alert level.
 */
export function resolveWeatherAlertTone(
  alert: WeatherAlertSignal | null | undefined,
  weather: ProviderWeatherSignal | null | undefined,
): string {
  if (alert?.provider) {
    if (alert.provider.toUpperCase() === 'IMD') {
      if (alert.color_code === 1) return TONES.red;
      if (alert.color_code === 2) return TONES.orange;
      if (alert.color_code === 3) return TONES.yellow;
      if (alert.color_code === 4) return TONES.green;
    }

    const severity = alert.severity?.trim().toLowerCase();
    if (severity && /extreme|catastrophic|emergency/.test(severity)) return TONES.purple;
    if (severity && /severe|very high|critical/.test(severity)) return TONES.red;
    if (severity && /high|heavy/.test(severity)) return TONES.orange;
    if (severity && /moderate|medium/.test(severity)) return TONES.yellow;
    if (severity && /low|minor|none|green/.test(severity)) return TONES.green;
  }

  // When no formal alert is available, use the provider's exact condition
  // classification. This never derives severity from the probability value.
  if (!weather?.provider) return TONES.neutral;
  const condition = `${weather.main ?? ''} ${weather.description ?? ''}`.trim().toLowerCase();
  if (/hail|extreme|torrential/.test(condition)) return TONES.purple;
  if (/thunderstorm|very heavy/.test(condition)) return TONES.red;
  if (/heavy rain|downpour/.test(condition)) return TONES.orange;
  if (/moderate rain/.test(condition)) return TONES.yellow;
  if (/very light|drizzle|snow/.test(condition)) return TONES.blue;
  if (/light rain|mist|sprinkle/.test(condition)) return TONES.green;
  return TONES.neutral;
}