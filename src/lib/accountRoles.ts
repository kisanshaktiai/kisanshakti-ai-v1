/**
 * accountRoles — pure helpers for the multi-role identity (Farmer, Service
 * Provider, Customer). No React, no storage, no network: safe to unit-test.
 *
 * The shapes mirror the `account` object returned by the auth core
 * (supabase/functions/_shared/farmer-auth-core.ts → accountSummary).
 */

export type AccountRole = 'FARMER' | 'SERVICE_PROVIDER' | 'CUSTOMER';
export type AccountRoleStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'REVOKED';

export interface AccountRoleEntry {
  role: AccountRole;
  status: AccountRoleStatus;
}

export interface AccountSummary {
  id: string;
  tenantId: string;
  displayName: string | null;
  avatarUrl: string | null;
  languageCode: string | null;
  mobileMasked: string | null;
  roles: AccountRoleEntry[];
  activeRole: AccountRole | null;
}

/** Display order everywhere a list of roles is shown. */
export const ACCOUNT_ROLES: readonly AccountRole[] = ['FARMER', 'SERVICE_PROVIDER', 'CUSTOMER'];

/** Home route of each workspace. The farmer workspace is today's app. */
export const WORKSPACE_HOME: Record<AccountRole, string> = {
  FARMER: '/app',
  SERVICE_PROVIDER: '/provider',
  CUSTOMER: '/customer',
};

export const ROUTE_CHOOSE_ROLES = '/choose-roles';
export const ROUTE_ONBOARDING = '/welcome';
export const ROUTE_ROLES = '/roles';

export const isAccountRole = (value: unknown): value is AccountRole =>
  typeof value === 'string' && (ACCOUNT_ROLES as readonly string[]).includes(value);

/** Roles the person can open right now, in display order. */
export function activeRolesOf(account: AccountSummary | null | undefined): AccountRole[] {
  if (!account?.roles) return [];
  const active = new Set(account.roles.filter((r) => r.status === 'ACTIVE').map((r) => r.role));
  return ACCOUNT_ROLES.filter((r) => active.has(r));
}

export function holdsActiveRole(account: AccountSummary | null | undefined, role: AccountRole): boolean {
  return activeRolesOf(account).includes(role);
}

export function roleStatusOf(
  account: AccountSummary | null | undefined,
  role: AccountRole,
): AccountRoleStatus | null {
  return account?.roles?.find((r) => r.role === role)?.status ?? null;
}

/**
 * The workspace this session belongs in. Null means "no account is known on
 * this device" (flag off, or a farmer who has not logged in since the flag
 * came on) — callers must then behave exactly as before.
 */
export function workspaceRoleOf(account: AccountSummary | null | undefined): AccountRole | null {
  if (!account) return null;
  const held = activeRolesOf(account);
  if (account.activeRole && held.includes(account.activeRole)) return account.activeRole;
  return held[0] ?? null;
}

/** Onboarding is owed while a non-farmer workspace has no display name yet. */
export function needsOnboarding(account: AccountSummary | null | undefined): boolean {
  const role = workspaceRoleOf(account);
  if (!account || !role || role === 'FARMER') return false;
  return !(account.displayName && account.displayName.trim());
}

/** Where a session with this account should land. */
export function landingRouteFor(account: AccountSummary | null | undefined): string | null {
  const role = workspaceRoleOf(account);
  if (!role) return null;
  if (needsOnboarding(account)) return ROUTE_ONBOARDING;
  return WORKSPACE_HOME[role];
}

/**
 * True when the choice made on the registration step is "Farmer only" — the
 * case that must run today's registration unchanged.
 */
export function isFarmerOnly(roles: readonly AccountRole[]): boolean {
  return roles.length === 1 && roles[0] === 'FARMER';
}

/** Keep only valid role codes, without duplicates, in display order. */
export function normaliseRoles(value: unknown): AccountRole[] {
  if (!Array.isArray(value)) return [];
  const picked = new Set(value.filter(isAccountRole));
  return ACCOUNT_ROLES.filter((r) => picked.has(r));
}

/** Slider steps for the Reach radius, from the server policy. */
export function radiusSteps(minKm: number, maxKm: number, stepKm: number): number[] {
  if (!(stepKm > 0) || !(maxKm >= minKm)) return [];
  const steps: number[] = [];
  for (let km = minKm; km <= maxKm; km += stepKm) steps.push(km);
  return steps;
}
