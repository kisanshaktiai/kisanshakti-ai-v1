
## Forensic Translation Audit — Findings

I scanned every `t('…')` call in the recently changed Add Land flow plus the 25 page-level locale files. The structure is healthy (per-page JSON shards under `src/i18n/locales/{en,hi,mr}/`, plus monolithic `en.json/hi.json/mr.json/pa.json/ta.json`), but several namespaces used by new components do **not exist** in any locale file. Right now those strings only render correctly in English because the components carry inline `defaultValue: '…'` fallbacks. For Hindi / Marathi / Punjabi / Tamil farmers, the UI silently falls back to **English text**, which is exactly what the user is reporting.

### Critical gaps (Add Land form — top priority)

1. **`lands.smartConfirm.*`** — used by `SmartLandConfirmCard.tsx` (~45 keys). MISSING in `en/lands.json`, `hi/lands.json`, `mr/lands.json`, `pa.json`, `ta.json`.
   - Examples: `title`, `whereIsIt`, `whatsGrowing`, `currentCrop`, `previousCrop`, `sowedOn`, `landPrep`, `sameDay`, `7days`, `14days`, `expectedHarvest`, `stageNow`, `character`, `soil`, `water`, `irrigation`, `ownershipTitle`, `owned`, `leased`, `shared`, `survey`, `previousCycle`, `tapAddPrevious`, `lastHarvest`, `moreDetails`, `optional`, `notesPlaceholder`, `marketplace`, `outsideIndia`, `tapToSet`, `tapToAdd`, `tapToAddCharacter`, `sowed`, `voiceCaptured`, `savedTitle`, `savedDesc`, `save`, `thinking`, `aiPrompt`, `confirmed`, `name`, `namePlaceholder`, `suggestedCrops`, `errors.{name,country,state,district,crop,sowing}`.

2. **`lands.location.*`** — used by `LocationPickerSection.tsx` (~20 keys). MISSING everywhere.
   - `title`, `country`, `state`, `district`, `taluka`, `village`, `pickState`, `pickDistrict`, `pickTaluka`, `searchPlaceholder`, `noMatchesFor`, `selectStateFirst`, `selectDistrictFirst`, `selectTalukaFirst`, `stateMustPick`, `districtNotListed`, `talukaNotListed`, `villageNotListed`, `districtTypeName`, `talukaTypeName`, `villageTypeName`, `useTypedAbove`.

3. **`common.use`, `common.change`, `common.noResults`** — used by location picker / review card; only `noResults` exists in `common.json`. `common.use` and `common.change` are missing.

4. The bilingual `t('district') / t('taluka') / t('village')` calls in `LocationPickerSection.tsx` (lines that fall back to plain words) — these are top-level keys with no namespace and will never resolve. They must be migrated to `lands.location.*`.

### Broader app gaps (from `missing-report.json` audit doc + my scan)

The repo already has a documented audit (`missing-report.json`) listing **487 missing keys** across pwa, auth, ndvi, schemes, advisory, video, error, sync, toasts. Spot-checks confirm those gaps still exist in the page shards (e.g. `pwa.json` is missing the `pwa.install_title` / step-by-step iPhone install copy; `ndvi.json` lacks the action-list keys; `sync.json` lacks the partial-sync copy).

### Translation quality issues observed

- Several existing Hindi/Marathi strings are literal machine-style ("स्थान विवरण" for "Location Details" → farmers say "ठिकाण" / "जागा"). New strings will use farmer-friendly rural vocabulary, not Sanskritised dictionary forms.
- Devanagari numerals are inconsistent — we keep Latin digits for crop counts/areas (matches DB) and Devanagari only in narrative copy, per existing memory rules.

---

## Plan of Work

### Step 1 — Add missing namespaces to land form locales (5 languages)

Add the two new branches `lands.location` and `lands.smartConfirm` to:

