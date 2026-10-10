# KisanShakti crop-photo evidence — data model v2 (farmer-app)

Migration: `supabase/migrations/20260923140000_crop_photo_evidence_v2.sql` — **not applied**.
It replaces two unapplied files, which must not be applied:
- `20260923_photo_evidence_store.sql` (v1 from this chat)
- `20260923121000_crop_photo_evidence.sql` (the parallel package)

## The principle it implements

**Capture once → preserve forever → annotate progressively → verify independently → export into any future training format.**

This is Phase 1 of the dataset plan: photo + identity + agricultural context + object + observation + provenance + consent.

Dataset versions and exports (Phase 4) are deliberately not built yet. They are generated later from the contract function, so no future model design is locked in today.

## Three layers

| Layer | Where | Rule |
|---|---|---|
| 1 · Raw evidence | `crop_growth_uploads` (existing table, extended) | One row per photo. The file path, hash, capture time and land can never change. The database fills in the full context snapshot at insert. |
| 2 · Annotation | `crop_photo_annotation` (new) | Every label ever given, whether by the model, farmer, expert, lab or outcome. Append-only: a correction is a new row that points to the one it supersedes. |
| 2 · Time chain | `crop_photo_link` (new) | Links a photo to its follow-up, the same plant, the same spot, or a later photo taken after a treatment task (E001 → E002 → E003). |
| 2 · Engine run | `crop_photo_diagnosis` + `crop_photo_diagnosis_photo` (new) | One row per AI run: model, tokens, cost, and the Decision Brain trace. |
| 3 · Training sample | not stored | Generated when needed from `photo_evidence_record(upload_id)`. |

## What the database fills in by itself at every insert

The application cannot send these values, and they cannot be forged. The trigger `crop_photo_fill_context` sets:

- **Owner:** tenant and farmer, taken from the land row.
- **Crop cycle:** the land's active crop schedule.
- **Capture-local date:** computed with `farmers.timezone`. If that is missing it falls back to UTC, and the fallback is recorded.
- **Stage estimate:** stage code, days after sowing, days after transplanting, GDD and cultivation method, from `resolve_crop_phenology_for_land`.
- **Canonical crop:** from the land's crop id, else the resolver's crop code, else the land's crop text matched against all 17 crop name columns. An ambiguous or missing match stays empty.
- **Variety:** from the crop schedule.
- **Weather snapshot** for that day, copied in full.
- **NDVI snapshot:** the nearest earlier scene.
- **References** to the soil test and the farm-state row.
- **Consent state** at the moment of capture.

## Rules the database enforces

These are in SQL, not left to application code. Each was tested on PostgreSQL 16 on 2026-09-23.

- **Forged owner ignored:** a photo sent with another tenant's or farmer's id gets its real owner from the land.
- **Folder check:** a storage path outside the photo's own tenant/farmer/land folder is rejected.
- **Unknown crop fails closed:** a land whose crop is "pulses" gets no crop and is marked `unresolved`.
- **Raw fields locked:** changing a photo's storage path is rejected. Updating a non-raw field still works.
- **No deletes:** deleting a photo is rejected, and deleting a land that has photos is blocked.
- **No invented codes:** an observation code that is not in `observation_master` is rejected.
- **Severity only from verified sources:** a severity label from the model is rejected. Severity may come only from expert, lab or outcome.
- **Annotations cannot be edited;** a correction is added as a new row.
- **Same-land links only:** a link between photos of two different lands is rejected.
- **Disagreements are kept:** when the model said present, the farmer said absent and an expert said present, the contract record shows the expert label as training truth and keeps all four assertions in history.

## Storage layout (private bucket `crop-growth-media`)

```
{tenant_id}/{farmer_id}/{land_id}/{yyyy}/{mm}/{upload_id}/raw.jpg
{tenant_id}/{farmer_id}/{land_id}/{yyyy}/{mm}/{upload_id}/derived/{annotation_id}.png   ← later: crops, masks
```

No diagnosis goes into the file name, because labels change. Readable names like
`rice__crop_growth__pest_damage__whorl_maggot_blotching__20260923__e8c1f0a2.jpg`
are produced only at export time.

## Label tiers

`model_proposed` (1) → `farmer_reported` (2) → `expert_verified` (3) → `lab_confirmed` (4) → `outcome_confirmed` (5).

Only tiers 3–5 are marked `training_truth`. The model's own labels are never used as ground truth, otherwise your model would learn to copy the vision model's mistakes. Expert and lab labeller references are ids, never a person's name.

## Decisions still open

1. **Photo resolution kept as raw.** The app stores 1536 px at about 500 KB today. At 150 million photos that is roughly 70 TB. Keeping the phone's full original (about 3–4 MB) would be roughly 450–600 TB. These figures are estimates, not measured. Whatever is chosen now is the best detail the future dataset can ever have.
2. **Consent screen and wording.** The DPDP notice and consent must be in the farmer's language. Consent is stored as `farmer_consent_log.consent_type = 'photo_ai_training'`. Until a farmer says yes, his photos are still stored as evidence but `training_consent` is false.
3. **Species register.** There is no register for weeds and insects yet, so the `taxon` label is stored as a scientific name in free text.

## Code changes that follow once this is applied (not done yet)

- **`diagnosis-contract.ts`:** photo ids become `crop_growth_uploads.id`.
- **Engine writes to `land_observation`:** set `measurement_type` to the observation code, take `observation_category` from `observation_master`, set `source = 'scan'`, and fill `photo_upload_id` and `photo_diagnosis_id`.
- **Engine annotations:** every validated model label is written as a `model_proposed` annotation. Unmapped signs are written both as `unmapped_sign` annotations and to `observation_vocabulary_gaps`, upserted through `obs_gaps_uq`.
- **Old direct inserts removed:** `TaskPhotoUploadDialog` and `useCropGrowthTracking` insert into `crop_growth_uploads` directly today, and that already fails under PIN auth. Both move to the central capture tool.
