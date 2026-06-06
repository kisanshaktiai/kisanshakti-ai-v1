// ============================================================
// Harvest Engine — service-role background sweep
// Hosted inside schedules-api (no separate edge-function slot).
// Driven by pg_cron → pg_net every 30 minutes.
//
// Idempotent. Multi-tenant. Tolerant of partial failures.
// All state transitions go through DB triggers installed by the
// Step-1 migration (20260606150014_*.sql).
// ============================================================

export interface EngineSummary {
  ok: boolean;
  matured: number;
  reminders_sent: number;
  auto_confirmed: number;
  errors: string[];
  duration_ms: number;
}

// Tunables
const MATURITY_BATCH = 200;
const REMINDER_BATCH = 500;
const AUTO_CONFIRM_BATCH = 500;
const REMINDER_INTERVAL_HOURS = 48; // 2 days
const MAX_REMINDERS = 5;
const DEFAULT_DUE_AFTER_DAYS = 30; // request expires after 30d; auto-confirm fires earlier

// ──────────────────────────────────────────────────────────────
// Crop-aware auto-confirmation grace (days after expected_harvest_date)
// If the farmer never confirms manually, the engine auto-closes the
// season after this many days. Sugarcane gets a longer window because
// the actual cut date often drifts 2–4 weeks past the planned date.
// ──────────────────────────────────────────────────────────────
const DEFAULT_AUTO_CONFIRM_GRACE_DAYS = 15;
const AUTO_CONFIRM_GRACE_DAYS_BY_CROP: Record<string, number> = {
  sugarcane: 30,
};

// Normalize free-text crop_name to a lookup key for the grace map.
// Covers English + common Hindi/Marathi spellings of sugarcane.
function normalizeCropForGrace(cropName: string | null | undefined): string {
  if (!cropName) return 'default';
  const s = String(cropName).trim().toLowerCase();
  if (!s) return 'default';
  if (
    s.includes('sugarcane') ||
    s.includes('sugar cane') ||
    s.includes('ऊस') ||      // Marathi
    s.includes('गन्ना') ||    // Hindi
    s.includes('ईख') ||       // Hindi alt
    s.includes('கரும்பு')      // Tamil
  ) {
    return 'sugarcane';
  }
  return s;
}

function graceDaysFor(cropName: string | null | undefined): number {
  const key = normalizeCropForGrace(cropName);
  return AUTO_CONFIRM_GRACE_DAYS_BY_CROP[key] ?? DEFAULT_AUTO_CONFIRM_GRACE_DAYS;
}

export async function runHarvestEngine(supabase: any): Promise<EngineSummary> {
  const t0 = Date.now();
  const summary: EngineSummary = {
    ok: true,
    matured: 0,
    reminders_sent: 0,
    auto_confirmed: 0,
    errors: [],
    duration_ms: 0,
  };

  try {
    summary.matured = await detectMaturity(supabase, summary.errors);
  } catch (e: any) {
    summary.errors.push(`maturity:${e?.message || e}`);
  }

  try {
    summary.reminders_sent = await sendReminders(supabase, summary.errors);
  } catch (e: any) {
    summary.errors.push(`reminders:${e?.message || e}`);
  }

  try {
    summary.auto_confirmed = await autoConfirmPending(supabase, summary.errors);
  } catch (e: any) {
    summary.errors.push(`auto_confirm:${e?.message || e}`);
  }

  summary.ok = summary.errors.length === 0;
  summary.duration_ms = Date.now() - t0;
  console.log('🌾 [HarvestEngine] run complete', summary);
  return summary;
}