- `src/i18n/locales/en/lands.json`
- `src/i18n/locales/hi/lands.json`
- `src/i18n/locales/mr/lands.json`
- `src/i18n/locales/pa.json` (extend `lands` block)
- `src/i18n/locales/ta.json` (extend `lands` block)

Translations will be **rural-farmer voice**, hand-crafted (not machine output). Examples:

| Key | English | Hindi (rural) | Marathi (rural) |
|---|---|---|---|
| `smartConfirm.title` | Confirm your land | अपनी ज़मीन की पुष्टि करें | तुमची जमीन तपासा |
| `smartConfirm.whereIsIt` | Where is it? | यह कहाँ है? | ही जमीन कुठे आहे? |
| `smartConfirm.whatsGrowing` | What's growing? | क्या उग रहा है? | काय पीक आहे? |
| `smartConfirm.sowedOn` | When was it sowed? | बुवाई कब की? | पेरणी कधी केली? |
| `smartConfirm.landPrep` | Land prepared | खेत तैयार किया | जमीन तयार केली |
| `smartConfirm.sameDay` | Same day | उसी दिन | त्याच दिवशी |
| `smartConfirm.7days` | 7 days before | 7 दिन पहले | 7 दिवस आधी |
| `smartConfirm.expectedHarvest` | Expected harvest | अनुमानित कटाई | अपेक्षित कापणी |
| `smartConfirm.stageNow` | Stage now | अभी की अवस्था | सध्याची अवस्था |
| `smartConfirm.character` | Land character | ज़मीन की पहचान | जमिनीची ओळख |
| `smartConfirm.soil` | Soil type | मिट्टी का प्रकार | मातीचा प्रकार |
| `smartConfirm.water` | Water source | पानी का स्रोत | पाण्याचा स्रोत |
| `smartConfirm.irrigation` | Irrigation type | सिंचाई का तरीका | पाणी देण्याची पद्धत |
| `smartConfirm.owned` | Owned | अपनी | स्वतःची |
| `smartConfirm.leased` | Leased | किराये पर | भाड्याने |
| `smartConfirm.shared` | Shared | साझेदारी | वाट्याने |
| `smartConfirm.survey` | Survey number (optional) | सर्वे नंबर (वैकल्पिक) | सर्वे नंबर (ऐच्छिक) |
| `smartConfirm.previousCycle` | Previous cycle | पिछली फसल | मागील पीक |
| `smartConfirm.tapAddPrevious` | Tap to add (helps AI) | जोड़ने के लिए टैप करें (AI को मदद) | जोडण्यासाठी टॅप करा (AI ला मदत) |
| `smartConfirm.tapToSet` | Tap to set | सेट करने के लिए टैप करें | निवडण्यासाठी टॅप करा |
| `smartConfirm.thinking` | AI… | AI सोच रहा है… | AI विचार करत आहे… |
| `smartConfirm.aiPrompt` | AI guessed this. Looks right? | AI ने अनुमान लगाया। सही है? | AI ने अंदाज लावला. बरोबर आहे का? |
| `location.pickState` | Select State | राज्य चुनें | राज्य निवडा |
| `location.pickDistrict` | Select District | ज़िला चुनें | जिल्हा निवडा |
| `location.pickTaluka` | Select Taluka | तालुका चुनें | तालुका निवडा |
| `location.searchPlaceholder` | Search… | खोजें… | शोधा… |
| `location.noMatchesFor` | No matches for "{{q}}" | "{{q}}" के लिए कुछ नहीं मिला | "{{q}}" साठी काही सापडले नाही |
| `location.selectStateFirst` | Select State first | पहले राज्य चुनें | प्रथम राज्य निवडा |
| `location.districtNotListed` | District not in list? | ज़िला सूची में नहीं? | जिल्हा यादीत नाही? |
| `location.useTypedAbove` | Use what you typed | जो लिखा है उसका उपयोग करें | लिहिलेले वापरा |

