import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preserveTriggerManagedProfileFields, validateFarmerProfilePayload } from '../../supabase/functions/_shared/farmer-profile';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), token: 'verified-session' }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
  getSessionToken: () => mocks.token,
  setSessionToken: vi.fn(),
}));

import { farmerAuthService } from '@/services/farmerAuthService';

describe('farmer profile verified-session contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ data: { farmer: { id: 'server-farmer' }, profile: null }, error: null });
  });

  it('sends profile fields and the session token without client farmer or tenant IDs', async () => {
    await farmerAuthService.updateFarmerProfile({ fullName: 'Shinghan Mal', village: 'Dewale' });
    const [, request] = mocks.invoke.mock.calls[0];
    expect(request.body.action).toBe('updateFarmerProfile');
    expect(request.body.sessionToken).toBe('verified-session');
    expect(request.body.profile).toEqual({ fullName: 'Shinghan Mal', village: 'Dewale' });
    expect(request.body).not.toHaveProperty('farmerId');
    expect(request.body).not.toHaveProperty('tenantId');
    expect(request.body.profile).not.toHaveProperty('farmerId');
    expect(request.body.profile).not.toHaveProperty('tenantId');
  });

  it('reads the profile using only the verified session', async () => {
    await farmerAuthService.getFarmerProfile();
    expect(mocks.invoke).toHaveBeenCalledWith('tenant-config', {
      body: { action: 'getFarmerProfile', sessionToken: 'verified-session' },
    });
  });

  it('maps all profile-owned fields and ignores identity or privilege keys', () => {
    const result = validateFarmerProfilePayload({
      fullName: 'Shinghan Mal', displayName: 'Shinghan', totalLandAcres: 2.5,
      farmingExperienceYears: 12, primaryCrops: ['Jowar', 'Soybean'], hasIrrigation: true,
      preferredLanguage: 'mr', farmerId: 'spoofed', tenantId: 'spoofed', isVerified: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patches.farmer).toMatchObject({
      farmer_name: 'Shinghan Mal', total_land_acres: 2.5,
      farming_experience_years: 12, primary_crops: ['Jowar', 'Soybean'],
      has_irrigation: true, language_preference: 'mr',
    });
    expect(result.patches.profile).toMatchObject({
      full_name: 'Shinghan Mal', display_name: 'Shinghan', total_land_acres: 2.5,
      farming_experience_years: 12, primary_crops: ['Jowar', 'Soybean'],
      has_irrigation: true, preferred_language: 'mr',
    });
    expect(JSON.stringify(result.patches)).not.toContain('spoofed');
  });

  it('rejects invalid numbers, languages and empty writes', () => {
    expect(validateFarmerProfilePayload({ totalLandAcres: -1 }).ok).toBe(false);
    expect(validateFarmerProfilePayload({ farmingExperienceYears: 1.5 }).ok).toBe(false);
    expect(validateFarmerProfilePayload({ preferredLanguage: 'not-a-language' }).ok).toBe(false);
    expect(validateFarmerProfilePayload({ farmerId: 'spoofed' }).ok).toBe(false);
  });

  it('preserves saved address and identity fields across a partial farmer sync', () => {
    const existing = { full_name: 'Saved Name', village: 'Dewale', pincode: '416213', gender: 'Female' };
    expect(preserveTriggerManagedProfileFields({ total_land_acres: 3 }, existing, true)).toEqual({
      total_land_acres: 3, full_name: 'Saved Name', village: 'Dewale', pincode: '416213', gender: 'Female',
    });
    expect(preserveTriggerManagedProfileFields({ village: 'New Village' }, existing, true)).toMatchObject({
      village: 'New Village', full_name: 'Saved Name', pincode: '416213',
    });
    expect(preserveTriggerManagedProfileFields({ avatar_url: 'https://example.test/a.jpg' }, existing, false))
      .toEqual({ avatar_url: 'https://example.test/a.jpg' });
  });
});
