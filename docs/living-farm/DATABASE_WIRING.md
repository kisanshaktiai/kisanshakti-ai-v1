# Living Farm — database wiring (farmer-app repo, branch `living-farm-ui`)

Rule for this branch: a screen draws only values that an existing hook or service already reads. No table, column, policy, edge function or migration is changed.

Checked against the shared project on 2026-11-27 (read-only queries) and against the code at `e22af43`.

## Field home (`src/pages/FieldHome.tsx`, routes `/app` and `/app/home`)

| What the farmer sees | Value | Table and column | Read through | Notes |
|---|---|---|---|---|
| Shape of the field | boundary ring | `lands.boundary_polygon_old` (jsonb GeoJSON Polygon, `[lng, lat]`) | `useLands` → `landsApi.fetchLands` → `lands-api` edge function (`select('*')`) | All 33 live lands have it. `lands.boundary` (geometry) is filled on 1 land only, so it is not used. No boundary → a plain square plot. |
| Land name, crop | `lands.name`, `lands.current_crop`, `lands.current_crop_id` | `lands`, `crops` | `useLands`, `useCropNames` | Crop name in the app language, as on every other screen. |
| Crop height on the drawing | position of the current stage in the crop's own stage lane | `lands.stage_uuid`, `crop_stage_master` (lane order) | `useFieldSky(land).stage.index` and `.ladder` | 11 of 33 lands have a resolved stage. No resolved stage or no crop on the field → bare rows, no plants. The screen never works a stage out itself. |
| "Day N" label | days after sowing | `lands.das` (phenology engine) | `useFieldSky(land).stage.das` | Shown only while `cropActive` is true. |
| Water band in the soil edge, "soil is dry / has water" | governed irrigation flag | `land_weather_state.irrigation_needed` | `useFieldSky(land).water.irrigationNeeded` → `useLandWeatherState` → `weather` edge function (`action: 'land_state'`) | The table's RLS is `auth.uid()`-based, so it is read through the edge function, never directly. `true` draws a low band, `false` a full band, `null` draws no band. The band is a picture of a yes/no flag, not a percentage. |
| Temperature, rain chance, clouds, sun position | `temp`, `pop`, `clouds`, `main`, `sunrise`, `sunset` | `weather_current`, forecast tables | `useWeather(undefined, land.id)` | Sun is drawn only between `sunrise` and `sunset`. Rain chance uses the old home's rule (highest of the next 6 hours, else today). |
| Alert pin and the sentence, when an alert is live | `title_<lang>` else `title_en` translated | `proactive_alerts` | `useProactiveAlerts({ skipRealtime: true })`, `isLiveAlert`, `alertSourceText`, `useTranslatedTexts` | Filtered to the selected land. Most urgent, then newest. |
| Task pin and the sentence, when a task is due | `task_name` of tasks dated today and not completed | `crop_schedules`, `schedule_tasks` | `useTodayTasks` (new) → `useSchedules(land)` + `schedulesApi.fetchTasks(scheduleId)` → `schedules-api` edge function | Direct reads of these tables are denied to the app's role, so the same API as the Schedule page is used. |
| Read aloud | the sentence text | none | `useSpeech` | Same service as the header's read-aloud. |

**The sentence** (`src/living/fieldBrief.ts`) only chooses among those facts: a live alert, else a task due today, else the irrigation flag, else "no crop", else "nothing due". "Nothing due" is said only when lands, alerts, tasks and field state all loaded; while loading it says so, and after a failure it says the work could not be loaded.

## All (`src/pages/AllFeatures.tsx`, route `/app/all`)

| Shown | Source | Notes |
|---|---|---|
| Feature tiles | `useFeatures()` → `src/config/featureConfig.ts` + tenant feature switches + `useEntitlements` (plan locks) | Same list and locks as before. A locked tile opens `/app/subscription`. "Coming soon" entries (`/app/insurance`, `/app/loan`) have no route and are not shown. |
| Videos, Advisory, Notification settings, Subscription | fixed routes that the registry does not hold | So no routed screen is unreachable. |
| Services near me block | `useFarmServicesFlag()` + `FarmServicesHomeBlock` | Unchanged component, moved from the old home. |
| Video help card | `useYouTubeChannelReels(8)` + `VideoHelpCard` | Unchanged component, moved from the old home. |

## Dock (`src/living/LivingDock.tsx`)

| Button | Does | Existing wiring used |
|---|---|---|
| Field, Day, Land, All | navigate to `/app`, `/app/schedule`, `/app/lands`, `/app/all` | `useFeatures()` plan lock: a locked destination opens `/app/subscription`. |
| Voice button → Speak | `showVoiceMode()` / `hideVoiceMode()` | `ModernVoiceContext`, as the old centre menu did. |
| Voice button → Photo | opens `InstaScanFlow` | as the old centre menu did. |
| Voice button → Type | `/app/chat` | — |

## Gaps found (not changed here)

1. Stage is resolved on 11 of 33 lands and DAS on 12, so most live lands draw a bare field. That is existing data, not a wiring fault.
2. `useProactiveAlerts` does not expose an error flag; on a failed fetch it serves its offline cache. The sentence therefore cannot tell "alerts failed" from "no alerts". Exposing the flag is a logic change, so it is reported, not done.
3. `useWeather` sunrise and sunset arrive as numbers; both seconds and milliseconds are accepted by `sunProgress`.
