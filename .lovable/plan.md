# AI Crop-Schedule — Variety Intelligence Wiring

## Problem

The "वाण (पर्यायी)" field on `/app/schedule` (mobile flow in `CropDateInput.tsx` and desktop flow in `ScheduleGenerator.tsx`) is a **plain text input** with a hard-coded default ("IR-64", "HD-2967", "BT Cotton"). It does **not**:

- Load the varieties registered for the selected crop from `master_products` (`product_type='seed'`).
- Show maturity days, suitable regions, water/irrigation regime, or pest/disease resistance from `variety_resistance`.
- Let the farmer flag a missing variety so the tenant can curate it.

A correct `VarietySelector` component already exists (`src/components/crops/VarietySelector.tsx`) and the canonical loader lives at `supabase/functions/_shared/variety-context.ts`. They're just not used in the schedule entry screen.

## Goals

1. Auto-load varieties for the chosen crop and let the farmer pick one.
2. On selection, render a rich detail panel: maturity (min–max days), recommended states/agro-ecology, irrigation regime, seed rate, spacing, **disease + pest resistance** rows.
3. If the variety isn't in the DB → "Add my variety" inline form → write to a new `variety_submissions` table for tenant review (the existing `variety_review_queue` requires an existing `variety_id`, so it's not the right home for brand-new varieties).
4. Persist the selected `variety_id` end-to-end so downstream `ai-smart-schedule` planning uses the variety profile we already built (Phase 1–5 work).

## Scope of changes

### Database (1 migration)

Create `public.variety_submissions`:

| column | purpose |
| --- | --- |
| `tenant_id` (uuid, FK tenants) | multi-tenant isolation |
| `submitted_by` (uuid → auth.users) | farmer who proposed it |
| `crop_id` (uuid, FK crops) | which crop family |
| `proposed_name` (text, NOT NULL) | e.g. "Co-99004" |
| `local_name` (text) | farmer's vernacular name |
| `maturity_days_min` / `maturity_days_max` (int) | farmer's stated window |
| `season` (text) | kharif / rabi / summer |
| `notes` (text) | farmer free-text |
| `status` (text, default `pending`) | pending / approved / rejected / merged |
| `approved_variety_id` (uuid → master_products, nullable) | filled when curator merges |
| `reviewed_by` / `reviewed_at` | curator audit |
| `created_at` / `updated_at` | standard |

- GRANTs: `SELECT, INSERT` to `authenticated`; `ALL` to `service_role`.
- RLS: farmer can `INSERT` rows for their own `tenant_id` + `submitted_by = auth.uid()`; farmer can `SELECT` only their own submissions; tenant admins (`has_role(auth.uid(),'admin')`) can `SELECT`/`UPDATE` all rows in their tenant.
- Index: `(tenant_id, status)` partial on `status='pending'` for the review queue.

### Shared helper (new)

`src/hooks/useCropVarieties.ts` — single fetch + module cache for `master_products` rows of a crop, plus resistance rows from `variety_resistance` keyed by variety_id. Used by `VarietySelector` and the new detail card to avoid duplicate roundtrips.

### `VarietySelector.tsx` (enhance — visual-only additions)

- Replace the slim "selected card" footer with a **VarietyDetailCard** (new sub-component in the same file or `VarietyDetailCard.tsx`):
  - Maturity window (badge)
  - Yield potential
  - Irrigation regime + seed rate + spacing (from `agro_ecological_suitability` / direct columns)
  - Suitable states (chips, truncated to 6 with "+N more")
  - **Resistance** rows from `variety_resistance` grouped by R/HR (green), MR (amber), S/MS (red) with pathogen name
  - Data confidence score badge
- Add **"My variety isn't listed"** secondary button at the bottom of the picker that opens a compact inline dialog (`VarietySubmitDialog.tsx` new) with: name, local name, season, min/max days, notes → inserts into `variety_submissions`, toasts confirmation, and uses the submitted name as `cropVariety` text for this session (no `variety_id` until tenant approves).

### `CropDateInput.tsx` (wire selector in)

- Replace lines 238–250 (text Input) with `<VarietySelector cropId={cropId} value={varietyId} onChange={...} compact />`.
- Add local state `varietyId` and update `handleCropSelect` to clear it whenever the crop changes (drop the hardcoded "IR-64/HD-2967/BT Cotton" defaults).
- Extend `onSubmit` signature with an optional `varietyId?: string | null` so the parent (`Schedule.tsx`) can pass it to `landsApi.updateLand({ current_crop_variety_id })` and to `ai-smart-schedule` (which already reads `current_crop_variety_id`, Phase 5).
- Keep the text fallback for the manual-submission case (selector returns `null` but `cropVariety` string holds the typed name).

### `ScheduleGenerator.tsx` (desktop parity)

- Same swap at lines 359–368: replace text input with `VarietySelector` once `cropName` resolves to a `cropId` (lookup via existing crops list in the component).

### `Schedule.tsx` parent flow

- Accept `varietyId` from `CropDateInput.onSubmit`, persist via `landsApi.setCurrentCrop(landId, { ..., current_crop_variety_id: varietyId })` so the existing variety-aware planner picks it up. No edge-function changes needed — Phase 5 already consumes `current_crop_variety_id`.

### i18n keys

Add to `en`, `hi`, `mr` schedule namespaces:
- `variety.detail_title`, `variety.maturity`, `variety.yield`, `variety.irrigation`, `variety.suitable_states`, `variety.resistance`, `variety.add_missing`, `variety.submit_form.*` (name / local / season / min_days / max_days / notes / submit / submitted_toast).

## Out of scope (kept for follow-ups)

- Tenant-side review UI for `variety_submissions` — backlog item; can reuse the existing admin tools pattern.
- Auto-promoting an approved submission into `master_products` — manual curator action; not built in this pass.
- Item 12 intercrop text→uuid migration — still deferred per existing `.lovable/plan.md`.

## Files touched

- **new** `supabase/migrations/<ts>_variety_submissions.sql`
- **new** `src/hooks/useCropVarieties.ts`
- **new** `src/components/crops/VarietyDetailCard.tsx`
- **new** `src/components/crops/VarietySubmitDialog.tsx`
- **edit** `src/components/crops/VarietySelector.tsx` (slot in detail card + "add missing" CTA)
- **edit** `src/components/schedule/CropDateInput.tsx`
- **edit** `src/components/schedule/ScheduleGenerator.tsx`
- **edit** `src/pages/Schedule.tsx` (pass `varietyId` through to lands API)
- **edit** `src/i18n/locales/{en,hi,mr}/schedule.json`

## Verification

1. Pick a crop with seeded varieties (e.g. Sugarcane) → varieties list loads from `master_products`.
2. Select Co-86032 → detail card shows maturity 11–12 mo, irrigation regime, red-rot resistance row.
3. Submit a fake "Co-XYZ" via "My variety isn't listed" → row appears in `variety_submissions` with `status='pending'`.
4. Generate schedule → `ai_schedule_refinements.variety_id` is stamped (already covered by Phase 5 wiring).
