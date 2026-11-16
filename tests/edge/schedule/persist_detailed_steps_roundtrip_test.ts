// Database round trip for public.persist_ai_crop_schedule_atomic in an in-process Postgres (PGlite).
// BEFORE: the live routine (read from production 2026-11-13, md5 b87c3ed7…) dropped detailed_steps and
// let yield_multiplier_target fall to its 3.0 column default. AFTER: migration 20261113150000 keeps both.
// The "before" routine is the migration with its four intended edits reverted, so both runs share one text.
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { PGlite } from "npm:@electric-sql/pglite@0.3.15";

const MIGRATION = "supabase/migrations/20261113150000_persist_schedule_detailed_steps_and_no_default_yield_claim.sql";

const SCHEMA = `
create table public.lands (id uuid primary key, current_crop text, current_crop_variety_id uuid, planting_date date,
  transplant_date date, gdd_anchor_type text, gdd_anchor_date date, current_gdd numeric, gdd_last_computed_at timestamptz,
  expected_harvest_date date, active_schedule_id uuid, crop_cycle text, updated_at timestamptz);
create table public.crop_schedules (id uuid primary key default gen_random_uuid(), land_id uuid, farmer_id uuid, tenant_id uuid,
  crop_name text, crop_variety text, variety_id uuid, cultivation_method text, crop_cycle text, sowing_date date,
  transplant_date date, expected_harvest_date date, is_active boolean, status text, generation_language text, ai_model text,
  input_soil_data jsonb, input_weather_data jsonb, input_land_coordinates jsonb, agro_climatic_zone text,
  calculated_for_area_acres numeric, total_duration_days integer, seed_quantity_kg numeric, fertilizer_n_kg numeric,
  fertilizer_p_kg numeric, fertilizer_k_kg numeric, total_estimated_cost numeric, state_region text, district_name text,
  farming_type text, tasks_total_count integer, tasks_completed_count integer, backdated_consent boolean,
  backdated_consent_at timestamptz, generation_params jsonb, metadata jsonb, yield_multiplier_target numeric default 3.0);
create table public.schedule_tasks (id uuid primary key default gen_random_uuid(), schedule_id uuid, farmer_id uuid, tenant_id uuid,
  task_name text, task_description text, task_type text, task_date date, projected_date date, days_from_sowing integer,
  anchor_type text, anchor_stage text, gdd_target numeric, stage_key text, stage_uuid uuid, stage_name text, stage_order integer,
  priority text, weather_dependent boolean, status text, original_date date, reschedule_reason text, auto_rescheduled boolean,
  sequence_order integer, instructions text[], precautions text[], resources jsonb, estimated_cost numeric, currency varchar,
  rule_ids text[], trigger_rule_id text, confidence numeric, source_refs jsonb, language varchar, is_pinned boolean,
  detailed_steps jsonb default '[]'::jsonb);`;

function liveRoutine(sql: string): string {
  return sql
    .replace("    generation_params, metadata, yield_multiplier_target\n", "    generation_params, metadata\n")
    .replace(/    coalesce\(p_schedule->'metadata', '\{\}'::jsonb\),\n    -- Explicit null[^\n]*\n    nullif\(p_schedule->>'yield_multiplier_target', ''\)::numeric\n/, "    coalesce(p_schedule->'metadata', '{}'::jsonb)\n")
    .replace("    source_refs, language, is_pinned, detailed_steps\n", "    source_refs, language, is_pinned\n")
    .replace("    x.source_refs, x.language, x.is_pinned,\n    case when jsonb_typeof(x.detailed_steps) = 'array' then x.detailed_steps else '[]'::jsonb end\n", "    x.source_refs, x.language, x.is_pinned\n")
    .replace("    is_pinned boolean,\n    detailed_steps jsonb\n", "    is_pinned boolean\n");
}

const LAND = "11111111-1111-1111-1111-111111111111";
const schedule = { land_id: LAND, crop_name: "Rice", cultivation_method: "direct_seeded", sowing_date: "2026-06-10", tasks_total_count: 2, status: "active", yield_multiplier_target: null };
const tasks = [
  { task_name: "Sowing", task_type: "sowing", task_date: "2026-06-10", days_from_sowing: 0, status: "pending", sequence_order: 1, instructions: ["Sow in lines."], detailed_steps: ["Sow in lines.", "Keep the seed 3 cm deep."] },
  { task_name: "Scout", task_type: "monitoring", task_date: "2026-06-20", days_from_sowing: 10, status: "pending", sequence_order: 2, instructions: [], detailed_steps: null },
];

async function run(routine: string) {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(`insert into public.lands (id) values ('${LAND}');`);
  await db.exec(routine);
  const res = await db.query<{ schedule_id: string; task_count: number }>("select * from public.persist_ai_crop_schedule_atomic($1::jsonb, $2::jsonb, $3::jsonb)", [JSON.stringify(schedule), JSON.stringify(tasks), JSON.stringify({ current_crop: "Rice" })]);
  const id = res.rows[0].schedule_id;
  const s = await db.query<{ y: string | null }>("select yield_multiplier_target::text y from public.crop_schedules where id = $1", [id]);
  const t = await db.query<{ task_name: string; detailed_steps: unknown }>("select task_name, detailed_steps from public.schedule_tasks where schedule_id = $1 order by sequence_order", [id]);
  const land = await db.query<{ active_schedule_id: string }>("select active_schedule_id from public.lands where id = $1", [LAND]);
  await db.close();
  return { count: res.rows[0].task_count, yieldTarget: s.rows[0].y, steps: t.rows.map((r) => r.detailed_steps), landSchedule: land.rows[0].active_schedule_id, id };
}

Deno.test("BEFORE (live routine): detailed_steps are dropped and the 3.0 yield default is stored", async () => {
  const before = await run(liveRoutine(await Deno.readTextFile(MIGRATION)));
  assertEquals(before.count, 2);
  assertEquals(before.steps, [[], []]);
  assertEquals(before.yieldTarget, "3.0");
});

Deno.test("AFTER (migration 20261113150000): detailed_steps persist, no default yield claim, land link intact", async () => {
  const after = await run(await Deno.readTextFile(MIGRATION));
  assertEquals(after.count, 2);
  assertEquals(after.steps, [["Sow in lines.", "Keep the seed 3 cm deep."], []]);
  assertEquals(after.yieldTarget, null);
  assert(after.landSchedule === after.id);
});