// ─────────────────────────────────────────────────────────────
// Step 1 — Maturity detection
// ─────────────────────────────────────────────────────────────
async function detectMaturity(supabase: any, errors: string[]): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: candidates, error } = await supabase
    .from('crop_schedules')
    .select('id, tenant_id, farmer_id, land_id, crop_name, expected_harvest_date, lifecycle_status')
    .eq('is_active', true)
    .eq('harvest_status', 'NOT_STARTED')
    .in('lifecycle_status', ['PLANNED', 'SOWN', 'GROWING'])
    .not('expected_harvest_date', 'is', null)
    .lte('expected_harvest_date', today)
    .limit(MATURITY_BATCH);

  if (error) {
    errors.push(`maturity_select:${error.message}`);
    return 0;
  }
  if (!candidates?.length) return 0;

  let count = 0;
  for (const row of candidates) {
    try {
      // Transition schedule lifecycle (trigger fn_block_double_active stays satisfied — is_active unchanged)
      const { error: updErr } = await supabase
        .from('crop_schedules')
        .update({ lifecycle_status: 'MATURITY_REACHED' })
        .eq('id', row.id)
        .eq('lifecycle_status', row.lifecycle_status); // optimistic guard
      if (updErr) {
        errors.push(`sched_upd:${row.id}:${updErr.message}`);
        continue;
      }

      // Transition land lifecycle (do not clobber if farmer already confirmed)
      await supabase
        .from('lands')
        .update({
          lifecycle_status: 'WAITING_HARVEST_CONFIRMATION',
          lifecycle_changed_at: new Date().toISOString(),
        })
        .eq('id', row.land_id)
        .in('lifecycle_status', ['CROP_ACTIVE', 'PREPARING']);

      // Open confirmation request (unique partial idx dedupes silently)
      const dueAt = new Date(Date.now() + DEFAULT_DUE_AFTER_DAYS * 86400_000).toISOString();
      const { error: hcrErr } = await supabase
        .from('harvest_confirmation_requests')
        .insert({
          tenant_id: row.tenant_id,
          farmer_id: row.farmer_id,
          land_id: row.land_id,
          schedule_id: row.id,
          due_at: dueAt,
          status: 'PENDING',
          channel: { source: 'harvest-engine', kind: 'maturity-detected' },
        });
      // ignore unique-violation (23505) — means request already open
      if (hcrErr && !String(hcrErr.message || '').includes('uniq_hcr_open_per_schedule') && hcrErr.code !== '23505') {
        errors.push(`hcr_ins:${row.id}:${hcrErr.message}`);
      }

      // Audit
      await supabase.from('crop_lifecycle_events').insert({
        tenant_id: row.tenant_id,
        farmer_id: row.farmer_id,
        land_id: row.land_id,
        schedule_id: row.id,
        event_type: 'MATURITY_REACHED',
        from_status: row.lifecycle_status,
        to_status: 'MATURITY_REACHED',
        payload: { expected_harvest_date: row.expected_harvest_date },
      });

      // Farmer-facing alert
      await emitAlert(supabase, {
        tenant_id: row.tenant_id,
        farmer_id: row.farmer_id,
        land_id: row.land_id,
        schedule_id: row.id,
        alert_type: 'HARVEST_READY',
        priority: 'high',
        title: 'Crop ready for harvest',
        message: `${row.crop_name || 'Your crop'} has reached expected maturity. Please confirm harvest in the app.`,
        action_required: 'CONFIRM_HARVEST',
      });

      count++;
    } catch (e: any) {
      errors.push(`maturity_row:${row.id}:${e?.message || e}`);
    }
  }
  return count;
}

