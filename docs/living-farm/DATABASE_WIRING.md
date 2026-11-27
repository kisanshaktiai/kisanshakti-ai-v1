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

## Day (`src/pages/DayView.tsx`, route `/app/day`)

| What the farmer sees | Value | Table and column | Read or written through | Notes |
|---|---|---|---|---|
| Sun on its path, sunrise and sunset times | `sunrise`, `sunset` | `weather_current` | `useWeather(undefined, land.id)` | The sun is drawn only between the two times. |
| Blue stretches on the path | hourly rain chance (`pop`) for daylight hours | hourly forecast | `useWeather().hourlyForecast` → `rainSegments` | Each hour is drawn at its own chance; the screen does not call any hour "likely". |
| Week strip: weather mark and dots | daily forecast `weather[0].main`; open tasks per date | forecast; `schedule_tasks.task_date`, `.status` | `useWeather().forecast`; `useTodayTasks().allTasks` | Dots are unfinished tasks on that date (three at most); a green dot means all done. |
| Task cards for the chosen day | `task_name`, `task_description`, `task_type`, `status` | `schedule_tasks` | `useTodayTasks` → `useSchedules(land)` + `schedulesApi.fetchTasks(scheduleId)` → `schedules-api` | Text is shown as stored (the schedule's own language). |
| "Work done" | completion of that task now | `schedule_tasks.status`, `.completed_at` | `schedulesApi.setTaskCompletion(taskId, true, now, null)` → `schedules-api` `POST /tasks/:id/complete` | The same call the schedule timeline makes for work done today. The list is then re-read from the server, so a recurring task that stays open is shown open. Offered only for today and earlier days. |
| Photo | task photo | as before | `TaskPhotoUploadDialog` (unchanged component) | Needs the schedule, land, farmer and tenant ids, all taken from data already loaded. |
| Listen | task name and description | none | `useSpeech` | — |
| "Full schedule", "Make a schedule" | — | — | navigate to `/app/schedule` | Generating, editing, stages, drafts, consent dialogs and measured irrigation litres stay on the existing Schedule page. |

**A limit set by the data:** `schedule_tasks` has a date but no time of day, so a task cannot be placed on the sun path at "the right hour". The first sample picture showed that; the built screen lists the day's tasks under the path instead. Placing tasks by hour would need a time or a time window per task from the schedule engine, which is a backend change and is not done here.

## Land (`src/pages/LandCore.tsx`, route `/app/land`)

The chosen land read top to bottom: sky, crop, water, soil. Each band opens the existing page that holds the detail.

| Band | Value | Table and column | Read through | Opens |
|---|---|---|---|---|
| Sky | temperature, rain chance | `weather_current`, forecast | `useWeather(undefined, land.id)` | `/app/weather` |
| Crop: "Day N · stage" | days after sowing, stage name | `lands.das`, `lands.stage_uuid`, `crop_stage_master` | `useFieldSky(land).stage` (`das`, `stageName`, `ladder`, `index`, `next`), stage names through the existing `stageKey` translation keys | `/app/lands/:id` |
| Crop: one-line verdict | the satellite verdict the field-sky model already gives | `ndvi_data`, `ndvi_intelligence`, `crop_stage_master` bands | `useFieldSky(land).state`, worded by the existing `sky.state.*` keys | same |
| Water | governed irrigation flag | `land_weather_state.irrigation_needed` | `useFieldSky(land).water.irrigationNeeded` → `weather` edge function | `/app/weather` |
| Soil: one or two plain lines | pH, organic carbon, N, P, K read against the governed bands | saved soil reports (lab, device, soil map) and soil rating bands | `loadSoilState` → `resolveSoilSources` → `bestReadings` → `soilVerdictLines` (the same chain as the soil card on the land page) | `/app/lands/:id/soil` |
| Buttons | all lands, satellite view, edit, listen | — | navigate to `/app/lands`, `/app/lands/:id/ndvi`, `/app/lands/:id/edit`; `useSpeech` | — |

`bestReadings` was a private function inside `src/components/soil/LandSoilSummary.tsx`. It is moved, unchanged, to `src/lib/soilBestReadings.ts` so both screens use one copy.

**Differs from the sample picture:** the sample showed soil moisture at three depths. The governed soil chain gives moisture only from a soil device and has no per-depth verdict, so the built screen shows one water band from the irrigation flag and one soil band from the saved soil reports. No depth figures are invented.

## Companion, step 1: the reply card and its actions (chat page)

No data path changes. The decision reply still arrives from `ai-agriculture-chat` as `message.advisorCard` and the card renders only what the backend sent.

| Change | File | Why |
|---|---|---|
| Labels read with `keyPrefix: 'chatCards'` | `src/components/chat/AdvisorCard.tsx` | The card asked i18n for a namespace named `chatCards`. `src/i18n/config.ts` merges every page bundle into the default namespace under its own key, so that namespace never existed and What / Why / How fell back to English. A test now proves the Marathi labels show. |
| New key `chatCards.cards.dayN` (en, hi, mr) | `src/i18n/locales/*/chat-cards.json` | The card used this key for the day count but it was missing, so only a bare number showed. |
| WHAT is the large sentence, HOW is numbered steps, sizes from the fluid scale | `src/components/chat/AdvisorCard.tsx` | Living Farm look. Order, sections and collapsed parts are unchanged. |
| Copy, read-aloud, share, like, dislike always visible, 44 px each | `src/components/chat/ModernChatUI.tsx` | The row was `opacity-0` until hover, and phones have no hover. Handlers are unchanged. |
| Same prefix fix | `src/components/chat/GeneralChatLandPicker.tsx` | It asked for a namespace `chat`; its six keys exist under `chat.*` in the merged bundle. |

**Found, not fixed (needs new wording, so it is your call):** four more components ask for namespaces that do not exist and their keys are not in any bundle, so they show English or raw keys today: `ChatQuotaHeader.tsx` (`quota.used`, `quota.resets_in`), `ChatQuotaBanner.tsx` (`quota.exceeded_body`, `quota.upgrade_cta`), `TenantSuspendedScreen.tsx` (4 keys) and `LandLimitGuard.tsx` (2 keys).

## Companion, step 2: the composer (`src/components/chat/EnhancedAIChatInterface.tsx`)

Markup only. Every control calls the handler it called before.

| Control | Handler (unchanged) | Change |
|---|---|---|
| Photo | `setShowPhotoTool(true)` | Moved out of the pill to the left, 48–58 px, tonal. |
| Attach picture | `fileInputRef.current?.click()` | Inside the pill, 44 px. |
| Text | `inputValue`, `handleKeyDown` | 16 px text (14 px made iPhones zoom the page on focus). |
| Mic / stop | `startListening` / `stopListening` | Largest control, at the right under the thumb; a still ring while listening instead of an endless pulse. |
| Send | `sendMessage()` | Replaces the mic when there is text or an attachment, as before. |
| Attached pictures before sending | `attachedFiles`, `setAttachedFiles` | Thumbnails 72–96 px (were 48), a 32 px remove button (was 16), file name for non-pictures. Preview addresses are made once per list and released, instead of a new one on every render. |

Labels use the existing `chat.input.*_aria` keys; one new key, `living.chat.remove_attachment`. The quota header and banner sit where they were. `text-white` on the buttons is replaced by the theme's foreground tokens.

Chat header: the title block may now shrink and the action group may not, so the search and refresh buttons stay on screen at 320 px (they were pushed off the right edge). Back, search and refresh gained labels from the existing `common.back`, `common.search`, `common.refresh` keys. No handler changed.

**Seen, not changed:** in a sent message, a picture that fails to load is hidden (`ModernChatUI.tsx`, `onError` sets `display: none`), so the farmer sees nothing where the picture should be.

## Shared pieces

- `src/living/LandBar.tsx`: land chip and picker for Field, Day and Land, with `WorkspaceSwitcher variant="header"` first in the row. The floating copy of the switcher is not drawn on `/app`, `/app/home`, `/app/day` and `/app/land`, and on other farmer pages it now sits just above the dock.
- `src/living/useChosenLand.ts`: the picked land is kept in `sessionStorage` (`lf_chosen_land`) so Field, Day and Land show the same land. Nothing is written to the database.

## Gaps found (not changed here)

1. Stage is resolved on 11 of 33 lands and DAS on 12, so most live lands draw a bare field. That is existing data, not a wiring fault.
2. `useProactiveAlerts` does not expose an error flag; on a failed fetch it serves its offline cache. The sentence therefore cannot tell "alerts failed" from "no alerts". Exposing the flag is a logic change, so it is reported, not done.
3. `useWeather` sunrise and sunset arrive as numbers; both seconds and milliseconds are accepted by `sunProgress`.

## Weather (`src/pages/Weather.tsx`)

Same route (`/app/weather`) and the same three data calls as before: `useWeather()`, `useLands()`, `useLandWeatherState(selectedLandId)`. The land selection rule (first land until the farmer picks another), the refresh handler and its toasts, the pull-to-refresh controller, the field panel (`LandAgronomyPanel`), the farming advice (`FarmingRecommendations`), read-aloud (`VoiceWeatherSummary`) and the seven-day list (`SevenDayForecast`) are the same components with the same inputs.

| Part | Fields read (unchanged) | Change |
|---|---|---|
| Now | `currentWeather.temp/description/feels_like/main/location/provider`, `locationSource`, `regionalFallbackLabel`, `weatherDistanceKm`, `weatherStationName`, `isStale`, `lastUpdated` | Drawn in the page instead of `WeatherHeroCard`. Same provenance rule. "Old reading", "Updated", "Feels like" now come from existing keys (were English in code). |
| Six readings | `wind_speed`, `humidity`, `visibility`, `pressure`, `uv_index`, `dew_point` | One 3-column grid, same colour thresholds. |
| Hour by hour | `hourlyForecast[0..11].dt/temp/pop` | Plain scrolling strip; the chart library is no longer loaded for this page. `feels_like` per hour is no longer shown. |
| Rain | `forecast[0..6].rain` | Today and week totals as before; seven plain bars. The cumulative line is no longer drawn. |

Removed from this page: the moving background (`AnimatedWeatherBackground`), three endless animations and all blur. Those component files are left in the repo, unused by this page.

**Missing wording found:** `weather.farming.unavailable` is not in any language file, so the advice cards show the English fallback "Decision unavailable".

## Loading on old phones

Measured on the built app, phone-sized browser, processor slowed 6x, 1.6 Mbit/s network, compressed files, start address up to the splash screen (the database is not reachable from the test machine, so pages behind sign-in were not timed):

| Build | First paint | Download | Script memory |
|---|---|---|---|
| `kisanshakti-ai-update` (85aa422) | 2.3 s | 626 kB | 11.7 MB |
| `living-farm-ui` | 2.3 s | 623 kB | 10.3 MB |

The photo scan flow is now fetched when first opened instead of with the app shell (shell script 660 kB to 608 kB uncompressed). Screen-height units in `living.css` have a `vh` line before each `dvh` line for browsers older than Chrome 108.
