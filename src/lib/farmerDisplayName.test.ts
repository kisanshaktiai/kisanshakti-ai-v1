import { describe, expect, it } from 'vitest';
import { resolveFarmerDisplayName } from './farmerDisplayName';

describe('resolveFarmerDisplayName', () => {
  it('prefers the saved display name and returns its first name', () => {
    expect(resolveFarmerDisplayName({ displayName: 'Savita Patil', name: 'KIS000026' }, 'Farmer')).toBe('Savita');
  });

  it('never presents a farmer code as a person name', () => {
    expect(resolveFarmerDisplayName({ name: 'KIS000026' }, 'Farmer')).toBe('Farmer');
  });
});