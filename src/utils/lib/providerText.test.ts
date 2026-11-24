import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/config', () => ({
  default: {
    language: 'en',
    exists: (key: string) => key === 'provider.errors.PROVIDER_RATE_REQUIRED' || key === 'provider.errors.generic',
    t: (key: string, options?: { defaultValue?: string }) =>
      key === 'provider.catalogue.unit.PER_ACRE' ? 'translated-acre' : options?.defaultValue ?? key,
  },
}));

import {
  catalogueLabel, clockValue, monthName, numberOrNull, providerErrorMessage, serviceRateText, weekdayName,
} from './providerText';

describe('providerText', () => {
  it('shows the translation of a catalogue code, else the label stored with the row, else the code', () => {
    expect(catalogueLabel('unit', 'PER_ACRE', 'Per acre')).toBe('translated-acre');
    expect(catalogueLabel('unit', 'PER_NEW_UNIT', 'Stored label')).toBe('Stored label');
    expect(catalogueLabel('unit', 'PER_NEW_UNIT')).toBe('PER_NEW_UNIT');
    expect(catalogueLabel('unit', null)).toBe('');
  });

  it('maps an error code to its key and anything else to the generic key', () => {
    expect(providerErrorMessage({ code: 'PROVIDER_RATE_REQUIRED' })).toBe('provider.errors.PROVIDER_RATE_REQUIRED');
    expect(providerErrorMessage({ code: 'SOMETHING_ELSE' })).toBe('provider.errors.generic');
    expect(providerErrorMessage(new Error('boom'))).toBe('provider.errors.generic');
  });

  it('counts weekdays from Sunday = 0 and months from January = 1, like the server', () => {
    expect(weekdayName(0)).toBe('Sunday');
    expect(weekdayName(6)).toBe('Saturday');
    expect(monthName(1)).toBe('January');
    expect(monthName(12)).toBe('December');
  });

  it('reads an empty field as "not given"', () => {
    expect(numberOrNull('')).toBeNull();
    expect(numberOrNull('  ')).toBeNull();
    expect(numberOrNull('abc')).toBeNull();
    expect(numberOrNull('0')).toBe(0);
    expect(numberOrNull(' 12.5 ')).toBe(12.5);
  });

  it('cuts a server time to hours and minutes', () => {
    expect(clockValue('16:00:00')).toBe('16:00');
    expect(clockValue('07:30')).toBe('07:30');
    expect(clockValue(null)).toBe('');
  });

  it('shows only the unit for a service with no rate', () => {
    const units = [{ code: 'NEGOTIABLE', label_en: 'Negotiable', is_per_area: false, is_negotiable: true }];
    expect(serviceRateText({ base_rate: null, currency: 'INR', pricing_unit: 'NEGOTIABLE' }, units)).toBe('Negotiable');
  });
});
