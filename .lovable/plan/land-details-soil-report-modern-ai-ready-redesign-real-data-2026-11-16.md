# Land Details + Soil Report: modern AI-ready redesign (real data only)

## What is wrong today (from the screenshots and code)
1. **Soil report page shows raw keys** ("soil.loadError", "soil.checkAgain") — the soil translations exist in Marathi/Hindi/English, but the page renders before its language file loads.
2. **Soil report always fails to load** — it reads soil tables directly from the phone, the same path that was blocked earlier for satellite and schedule data. This land also has no soil test yet, so it should show a friendly "no test yet" screen, not an error.
3. **"Soil health 0%" card is misleading** — it shows 0% even when no soil test exists. It should say "Not tested" and offer to add a test.
4. **Soil tab shows fake zeros** — N/P/K show "0" when there is no data, and the chart has no meaning.
5. **Farm intelligence sheet shows English codes and labels** — "WATER_DEFICIT", "Rainfall last 24 hours", "Relative humidity" appear in English in the Marathi app.
6. Crop stage badge shows raw "harvest"; irrigation shows raw "river".
7. Tabs are icon-only with no labels on phones — farmers cannot tell what each tab is.

## New design (theme colours only, no made-up numbers)
- **Compact header**: land name, place, area, crop + translated stage in one slim bar; 4 small stat chips instead of 4 tall cards.
- **Labelled tab pill bar** (Overview, Soil, Work, History, Photos) with sliding highlight, short label under each icon.
- **Soil tab = "AI Soil Report"**:
  - Source badge for every value: Lab test / Satellite estimate / Device (ready for the coming soil testing device), with test date and confidence from the saved row.
  - Health ring computed only from values that exist; "Not tested" state when none.
  - Nutrient tiles (N, P, K, pH, organic carbon, moisture, texture) with level shown from the saved level/interpretation table — never a default 0.
  - "What this means" section from the soil interpretation table (no AI-invented advice); missing values listed as "needs test".
  - Actions: "Add soil test", "Open full report", share/download.
- **Full soil report page**: same visual language, translated loading/empty/error states, history of past tests.
- **Farm intelligence sheet**: translated alert names and reason labels; codes hidden.
- **Work / History / Photos tabs**: real rows from land activities, crop history and photos, with clean empty states.

## Technical details
- Add a `soil` action to the existing secure lands service (owner-checked) returning latest + past `soil_health` rows, `soil_source_observations` and `soil_test_interpretation`; switch `loadSoilReport` and the Land Details soil tab to it. No database or permission changes.
- Fix namespace loading in `SoilHealthReport.tsx` (wait for `soil` namespace / use `ready`).
- Soil score helper (pure function + tests): returns `null` when no measured values; no defaults.
- Display-only translation of farm-intelligence codes/labels via i18n keys in en/mr/hi.
- Files: `LandDetails.tsx`, `SoilHealthReport.tsx`, `components/soil/*`, new `components/lands/LandHeaderBar.tsx`, `services/soil/soilReport.ts`, `lands-api` (deploy), locale JSONs, `FarmIntelligenceCard` detail sheet.
- Verify: unit tests, build, mobile 394px screenshot of each tab.
