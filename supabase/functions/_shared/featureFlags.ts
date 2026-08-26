/**
 * featureFlags.ts — deterministic reader for public.feature_flags.
 *
 * Verified live columns (2026-08-24): flag_name (UNIQUE), is_enabled bool,
 * rollout_percentage int4, target_tenants uuid[], target_users uuid[],
 * flag_status text, expires_at timestamptz.
 *
 * Semantics: enabled ⇔ is_enabled AND status active AND not expired AND
 *   ( farmer ∈ target_users OR tenant ∈ target_tenants OR bucket(farmer) < rollout_percentage ).
 * With rollout_percentage = 0 and empty targets the flag is OFF for everyone —
 * this is the current state of 'rag_general_chat' in the live DB.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

export interface FlagDecision {
  enabled: boolean;
  reason: 'target_user' | 'target_tenant' | 'rollout' | 'disabled' | 'expired' | 'missing' | 'inactive' | 'error';
  rolloutPercentage: number;
}

function bucket(id: string): number {
  // FNV-1a 32-bit → stable 0..99 bucket per farmer id
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

export async function isFlagEnabled(
  supabase: SupabaseClient,
  flagName: string,
  ctx: { tenantId?: string | null; farmerId?: string | null },
): Promise<FlagDecision> {
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('is_enabled, rollout_percentage, target_tenants, target_users, flag_status, expires_at')
      .eq('flag_name', flagName)
      .maybeSingle();
    if (error) return { enabled: false, reason: 'error', rolloutPercentage: 0 };
    if (!data) return { enabled: false, reason: 'missing', rolloutPercentage: 0 };

    const pct = Number(data.rollout_percentage ?? 0);
    if (!data.is_enabled) return { enabled: false, reason: 'disabled', rolloutPercentage: pct };
    if (data.flag_status && data.flag_status !== 'active') return { enabled: false, reason: 'inactive', rolloutPercentage: pct };
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return { enabled: false, reason: 'expired', rolloutPercentage: pct };

    const users: string[] = Array.isArray(data.target_users) ? data.target_users : [];
    const tenants: string[] = Array.isArray(data.target_tenants) ? data.target_tenants : [];
    if (ctx.farmerId && users.includes(ctx.farmerId)) return { enabled: true, reason: 'target_user', rolloutPercentage: pct };
    if (ctx.tenantId && tenants.includes(ctx.tenantId)) return { enabled: true, reason: 'target_tenant', rolloutPercentage: pct };
    if (pct >= 100) return { enabled: true, reason: 'rollout', rolloutPercentage: pct };
    if (pct > 0 && ctx.farmerId && bucket(ctx.farmerId) < pct) return { enabled: true, reason: 'rollout', rolloutPercentage: pct };
    return { enabled: false, reason: 'disabled', rolloutPercentage: pct };
  } catch {
    return { enabled: false, reason: 'error', rolloutPercentage: 0 };
  }
}
