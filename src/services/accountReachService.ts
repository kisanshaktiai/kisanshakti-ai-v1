/**
 * accountReachService — Reach (base village + radius) for the Provider and
 * Customer workspaces. Reads and writes go only through the two database
 * functions get_account_reach() and set_account_reach(); the session token
 * header set by the shared client identifies the caller.
 */
import { supabase } from '@/integrations/supabase/client';
import { useAccountStore, type ReachState } from '@/stores/accountStore';
import type { AccountRole } from '@/lib/accountRoles';

/** Codes raised by the database functions (see the reach migration). */
const REACH_CODES = [
  'NOT_AUTHENTICATED',
  'REACH_ROLE_INVALID',
  'REACH_ROLE_NOT_ACTIVE',
  'REACH_POLICY_MISSING',
  'REACH_RADIUS_OUT_OF_BOUNDS',
  'REACH_RADIUS_OFF_STEP',
  'REACH_VILLAGE_INVALID',
  'REACH_CHANGE_LIMIT_REACHED',
] as const;
export type ReachErrorCode = (typeof REACH_CODES)[number] | 'REACH_UNAVAILABLE';

export class ReachError extends Error {
  code: ReachErrorCode;
  /** For REACH_CHANGE_LIMIT_REACHED: when the next change opens (UTC). */
  nextChangeAt: string | null;
  constructor(code: ReachErrorCode, nextChangeAt: string | null = null) {
    super(code);
    this.code = code;
    this.nextChangeAt = nextChangeAt;
  }
}

function toReachError(error: any): ReachError {
  const text = `${error?.message ?? ''}`;
  const code = REACH_CODES.find((c) => text.includes(c));
  if (!code) return new ReachError('REACH_UNAVAILABLE');
  const detail = typeof error?.details === 'string' && error.details.trim() ? error.details.trim() : null;
  return new ReachError(code, code === 'REACH_CHANGE_LIMIT_REACHED' ? detail : null);
}

// The two functions are newer than the generated types file.
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase as any).rpc(name, args) as Promise<{ data: any; error: any }>;

export const accountReachService = {
  /** Current Reach, the policy and the changes left. Cached for offline display. */
  async get(role: AccountRole): Promise<ReachState> {
    const { data, error } = await rpc('get_account_reach', { p_role: role });
    if (error || !data) throw toReachError(error);
    const cached = useAccountStore.getState().reach[role];
    const reach: ReachState = {
      ...(data as ReachState),
      village_name:
        cached && cached.base_village_id === data.base_village_id ? cached.village_name ?? null : null,
    };
    useAccountStore.getState().setReach(role, reach);
    return reach;
  },

  async set(role: AccountRole, villageId: string, radiusKm: number, villageName?: string | null): Promise<ReachState> {
    const { data, error } = await rpc('set_account_reach', {
      p_role: role, p_village_id: villageId, p_radius_km: radiusKm,
    });
    if (error || !data) throw toReachError(error);
    const reach: ReachState = { ...(data as ReachState), village_name: villageName ?? null };
    useAccountStore.getState().setReach(role, reach);
    return reach;
  },

  /** Name of a village from the public villages master (for display only). */
  async villageName(villageId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('villages')
      .select('id, name')
      .eq('id', villageId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as any).name ?? null;
  },
};
