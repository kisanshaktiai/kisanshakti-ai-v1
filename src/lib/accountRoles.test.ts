import { describe, expect, it } from 'vitest';
import {
  ROUTE_ONBOARDING,
  activeRolesOf,
  holdsActiveRole,
  isFarmerOnly,
  landingRouteFor,
  needsOnboarding,
  normaliseRoles,
  radiusSteps,
  roleStatusOf,
  workspaceRoleOf,
  type AccountSummary,
} from './accountRoles';

const account = (over: Partial<AccountSummary>): AccountSummary => ({
  id: 'acc-1',
  tenantId: 'tenant-1',
  displayName: 'Test Person',
  avatarUrl: null,
  languageCode: 'en',
  mobileMasked: '98****10',
  roles: [],
  activeRole: null,
  ...over,
});

describe('accountRoles', () => {
  it('lists only ACTIVE roles, in display order', () => {
    const a = account({
      roles: [
        { role: 'CUSTOMER', status: 'ACTIVE' },
        { role: 'SERVICE_PROVIDER', status: 'SUSPENDED' },
        { role: 'FARMER', status: 'ACTIVE' },
      ],
    });
    expect(activeRolesOf(a)).toEqual(['FARMER', 'CUSTOMER']);
    expect(holdsActiveRole(a, 'SERVICE_PROVIDER')).toBe(false);
    expect(roleStatusOf(a, 'SERVICE_PROVIDER')).toBe('SUSPENDED');
    expect(roleStatusOf(account({}), 'FARMER')).toBeNull();
  });

  it('no account on the device means no workspace decision (flag off path)', () => {
    expect(workspaceRoleOf(null)).toBeNull();
    expect(landingRouteFor(null)).toBeNull();
    expect(needsOnboarding(null)).toBe(false);
  });

  it('opens the session role when it is still held', () => {
    const a = account({
      roles: [{ role: 'FARMER', status: 'ACTIVE' }, { role: 'CUSTOMER', status: 'ACTIVE' }],
      activeRole: 'CUSTOMER',
    });
    expect(workspaceRoleOf(a)).toBe('CUSTOMER');
    expect(landingRouteFor(a)).toBe('/customer');
  });

  it('falls back to a held role when the session role is no longer active', () => {
    const a = account({
      roles: [{ role: 'FARMER', status: 'ACTIVE' }, { role: 'CUSTOMER', status: 'SUSPENDED' }],
      activeRole: 'CUSTOMER',
    });
    expect(workspaceRoleOf(a)).toBe('FARMER');
    expect(landingRouteFor(a)).toBe('/app');
  });

  it('a person with no active role has no workspace', () => {
    const a = account({ roles: [{ role: 'CUSTOMER', status: 'SUSPENDED' }], activeRole: 'CUSTOMER' });
    expect(workspaceRoleOf(a)).toBeNull();
    expect(landingRouteFor(a)).toBeNull();
  });

  it('sends a non-farmer without a display name to onboarding, never a farmer', () => {
    const provider = account({
      displayName: null,
      roles: [{ role: 'SERVICE_PROVIDER', status: 'ACTIVE' }],
      activeRole: 'SERVICE_PROVIDER',
    });
    expect(needsOnboarding(provider)).toBe(true);
    expect(landingRouteFor(provider)).toBe(ROUTE_ONBOARDING);

    const farmer = account({
      displayName: null,
      roles: [{ role: 'FARMER', status: 'ACTIVE' }],
      activeRole: 'FARMER',
    });
    expect(needsOnboarding(farmer)).toBe(false);
    expect(landingRouteFor(farmer)).toBe('/app');
  });

  it('recognises the "Farmer only" registration choice', () => {
    expect(isFarmerOnly(['FARMER'])).toBe(true);
    expect(isFarmerOnly(['FARMER', 'CUSTOMER'])).toBe(false);
    expect(isFarmerOnly(['CUSTOMER'])).toBe(false);
    expect(isFarmerOnly([])).toBe(false);
  });

  it('normalises stored role choices', () => {
    expect(normaliseRoles(['CUSTOMER', 'x', 'FARMER', 'CUSTOMER', 7])).toEqual(['FARMER', 'CUSTOMER']);
    expect(normaliseRoles('FARMER')).toEqual([]);
    expect(normaliseRoles(null)).toEqual([]);
  });

  it('builds slider steps from the policy and refuses a broken policy', () => {
    expect(radiusSteps(5, 25, 5)).toEqual([5, 10, 15, 20, 25]);
    expect(radiusSteps(5, 100, 5)).toHaveLength(20);
    expect(radiusSteps(5, 25, 0)).toEqual([]);
    expect(radiusSteps(30, 25, 5)).toEqual([]);
  });
});
