import { describe, expect, it } from 'vitest';
import { phSide, readSoil, scalePosition, textureShares } from './soilInterpretation';
import type { SoilRating } from '@/services/soil/soilReport';

// Rows as stored in soil_test_interpretation on 2026-11-18.
const OC: SoilRating = { parameter: 'organic_carbon', extraction_method: 'Walkley-Black', unit: '%', low_below: '0.5', medium_low: '0.5', medium_high: '0.75', high_above: '0.75', review_status: 'confirmed_convention', source: null, authority: null };
const N: SoilRating = { parameter: 'available_nitrogen', extraction_method: 'alkaline KMnO4', unit: 'kg/ha', low_below: '280', medium_low: '280', medium_high: '560', high_above: '560', review_status: 'confirmed_convention', source: null, authority: null };
const P: SoilRating = { parameter: 'available_phosphorus', extraction_method: 'Olsen', unit: 'kg/ha', low_below: '11', medium_low: '11', medium_high: '22', high_above: '22', review_status: 'pending_agronomist', source: null, authority: null };
const ratings = [OC, N, P];

describe('readSoil', () => {
  it('labels a lab value from a confirmed governed row', () => {
    expect(readSoil('available_nitrogen', 180, ratings, 'lab')).toMatchObject({ band: 'low', bands: { lowBelow: 280, highAbove: 560 } });
    expect(readSoil('available_nitrogen', 400, ratings, 'lab').band).toBe('medium');
    expect(readSoil('organic_carbon', '0.82', ratings, 'lab').band).toBe('high');
    expect(readSoil('organic_carbon', 0.75, ratings, 'lab').band).toBe('medium');
  });
  it('gives no verdict while the row is under agronomist review', () => {
    expect(readSoil('available_phosphorus', 9, ratings, 'lab')).toMatchObject({ band: null, value: 9, noVerdictReason: 'rating_under_review' });
  });
  it('never labels satellite carbon with the Walkley-Black lab band', () => {
    expect(readSoil('organic_carbon', 1.93, ratings, 'satellite')).toMatchObject({ band: null, value: 1.93, noVerdictReason: 'method_differs' });
  });
  it('gives no verdict without a governed row (pH today)', () => {
    expect(readSoil('ph', 6.7, ratings, 'satellite')).toMatchObject({ band: null, value: 6.7, noVerdictReason: 'no_rating' });
  });
  it('a missing value carries no reason and no band', () => {
    expect(readSoil('available_nitrogen', null, ratings, 'lab')).toMatchObject({ value: null, band: null, noVerdictReason: null });
  });
});

describe('helpers', () => {
  it('phSide uses the chemical neutral point only', () => {
    expect(phSide(6.7)).toBe('below');
    expect(phSide(7.04)).toBe('at');
    expect(phSide(8.1)).toBe('above');
    expect(phSide(null)).toBeNull();
  });
  it('textureShares normalises to the parts given', () => {
    const s = textureShares(43.7, 22.1, 34.2)!;
    expect(Math.round(s.sand + s.silt + s.clay)).toBe(100);
    expect(textureShares(40, null, 30)).toBeNull();
  });
  it('scalePosition clamps', () => {
    expect(scalePosition(7, 3, 11)).toBe(50);
    expect(scalePosition(20, 3, 11)).toBe(100);
  });
});