(Full string set — ~65 keys — will be added in the implementation pass; same coverage across hi/mr/pa/ta. English source goes into `en/lands.json`.)

### Step 2 — Fix the un-namespaced `t('district')` / `t('taluka')` / `t('village')` calls

In `src/components/land/LocationPickerSection.tsx`, replace bare-key calls with `lands.location.district` etc. so they resolve in every language.

### Step 3 — Extend `common.json` (5 languages)

Add: `common.use`, `common.change`, `common.selectManually`, `common.searchHere`, `common.required`, `common.optional` (a few already exist; only fill the missing ones).

### Step 4 — Backfill the 487-key shortlist from `missing-report.json`

Add the missing keys to:
- `pwa.json` — install steps, iPhone/Android/Desktop flows
- `auth.json` — registration, PIN, attempts-remaining, offline-mode messages
- `ndvi.json` — health bands + action items + critical actions
- `schemes.json` — PM-Kisan / crop-insurance / soil-health-card copy
- `advisory.json` — irrigation/pest/market alert templates
- `video.json` — empty/loading states
- `error.json` — ErrorBoundary copy
- `sync.json` — full/partial/failed sync messages
- `toast.json` — generic toast templates used across pages

For each, write rural-farmer Hindi & Marathi (and basic Punjabi/Tamil where the file exists). No "Google-Translate" tone — phrases are reviewed against existing high-quality strings already in the same file (e.g. existing Marathi `weather.json` voice is the reference style).

### Step 5 — Add a guard test

Add a Vitest unit test `tests/i18n/key-parity.test.ts` that:
- Loads every key from `en/*.json`
- Asserts the same key exists in `hi/*.json` and `mr/*.json`
- Fails the build when a future PR introduces an English-only key

### Step 6 — Lightweight verification

After translations land, switch language to Hindi and Marathi via the language switcher and re-walk the Add Land flow on the 390×688 viewport (the user's current device size) to confirm:
- All chips, sheet titles, buttons, error toasts render in the selected language
- No raw English `defaultValue` leaks through
- Pen-icon picker headings, search placeholders, and "no results" copy are localized
- Crop selector "suggested for your field" strip uses the localized label

---

## Files to be created / edited

```
src/i18n/locales/en/lands.json            (extend: + location, smartConfirm)
src/i18n/locales/hi/lands.json            (extend: + location, smartConfirm)
src/i18n/locales/mr/lands.json            (extend: + location, smartConfirm)
src/i18n/locales/pa.json                  (extend lands block)
src/i18n/locales/ta.json                  (extend lands block)

src/i18n/locales/en/common.json           (+ use, change, selectManually …)
src/i18n/locales/hi/common.json
src/i18n/locales/mr/common.json

src/i18n/locales/{en,hi,mr}/pwa.json      (backfill 27 keys)
src/i18n/locales/{en,hi,mr}/auth.json     (backfill 27 keys)
src/i18n/locales/{en,hi,mr}/ndvi.json     (backfill ~45 keys)
src/i18n/locales/{en,hi,mr}/schemes.json  (backfill 17 keys)
src/i18n/locales/{en,hi,mr}/advisory.json (backfill 8 keys)
src/i18n/locales/{en,hi,mr}/video.json    (backfill 3 keys)
src/i18n/locales/{en,hi,mr}/error.json    (backfill 5 keys)
src/i18n/locales/{en,hi,mr}/sync.json     (backfill 19 keys)
src/i18n/locales/{en,hi,mr}/toast.json    (backfill 19 keys)

src/components/land/LocationPickerSection.tsx
  - Replace bare t('district'/'taluka'/'village') with lands.location.* keys

tests/i18n/key-parity.test.ts             (NEW — prevent regressions)
```

No component logic changes beyond the bare-key fix in `LocationPickerSection.tsx`. The Add Land form's behaviour (pickers opening, AI cascade, pen-icon flow) is already correct after the previous fixes — this pass is purely about giving every visible string a real translation in every supported language.
