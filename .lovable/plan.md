## Verification result: your Bug #2 is REAL but the counts differ

Confirmed against the live DB and current code (not yet fixed).

**DB truth (`decision_rules`, is_active):** `crop_code` values are lowercase full names — `sugarcane` (523), `rice` (138), `brinjal`, `potato`, `tomato`, `onion`, `cotton`, `maize`, `soybean`, `chilli`, `wheat`, and `all` (64). No uppercase, no short codes like `SC`.

**`decision_rules` query sites in `agents/orchestrator.ts`: 2 — same as you said, but the line numbers moved.**

| Site | Line (current) | Status |
|---|---|---|
| by `rule_id` | 2654 | No casing issue — confirmed |
| by crop | **10408** (was 6620 in your copy) | **BUG CONFIRMED, NOT FIXED** |

The broken query, inside the `MANDATORY_FALLBACK` block:

```text
const cropCode = landContext?.current_crop?.toUpperCase() || landContext?.crop_code?.toUpperCase() || 'SC';
...
.or(`crop_code.eq.${cropCode},crop_code.eq.all`)
```

Two independent defects here: `RICE` never matches `rice`, **and** the `'SC'` default never matches anything at all (DB has `sugarcane`, not the short code). Result: only the 64 `all` rows can ever return, so the mandatory fallback is effectively crop-blind.

**`toUpperCase()` on a crop code: 7 sites, not 11** (5898, 5900, 6828, 7384, 7757, 9250, 10402). Only 10402 feeds a DB filter directly. The others propagate an uppercase crop symbol into the graph input (5898/5900), the authoritative land state (9250), the clarification input (7757), and audit/log payloads (6828, 7384) — no immediate zero-row failure, but they are the same latent contract break, since `canonicalCropCode` (already imported at line 791) is not applied to any of them.

Also note `canonicalCropCode` lower-snakes but does not expand short codes; `utils/crop-code-normalizer.ts` maps the other direction (name → `SC`), so it must not be used on this path.

## Fix plan (single file: `agents/orchestrator.ts`)

1. **Fix the query at 10402–10411.** Derive the crop from `canonicalContext?.crop_code ?? landContext?.current_crop ?? landContext?.crop_code`, pass it through `canonicalCropCode(...)`, and drop the `'SC'` literal default. When no crop resolves, query with `crop_code.eq.all` only and log `[FALLBACK_CROP_UNRESOLVED]` instead of silently guessing sugarcane.
2. **Guard against short codes.** If the resolved value is a short code (length ≤ 5 and not present in the DB's crop set), expand it to the full lowercase name via the existing reverse map in `utils/crop-code-normalizer.ts` (`getFullCropName`) then re-canonicalize, so `sc` → `sugarcane`.
3. **Stop uppercasing observation codes** at 10421 and 10436 in the same block — use `canonicalObsCode` so the codes handed to the label loader match `observation_master` lower_snake_case (the loader tolerates case today, but the block should not create new drift).
4. **Canonicalize the 6 propagation sites** (5898, 5900, 6828, 7384, 7757, 9250): replace `.toUpperCase()` with `canonicalCropCode(...)` so graph input, authoritative land state, clarification input, and audit logs all carry one canonical crop form.
5. **Add a drift probe.** After the fallback query, log `[FALLBACK_RULE_SCOPE] crop=<x> rows=<n>`; `rows=0` with a resolved crop now indicates a real data gap rather than a casing bug.

No DB migration, no agronomy logic change, no new files, no behavior change for crops that already resolve.

## Verification after implementation

- `rg -n "crop_code\.eq\.\$\{" agents/orchestrator.ts` returns only canonicalized call sites.
- `rg -n "current_crop\?\.toUpperCase" agents/orchestrator.ts` returns nothing.
- Trace a Rice DAS-33 turn that lands in `MANDATORY_FALLBACK` and confirm `[FALLBACK_RULE_SCOPE] crop=rice rows>0`.
