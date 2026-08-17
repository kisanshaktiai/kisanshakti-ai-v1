/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Farming-mode store — land-scoped SSOT
 * ───────────────────────────────────────────────────────────────────────────
 * CHANGE LOG (newest first)
 *   2026-08-17 18:40 UTC — Initial. The land's ACTIVE crop_schedules row is the
 *     single source of truth for farming_type. land_crops stays a mirror so the
 *     rest of the app keeps working. Resolution chain:
 *       crop_schedules(active) → land_crops → (caller falls back to
 *       farmers.farming_preference)
 *     Every read/write is scoped by land_id + tenant_id. No agronomy here.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { type FarmingMode, normalizeFarmingMode } from '../i18n/ui-strings.ts';

export type FarmingModeSource = 'schedule' | 'land_crops' | 'none';

export interface FarmingModeRead {
  mode: FarmingMode;
  source: FarmingModeSource;
  /** Active crop_schedules row id for this land (null when none exists). */
  scheduleId: string | null;
  /** True when the SSOT row exists but disagrees with the mirror. */
  scheduleStale: boolean;
}

async function activeScheduleRow(
  supabase: any,
  landId: string,
  tenantId: string,
): Promise<{ id: string; farming_type: string | null } | null> {
  const { data } = await supabase
    .from('crop_schedules')
    .select('id, farming_type, is_active, updated_at')
    .eq('land_id', landId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1);
  const row = data?.[0];
  return row ? { id: row.id, farming_type: row.farming_type ?? null } : null;
}

/** Resolve the land-scoped farming mode. SSOT first, mirror second. */
export async function readFarmingMode(
  supabase: any,
  landId: string,
  tenantId: string,
): Promise<FarmingModeRead> {
  let scheduleId: string | null = null;
  let scheduleMode: FarmingMode = 'unset';
  try {
    const sched = await activeScheduleRow(supabase, landId, tenantId);
    if (sched) {
      scheduleId = sched.id;
      scheduleMode = normalizeFarmingMode(sched.farming_type);
    }
  } catch (e) {
    console.warn('[FARMING_MODE] crop_schedules read failed:', (e as Error).message);
  }

  let mirrorMode: FarmingMode = 'unset';
  try {
    const { data } = await supabase
      .from('land_crops')
      .select('farming_type, updated_at')
      .eq('land_id', landId)
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(1);
    mirrorMode = normalizeFarmingMode(data?.[0]?.farming_type);
  } catch (e) {
    console.warn('[FARMING_MODE] land_crops read failed:', (e as Error).message);
  }

  if (scheduleMode !== 'unset') {
    return { mode: scheduleMode, source: 'schedule', scheduleId, scheduleStale: false };
  }
  if (mirrorMode !== 'unset') {
    // SSOT empty but the mirror holds a farmer choice → self-heal on read.
    return { mode: mirrorMode, source: 'land_crops', scheduleId, scheduleStale: !!scheduleId };
  }
  return { mode: 'unset', source: 'none', scheduleId, scheduleStale: false };
}

/**
 * Persist the farmer's choice. Writes the ACTIVE crop_schedules row (SSOT) and
 * mirrors to land_crops. Never throws — a failed write must not kill the turn.
 */
export async function writeFarmingMode(
  supabase: any,
  landId: string,
  tenantId: string,
  mode: Exclude<FarmingMode, 'unset'>,
): Promise<{ scheduleWritten: boolean; mirrorWritten: boolean }> {
  let scheduleWritten = false;
  let mirrorWritten = false;

  try {
    const sched = await activeScheduleRow(supabase, landId, tenantId);
    if (sched) {
      const { error } = await supabase
        .from('crop_schedules')
        .update({ farming_type: mode })
        .eq('id', sched.id)
        .eq('tenant_id', tenantId);
      if (error) throw new Error(error.message);
      scheduleWritten = true;
    } else {
      console.log(`[FARMING_MODE] no active crop_schedules row land=${landId} — mirror only`);
    }
  } catch (e) {
    console.warn('[FARMING_MODE] crop_schedules persist failed:', (e as Error).message);
  }

  try {
    const { error } = await supabase
      .from('land_crops')
      .update({ farming_type: mode })
      .eq('land_id', landId)
      .eq('tenant_id', tenantId);
    if (error) throw new Error(error.message);
    mirrorWritten = true;
  } catch (e) {
    console.warn('[FARMING_MODE] land_crops mirror failed:', (e as Error).message);
  }

  return { scheduleWritten, mirrorWritten };
}

/** Backfill the SSOT row when only the legacy mirror carried the choice. */
export async function backfillScheduleMode(
  supabase: any,
  scheduleId: string,
  tenantId: string,
  mode: Exclude<FarmingMode, 'unset'>,
): Promise<void> {
  try {
    await supabase
      .from('crop_schedules')
      .update({ farming_type: mode })
      .eq('id', scheduleId)
      .eq('tenant_id', tenantId);
    console.log(`🌿 [FARMING_MODE_BACKFILLED] schedule=${scheduleId} mode=${mode}`);
  } catch (e) {
    console.warn('[FARMING_MODE] backfill failed:', (e as Error).message);
  }
}
