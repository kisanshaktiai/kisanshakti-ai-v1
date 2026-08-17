# Farming mode: make the active crop schedule the single source of truth

## What is wrong today

Verified in the database for land `30197c15…`:

- `land_crops.farming_type = organic_only` (written today, 18:27 UTC — the tap does persist)
- `crop_schedules.farming_type = fertilizer_pesticide` (stale, 2026-07-12)

So the farmer's choice is stored in one table while the schedule/advisory side still reads an old value from another. The chat room hydrates from `land_crops`, the schedule subsystem carries its own copy, and the two drift apart. That is why the mode looks "not remembered" and why advice can come back chemical after the farmer picked organic.

## Target behaviour

- The farming mode is **land-specific** and lives on the land's **active crop schedule** (`crop_schedules`, `is_active = true`, newest first). That row is the SSOT.
- On every chat-room load the already-selected mode is read from that row and shown immediately — no waiting for a message.
- When the farmer changes the mode, the active schedule row is updated and `land_crops.farming_type` is updated in the same operation as a mirror, so nothing else in the app regresses.
- Every read and write is filtered by both `land_id` and `tenant_id` (and the land is confirmed to belong to the calling farmer), so no cross-tenant leakage.

## Changes

**1. Edge function — `supabase/functions/ai-agriculture-chat/index.ts`**

- Resolution chain becomes: active `crop_schedules.farming_type` → `land_crops.farming_type` (legacy mirror) → `farmers.farming_preference` → `unset`.
- Tap handler writes to the active `crop_schedules` row for that land + tenant, then mirrors to `land_crops`. If a value came from the mirror leg but the schedule row is empty or stale, backfill the schedule row so the SSOT self-heals on first read.
- Keep the existing confirmation reply and `[FARMING_MODE_SET]` log; add the source leg to the log (`via=schedule|land_crops|preference`) for traceability.
- If the land has no active schedule yet, write `land_crops` only and log that the schedule row is missing — never fail the turn.

**2. Frontend — `src/hooks/useFarmingModeHydration.ts`**

- Same chain, same order: active `crop_schedules` → `land_crops` → `farmers.farming_preference`.
- Keep the per-land `localStorage` mirror for instant first paint, then reconcile with the authoritative read.
- Queries stay scoped by `land_id` + `tenant_id` through the authenticated client.

**3. No data migration of agronomy**

No dose, rule, or schedule-task data is touched. Only the `farming_type` column value on the active schedule row is written, and only in response to an explicit farmer tap.

## Verification

- Open the chat room on land `30197c15…`: the chip shows organic (current land_crops value) and the active schedule row gets backfilled to the same value.
- Change the mode in the sheet: both `crop_schedules` (active row) and `land_crops` show the new value; reopening the chat room shows it without sending a message.
- A land belonging to a different tenant is unaffected by either write.
