import { afterEach, describe, expect, it } from 'vitest';
import { _setCropIndexForTests, cropName, resolveCrop } from './cropNames';

/**
 * The lands table holds the crop as free text in any language and case, and
 * sometimes a crops-row id. The resolver must give the name in the farmer's
 * language for every one of those forms, and the typed text when nothing matches.
 */
const rows = [
  { id: 'c-jowar', value: 'jowar', label: 'Jowar (Sorghum)', local_name: null, label_hi: 'ज्वार', label_mr: 'ज्वारी', label_te: 'జొన్న' },
  { id: 'c-rice', value: 'rice', label: 'Rice', local_name: null, label_hi: 'चावल', label_mr: 'भात / तांदूळ', label_te: null },
  { id: 'c-cane', value: 'sugarcane', label: 'Sugarcane', local_name: 'Oos', label_hi: 'गन्ना', label_mr: 'ऊस', label_te: 'చెరకు' },
];
const synonyms = [{ canonical_crop: 'rice', variant_name: 'Paddy' }];

describe('cropName', () => {
  afterEach(() => _setCropIndexForTests(null));

  it('gives the stored text until the crop table has arrived', () => {
    expect(cropName('Rice', undefined, 'mr')).toBe('Rice');
  });

  it('finds the crop by id first, then by text in any language or case', () => {
    _setCropIndexForTests(rows, synonyms);
    expect(cropName('anything', 'c-jowar', 'mr')).toBe('ज्वारी');
    expect(cropName('Jowar (Sorghum)', null, 'mr')).toBe('ज्वारी');
    expect(cropName('jowar', null, 'hi')).toBe('ज्वार');
    expect(cropName('sorghum', null, 'mr')).toBe('ज्वारी');
    expect(cropName('rice', null, 'mr')).toBe('भात / तांदूळ');
    expect(cropName('RICE', null, 'mr')).toBe('भात / तांदूळ');
    expect(cropName('तांदूळ', null, 'hi')).toBe('चावल');
    expect(cropName('ऊस', null, 'te')).toBe('చెరకు');
    expect(cropName('Paddy', null, 'mr')).toBe('भात / तांदूळ');
  });

  it('falls back to the English label when a language has no name, and to the text when the crop is unknown', () => {
    _setCropIndexForTests(rows, synonyms);
    expect(cropName('rice', null, 'te')).toBe('Rice');
    expect(cropName('Rice', null, 'en')).toBe('Rice');
    expect(cropName('Brinjal (Eggplant)', null, 'mr')).toBe('Brinjal (Eggplant)');
    expect(cropName('', null, 'mr')).toBe('');
    expect(resolveCrop(null)).toBeNull();
  });

  it('keeps the farmer\'s own local name ahead of the English label', () => {
    _setCropIndexForTests(rows, synonyms);
    expect(cropName('sugarcane', null, 'en')).toBe('Oos');
  });
});
