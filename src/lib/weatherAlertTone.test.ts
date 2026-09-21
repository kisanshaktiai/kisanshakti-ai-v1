import { describe, expect, it } from 'vitest';
import {
  resolveRainProbabilityTone,
  resolveTemperatureTone,
  resolveWeatherAlertTone,
} from './weatherAlertTone';

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

describe('farmer-friendly weather value colors', () => {
  it('moves rain probability from blue through warning colors to red', () => {
    expect(resolveRainProbabilityTone(10)).toContain('blue');
    expect(resolveRainProbabilityTone(35)).toContain('green');
    expect(resolveRainProbabilityTone(55)).toContain('yellow');
    expect(resolveRainProbabilityTone(70)).toContain('warning');
    expect(resolveRainProbabilityTone(100)).toContain('red');
  });

  it('moves temperature from cool blue to hot red', () => {
    expect(resolveTemperatureTone(12)).toContain('blue');
    expect(resolveTemperatureTone(22)).toContain('green');
    expect(resolveTemperatureTone(30)).toContain('yellow');
    expect(resolveTemperatureTone(36)).toContain('warning');
    expect(resolveTemperatureTone(42)).toContain('red');
  });
});