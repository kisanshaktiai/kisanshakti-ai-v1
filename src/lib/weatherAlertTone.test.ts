import { describe, expect, it } from 'vitest';
import { resolveWeatherAlertTone } from './weatherAlertTone';

describe('resolveWeatherAlertTone', () => {
  it('uses the official IMD color code when present', () => {
    expect(resolveWeatherAlertTone(
      { provider: 'IMD', severity: 'high', color_code: 2 },
      { provider: 'OpenWeather', main: 'Rain', description: 'light rain' },
    )).toContain('text-warning');
  });

  it('uses an authenticated provider condition when no formal alert is available', () => {
    expect(resolveWeatherAlertTone(
      null,
      { provider: 'OpenWeather', main: 'Rain', description: 'light rain' },
    )).toContain('text-chat-section-green-icon');
  });

  it('does not invent an alert color without provider provenance', () => {
    expect(resolveWeatherAlertTone(
      null,
      { main: 'Rain', description: 'heavy rain' },
    )).toContain('text-info');
  });
});