// ─────────────────────────────────────────────────────────────
// Step 2 — Reminders
// ─────────────────────────────────────────────────────────────
async function sendReminders(supabase: any, errors: string[]): Promise<number> {
  const cutoff = new Date(Date.now() - REMINDER_INTERVAL_HOURS * 3600_000).toISOString();

  const { data: rows, error } = await supabase
    .from('harvest_confirmation_requests')
    .select('id, tenant_id, farmer_id, land_id, schedule_id, reminder_count, last_reminded_at, triggered_at')
    .eq('status', 'PENDING')
    .lt('reminder_count', MAX_REMINDERS)
    .or(`last_reminded_at.is.null,last_reminded_at.lt.${cutoff}`)
    .limit(REMINDER_BATCH);

  if (error) {
    errors.push(`reminders_select:${error.message}`);
    return 0;
  }
  if (!rows?.length) return 0;

  let count = 0;
  for (const r of rows) {
    // Skip those whose last reminder is too recent and a value exists
    if (r.last_reminded_at && new Date(r.last_reminded_at).toISOString() >= cutoff) continue;

    const { error: updErr } = await supabase
      .from('harvest_confirmation_requests')
      .update({
        reminder_count: (r.reminder_count || 0) + 1,
        last_reminded_at: new Date().toISOString(),
      })
      .eq('id', r.id)
      .eq('status', 'PENDING');
    if (updErr) {
      errors.push(`reminder_upd:${r.id}:${updErr.message}`);
      continue;
    }

    await emitAlert(supabase, {
      tenant_id: r.tenant_id,
      farmer_id: r.farmer_id,
      land_id: r.land_id,
      schedule_id: r.schedule_id,
      alert_type: 'HARVEST_REMINDER',
      priority: 'medium',
      title: 'Harvest confirmation pending',
      message: `Please confirm harvest status for your crop. Reminder ${(r.reminder_count || 0) + 1}/${MAX_REMINDERS}.`,
      action_required: 'CONFIRM_HARVEST',
    });
    count++;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────
// Step 3 — Auto-confirmation (crop-aware grace window)
// If a farmer never manually confirms harvest, treat silence as
// implicit confirmation after `graceDaysFor(crop)` days past
// expected_harvest_date. Default 15 days; sugarcane 30 days.
//
// Setting crop_schedules.harvest_status='FULLY_HARVESTED' fires
// fn_cascade_harvest_completion, which:
//   • marks schedule HARVESTED + is_active=false
//   • releases the land (lifecycle_status='AVAILABLE')
//   • closes the open harvest_confirmation_requests row
//   • writes a HARVEST_COMPLETED audit event
// So we only need to write the schedule row + a farmer alert.
// ─────────────────────────────────────────────────────────────
async function autoConfirmPending(supabase: any, errors: string[]): Promise<number> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Pull open requests with the schedule fields we need.
  const { data: rows, error } = await supabase
    .from('harvest_confirmation_requests')
    .select(`
      id, tenant_id, farmer_id, land_id, schedule_id,
      crop_schedules:schedule_id (
        id, crop_name, expected_harvest_date, harvest_status, is_active
      )
    `)
    .eq('status', 'PENDING')
    .limit(AUTO_CONFIRM_BATCH);

  if (error) {
    errors.push(`auto_confirm_select:${error.message}`);
    return 0;
  }
  if (!rows?.length) return 0;

  let count = 0;
  for (const r of rows) {
    const sched = (r as any).crop_schedules;
    if (!sched || !sched.expected_harvest_date) continue;
    if (sched.harvest_status !== 'NOT_STARTED') continue;

    const grace = graceDaysFor(sched.crop_name);
    const ehd = new Date(`${sched.expected_harvest_date}T00:00:00Z`);
    const cutoff = new Date(ehd.getTime() + grace * 86400_000);
    if (cutoff > today) continue; // not yet eligible

    // actual_harvest_date = min(today, expected + grace)
    const auto = cutoff <= today ? cutoff : today;
    const autoStr = auto.toISOString().slice(0, 10);
    const clampedStr = autoStr > todayStr ? todayStr : autoStr;

    try {
      // Optimistic guard: only flip if still NOT_STARTED.
      const { error: updErr } = await supabase
        .from('crop_schedules')
        .update({
          harvest_status: 'FULLY_HARVESTED',
          actual_harvest_date: clampedStr,
          harvest_response: {
            source: 'auto-confirm',
            reason: 'no_farmer_response',
            grace_days: grace,
            crop: normalizeCropForGrace(sched.crop_name),
            confirmed_at: new Date().toISOString(),
          },
        })
        .eq('id', sched.id)
        .eq('harvest_status', 'NOT_STARTED');

      if (updErr) {
        errors.push(`auto_confirm_upd:${sched.id}:${updErr.message}`);
        continue;
      }

      // Trigger fn_cascade_harvest_completion has already:
      //   - cascaded land lifecycle to AVAILABLE
      //   - closed the harvest_confirmation_requests row
      //   - written a HARVEST_COMPLETED audit event

      await emitAlert(supabase, {
        tenant_id: r.tenant_id,
        farmer_id: r.farmer_id,
        land_id: r.land_id,
        schedule_id: sched.id,
        alert_type: 'HARVEST_AUTO_CONFIRMED',
        priority: 'low',
        title: 'Harvest auto-confirmed',
        message: `We auto-closed the season for ${sched.crop_name || 'your crop'} after ${grace} days past the expected harvest date. You can still update yield or notes from the schedule screen.`,
        action_required: null,
      });

      count++;
    } catch (e: any) {
      errors.push(`auto_confirm_row:${r.id}:${e?.message || e}`);
    }
  }
  return count;
}

// ─────────────────────────────────────────────────────────────
// Notification helper — uses farmer_alerts (same surface as proactive-evaluator)
// ─────────────────────────────────────────────────────────────
async function emitAlert(supabase: any, payload: any) {
  try {
    await supabase.from('farmer_alerts').insert({
      tenant_id: payload.tenant_id,
      farmer_id: payload.farmer_id,
      land_id: payload.land_id,
      schedule_id: payload.schedule_id,
      alert_type: payload.alert_type,
      priority: payload.priority,
      title: payload.title,
      message: payload.message,
      action_required: payload.action_required,
      data_source: { source: 'harvest-engine' },
      expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    });
  } catch (e: any) {
    console.warn('⚠️ [HarvestEngine] alert insert failed (non-fatal):', e?.message || e);
  }
}
