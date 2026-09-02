# Crop Schedule Creation — UI/UX forensic audit and surgical fixes

## What the audit found (verified in code + database)

1. **Land header wastes the top band.** `CropDateInput.tsx` renders a full-width header row (back button + land name + acres) and only two tiny chips (soil, water). It occupies a full row of vertical space on a 393px screen while showing almost nothing, and the water chip prints the word "Water" instead of the actual water source value.
2. **Variety detail card typography/colour is inconsistent.** `VarietyDetailSheet.tsx` mixes English title (`Rice Indrayani`) at one weight with a smaller local name underneath, then a long unbroken Marathi description block at the same size as metadata. Metric tiles show em-dash placeholders for water and seed rate, so half the grid renders empty.
3. **Resistance chips print raw scientific names.** `useCropVarieties.fetchResistance` maps `variety_resistance.threat_name` straight into the chip, so the farmer sees `Leaf Scald (Microdochium Oryzae) · MS` and `Blast (Magnaporthe Oryzae) (Neck/Panicle Phase) · R`. Local names exist in the database and are unused: `pest_master` (124 rows, 111 with `pest_name_mr` / `pest_name_hi`) and `disease_risk_model` (90 disease rows, all with `disease_name_mr` / `disease_name_hi`). `variety_resistance` has no direct FK to either, so matching must be by normalised English name — never invented.
4. **Intercrop picker looks like a different app.** `MultiIntercropSelector` opens a `Dialog` with `max-w-md w-[calc(100vw-2rem)] max-h-[80vh]`, a fixed `h-[280px]` crop list and `backdrop-blur-xl` — while every other step in this flow is a full-screen opaque panel (`fixed inset-0 bg-background`). Hence the small, floating, out-of-place window in the screenshot. The blur also violates the project's mobile-FPS rule.

## Changes

### Task 1a — Compact, aesthetic land strip (`src/components/schedule/CropDateInput.tsx`)
- Replace the header block with a single-line land strip: back chevron, land name + area on one line, and a horizontally scrollable chip row on the same row.
- Chips render only real values already loaded on `land`: area (acres • guntas), soil type (localised via existing soil label helper), water source (actual value, not the literal word "Water"), village/district when present.
- Height target ~56px total (down from the current two-block header), rounded-xl muted surface, no backdrop-blur.

### Task 1b — Variety detail card polish (`src/components/crops/VarietyDetailSheet.tsx`)
- Typography scale: local name becomes the primary heading (largest, semibold), English/official name becomes the secondary muted line, variety code and completeness stay as badges.
- Metric tiles: hide a tile entirely when its value is missing instead of rendering `—`, so the grid never shows empty cells.
- Description block: reduce to `text-[13px] leading-relaxed`, clamp to ~6 lines with a "read more" toggle.
- Colour theme: replace the mixed success/info ad-hoc tints with the semantic tokens already used elsewhere in the flow (`primary` for headings/accents, `muted` for surfaces, resistance levels keep the existing success/warning/destructive mapping).

### Task 1c — Local names for resistance (DB-backed, no invention)
- New `src/lib/threatLocalName.ts`: loads `pest_master (pest_code, pest_name_en, pest_name_hi, pest_name_mr)` and the distinct disease rows from `disease_risk_model (disease_name_en, disease_name_hi, disease_name_mr)` once, caches them, and resolves a threat by normalised English name.
- Normalisation for matching only: lowercase, strip the scientific parenthetical, strip `MR to ` / `Resistant to ` prefixes and trailing qualifiers.
- Render rule per chip:
  - match found → show the local name for the active language;
  - no match → show the cleaned English name (parenthetical scientific part removed);
  - never fabricate a translation; the scientific name moves into the chip's `title` tooltip only.
- Applied in `VarietyDetailSheet.tsx` and `VarietyDetailCard.tsx` (both render the same resistance chips).

### Task 2 — Intercrop picker matches the flow (`src/components/schedule/MultiIntercropSelector.tsx`)
- Convert the `Dialog` into the same full-screen panel pattern used by the crop/variety steps: `fixed inset-0 z-50 bg-background pt-14 pb-nav-safe`, opaque, no blur, same header bar (back chevron + title), same footer action bar with a full-width primary button.
- Crop list fills remaining height (`flex-1 min-h-0`) instead of the fixed 280px box.
- Reuse the same card/tile styling and touch-target sizes as the main crop picker so the two screens are visually identical.

## Technical notes
- Frontend/presentation only: no schema changes, no edge-function changes, no changes to schedule generation logic or the `onSubmit` contract.
- All strings continue through the existing i18n path; any new label keys are added to `en`, `hi`, `mr`.
- Verification: `tsgo` typecheck clean, then a browser pass on `/app/schedule` in Marathi covering land strip → crop → variety detail sheet (resistance chips) → intercrop full-screen picker.
