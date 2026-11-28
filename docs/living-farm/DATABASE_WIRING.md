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

Same route (`/app/weather`) and the same three hooks: `useWeather`, `useLands`, `useLandWeatherState(selectedLandId)`. **Since 2026-11-28 (owner's yes): `useWeather(undefined, selectedLandId)`** — the page asks for the chosen land's weather, the call Field, Day and Land already make. With a land id the `weather` edge function reads the land's own centre point and refreshes that land's weather metrics; the function itself is not changed. The land shown is the shared choice (`useChosenLand`): the last land picked on any Living Farm page, else the first active land (it was always the first land in the list). Picking a land on this page changes the choice for the other pages too. The refresh handler and its toasts, the pull-to-refresh controller, the field panel (`LandAgronomyPanel`), the farming advice (`FarmingRecommendations`), read-aloud (`VoiceWeatherSummary`) and the seven-day list (`SevenDayForecast`) are the same components with the same inputs.

| Part | Fields read (unchanged) | Change |
|---|---|---|
| Now | `currentWeather.temp/description/feels_like/main/location/provider`, `locationSource`, `regionalFallbackLabel`, `weatherDistanceKm`, `weatherStationName`, `isStale`, `lastUpdated` | Drawn in the page instead of `WeatherHeroCard`. Same provenance rule. "Old reading", "Updated", "Feels like" now come from existing keys (were English in code). |
| Six readings | `wind_speed`, `humidity`, `visibility`, `pressure`, `uv_index`, `dew_point` | One 3-column grid, same colour thresholds. |
| Hour by hour | `hourlyForecast[0..11].dt/temp/pop` | Plain scrolling strip; the chart library is no longer loaded for this page. `feels_like` per hour is shown under each temperature (it was in the chart's tap tooltip). |
| Rain | `forecast[0..6].rain` | Today and week totals as before; seven plain bars. The old chart drew the same daily rainfall values as an area. |

Removed from this page: the moving background (`AnimatedWeatherBackground`), three endless animations and all blur. Those component files are left in the repo, unused by this page.

**Missing wording found:** `weather.farming.unavailable` is not in any language file, so the advice cards show the English fallback "Decision unavailable".

## Loading on old phones

Measured on the built app, phone-sized browser, processor slowed 6x, 1.6 Mbit/s network, compressed files, start address up to the splash screen (the database is not reachable from the test machine, so pages behind sign-in were not timed):

| Build | First paint | Download | Script memory |
|---|---|---|---|
| `kisanshakti-ai-update` (85aa422) | 2.3 s | 626 kB | 11.7 MB |
| `living-farm-ui` | 2.3 s | 623 kB | 10.3 MB |

The photo scan flow is now fetched when first opened instead of with the app shell (shell script 660 kB to 608 kB uncompressed). Screen-height units in `living.css` have a `vh` line before each `dvh` line for browsers older than Chrome 108.

## Market (`src/pages/Market.tsx`)

Same route (`/app/market`). Every query and write in the page is byte-for-byte the code that was there: `marketplace_categories`, `marketplace_products` (with `farmers` and category joins), `cart_items` (select, upsert, update, delete), `wishlist_items` (select, insert, delete). The prices tab still uses `useMarketPriceIntelligence(user.id, scope)` and `landsApi.fetchLands()`.

What changed is drawing and wording only:

- Page header, four tabs and the three empty states use the shared sizes and theme tokens.
- 57 lines of Marathi written in code across the page and eight market components now come from `market.ui.*` keys in `en`, `hi` and `mr` (`market.json`). The Marathi values are the strings that were in the code. Other languages fall back to English, where before they saw Marathi.
- `PriceComparisonChart` and `MarketCropDetailSheet` (the two users of the chart library) are fetched when the farmer opens the trend section or taps a price card, not when the page opens.
- Price card date uses the app language.

**Seen, not changed (logic or data, outside UI scope):**

1. `fetchWishlist` reads `wishlist_items` by `farmer_id`, but `toggleWishlist` inserts and deletes by `user_id`.
2. `addToCart` writes `unit_price: 0` and `cart_id: user.id` on every cart row.
3. `PriceComparisonChart.tsx:83` prints the state name of Maharashtra as fixed text under every crop.
4. `MarketPriceCard.tsx` picks the category emoji from a table keyed by Marathi category names.

## Lands list (`src/pages/LandManagement.tsx`, `src/components/land/ModernLandCard.tsx`)

Same route (`/app/lands`). Data still comes only from `useLands()`; delete still calls `landsApi.deleteLand(id)` then `onRefresh`; the search, filter, sort, view-mode, export and soil-colour rules are the lines that were there. Card buttons go to the same routes: `/app/lands/:id`, `/soil`, `/ndvi`, `/edit`, and `/app/lands/add`.

Drawing changes:

- Filter is three chips under the search box; sort and view mode stay in the sheet as large buttons. Export stays a wide-screen action, as before.
- The card's edit and delete moved from two 32 px buttons on top of the picture to 48 px buttons in the card; their labels come from `lands.card.edit` / `lands.card.delete` (were English tooltips).
- Area units use `common.acres` and the new `living.land.guntas`; the "updated" date follows the app language and is hidden when the land has no date (it printed "Never").
- `LandThumbnail`: "No boundary", "Loading..." and "Offline" come from keys; blur removed. Its picture source is unchanged.
- Entry animations and hover scaling removed.

**Removed because it was not data:** the card's "85% Utilized" badge. The code printed 85 for any land with a crop and 0 otherwise (`land.current_crop ? 85 : 0`); no table holds that number.

**Seen, not changed:** `crop_stage` is printed as the raw database word in the list view.

## App bar on notched phones, and the field scene for long fields (fix)

No data call is involved in any of these.

- `AppLayout.tsx`: the app bar was a fixed 56 px box with the phone's top inset added as padding inside it, so on a phone with a notch its row was squeezed out of the box and drawn on top of the page. Measured with a 59 px inset: bar box 0–60 px, bar contents 41–77 px. The bar is now 56 px plus the inset (`--app-header-h`, defined in `living.css`), and the banner and the page offset use the same value. Measured after: bar box 0–115 px, contents 69–105 px.
- The floating voice-navigation button is hidden on Day and Land as it already was on Field; those pages fit one screen, so it sat on top of text that cannot be scrolled out from under it.
- `FieldScene.tsx`: the shadow is drawn under the block's real bottom edge, and the day and water labels sit below the block, so a long thin field no longer has labels on top of it and a shadow far below it.
- `FieldHome.tsx`: while the sun is in the left part of its path (before about 42 % of the day) the temperature moves to the right and the clouds to the left, so the sun does not sit on the number.

## Features kept reachable in the new shell (voice navigation, first-run tour)

- **Voice navigation** (`NativeVoiceButton`, `useNativeVoiceNavigation`): on Field, Day and Land the floating button is mounted but hidden while idle (`lf-voice-tucked`), because those pages fit one screen and it covered text. The dock's Ask sheet has a fourth way, "Go by voice", shown only when the button exists; it sends the window event `voice-navigation:start`, which the button answers with its own click handler. While listening or showing its panel the button is visible as before. On every other page it floats as before.
- **First-run tour** (`FeatureWalkthrough`): its steps point at `data-tour` names that lived on the old home page. The new shell carries them: `weather` on the temperature, `schedule` on Day, `ndvi` on Land, `chat scan mic` on the centre button, `market community` on All, `nav` on the dock. The tour's selector matches one name within a list (`~=`), so one control can answer to several steps.

## Land details (`src/pages/LandDetails.tsx`) — one land's own context

Same route (`/app/lands/:id`). Everything is read for the land in the address, as before:

| Part | Source (unchanged) |
|---|---|
| Land row | `landsApi.fetchLandById(id)`; live updates on `lands` filtered `id=eq.<id>` |
| Activities | `land_activities` where `land_id = id`, newest 10; live updates filtered `land_id=eq.<id>` |
| Crop history | `crop_history` where `land_id = id` |
| Field intelligence | `FarmIntelligenceCard landId={id}` |
| Soil tab | `LandSoilSummary landId={id}` |
| Delete | `landsApi.deleteLand(id)` then back to `/app/lands` |
| Soil health score | the same pH / organic carbon / nitrogen rule, and no score for a soil-map estimate |

Added, read-only, for the same land: `useFieldSky(id)` (the hook Field home and Land already use) feeds the picture of the field at the top — its saved boundary, crop stage day and the irrigation flag.

Opening a land's details also makes it the chosen land for Field, Day and Land (`rememberChosenLand`, session storage only), so the farmer stays in that land's context.

Drawing changes: header buttons 48 px with labels; four facts in a 2x2 grid; the five tabs are a scrolling row of pills (the fixed five-column row used 10 px labels); ownership and soil type use `landAttributeLabel` like the land card; all dates follow the app language; no blur. The two charts moved unchanged into `src/components/land/LandDetailsCharts.tsx` and are fetched when the Activities or History tab is opened.

**Seen, not changed:**

1. Five buttons open addresses that have no page in `App.tsx`, so they land on the not-found page: Add / Log activity (`/app/lands/:id/activities/add`), Add crop record (`/crop-history/add`), Upload photos and Upload first photo (`/gallery/upload`).
2. The Gallery tab always shows "no photos"; it reads nothing.
3. The History chart's revenue line is always 0 (`revenue: 0` in code).
4. `activity_type` and `growth_stage` are printed as the stored words.

## Profile (`src/pages/Profile.tsx`) — checked, not changed

Rendered at 320 px (Marathi) and 393 px (English) with a filled profile: no sideways overflow, no text under 12 px, no endless animation, theme tokens throughout. The only control under 40 px is the read-aloud switch (44 x 24 px, the standard switch). Nothing was changed.

**Seen, not changed (affects every page):** the default `Button` style is `bg-gradient-primary`, and `--gradient-primary` in `src/index.css` (lines 207 and 401) is a fixed blue-to-cyan gradient that tenant themes do not set. Every default button in the app is therefore blue whatever the tenant's colour.

## Default button colour (`src/index.css`)

`--gradient-primary` and `--shadow-glow` were fixed blue values that tenant themes do not set, so the default `Button` was blue for every tenant. Both now derive from `--primary`, the pattern `--gradient-secondary` already used. This recolours default buttons on every page and workspace.

## Schedule (`src/pages/Schedule.tsx`) — first step only

Nothing in the schedule flow's logic is touched: land choice, crop and date input, review drafts, generation, consent dialog and the schedule view are the same code. Changed so far:

- Page header: back and refresh are 48 px with labels from `common.back` / `common.refresh`; the title uses the shared heading size; the step dots' label no longer contains English words.
- `LandSelector`: the land name starts below the status badge (the badge sat on top of a long name); blur removed; one 10 px line enlarged; the sparkle icon no longer pulses.

**Schedule view (done 2026-11-28).** Rendered with one schedule and nine tasks in the shape of a real one, at 320 px (Marathi) and 393 px (English), in the Today and All lists, an opened task, and the graphical view. Before: text at 8, 10 and 11 px in 10 to 16 places per view, and the Basic/Graphical toggle 28 px high. After: no text under 12 px, no control under 36 px, no sideways overflow, no clipped text. Changed files: `ScheduleSummaryBar` (label sizes; dates in the app language), `TaskStatisticsWidget` (label sizes; the under-40 % pill had light text on a light fill), `CropScheduleView` (toggle 40 px), `ModernTaskCard`, `ProductRecommendationCard`, `CropStageTimeline` (label sizes only). Sizes use `lf-fs-cap`, which sets the size and leaves each label's weight alone. No handler, query or task rule is touched.

Not done: the crop input step (`CropDateInput` and the intercrop pickers). In the test it drew only its header, because its crop list comes from the database, so its labels were left as they are.

**Seen, not changed (logic):**

1. `Schedule.tsx:102` sends weather for the phone's current location (`useWeather(deviceLocation)`) into schedule generation, not the weather of the land the schedule is for.
2. `CropScheduleView.tsx:515-516` recognises a harvest task by Hindi and Marathi words in the task name.
3. `ProductRecommendationCard`, `MultiIntercropSelector`, `IntercropSelector` and `WeatherScheduleAlerts` carry their own translation tables in code for five languages or fewer (about 130 lines); other languages get English.

## Safe-area space inside a preview frame (fix, 2026-11-28)

No data call is involved.

**Cause.** `env(safe-area-inset-*)` describes the top-level page. When the app is shown inside another page's frame (the Lovable editor preview on a phone), it still reports the outer page's notch and home-bar space, although the frame already sits inside the safe area. The app then left that space empty a second time: a blank band above the app bar and a gap under the dock. Measured in a frame with a 59 px top inset: `env(safe-area-inset-top)` read 59 px inside the frame.

**Fix.** All 36 reads of `env(safe-area-inset-*)` in 21 files now read four shared values, `--safe-top`, `--safe-bottom`, `--safe-left`, `--safe-right` (`src/index.css`). They equal `env()` when the app is the top-level page, so nothing changes on a phone, in the installed app or in a browser tab. `index.html` adds the class `in-frame` to `<html>` when the app is not the top-level page, and there the four values are 0.

Measured after, same 59 px inset:

| Case | App bar box | App bar contents | Dock bottom / screen height |
|---|---|---|---|
| Top-level page | 0–115 px | 69–105 px | 809 / 852 |
| Inside a frame | 0–56 px | 10–46 px | 693 / 702 |

## Satellite page (`src/pages/NDVIAnalysis.tsx`) and Soil report (`src/pages/SoilHealthReport.tsx`)

**Satellite page.** Same data: `landsApi.fetchLands()`, `useFieldSky(selectedLandId, reloadKey)`, the same eight cards with the same inputs, the same refresh. Changes:

- Opens on the land the farmer last chose anywhere in the app (`readChosenLand`), then on the first land with satellite data as before; a land picked here becomes the chosen land for the other pages. A land in the address (`/app/lands/:id/ndvi`) still wins.
- The chosen land's chip scrolls into view (it could sit off the right edge).
- The map and the season chart are fetched when their tab is first opened, so the map library (202 kB) and chart library (577 kB) no longer load with the page. The map still stays mounted after its first opening, so it is not billed again.
- The endless pulse on the satellite icon is removed; the three tabs are 40 px high (were 28 px).
- `ndvi.error.load_failed` and `ndvi.error.retry` were missing from the language files (English fallback for everyone); added in `en`, `hi`, `mr`.

**Soil report.** Only loading changed: `html2canvas` and `jsPDF` are fetched when the farmer taps download or share. The page's own script went from 619 kB to the size shown in the build. The report body could not be rendered in the test (it needs a signed-in session), so nothing in it was changed.

## Profile edit and Add land (checked and refined 2026-11-28)

**Profile edit (`src/pages/ProfileEdit.tsx`).** Rendered at 320 px (Marathi) and 393 px (English) with every section opened: no overflow, no text under 12 px, no control under 36 px. Nothing changed.

**Add land.** The map-drawing screen needs Google Maps and could not be rendered in the test; it is unchanged. The first-screen instructions and the confirm card were rendered and measured:

| | Before | After |
|---|---|---|
| Instruction dialog | read-aloud button 32 px, drawn under the close button; close button 16 px | read-aloud 44 px beside the close button, with a label; close target 40 px |
| Confirm card | 10 labels at 11 px; three text links 16-17 px high; a pulsing icon | no text under 12 px; links 40 px high; no pulse |
| Field placeholder | "Tap to set" in English in every language (`FieldChip.tsx`) | from the existing key `lands.smartConfirm.tapToSet` |

The close-button change is in the shared `src/components/ui/dialog.tsx`, so every dialog in the app gets the larger touch target; the icon does not move. No save, location or crop logic in the confirm card is touched.

**Seen, not changed (logic):** `SmartLandConfirmCard.tsx:172-174` reads the ownership type from the farmer's spoken words by matching English, Hindi and Marathi words in code.

## Analytics, Alerts and Crop growth (refined 2026-11-28)

Each page was rendered at 320 px (Marathi) with stub data and measured before and after. No query, hook, table or handler is changed on any of the three.

| Page | Before | After |
|---|---|---|
| Analytics (`Analytics.tsx`, `AnalyticsSections.tsx`, `LandSelectorRail.tsx`, `ForecastChart.tsx`) | 38 texts under 12 px; 4 range buttons 32 px high; header blur | no text under 12 px; range buttons 40 px; no blur |
| Alerts (`ProactiveAlerts.tsx`) | 15 labels under 12 px; history button 32 px; action row in one line | no text under 12 px; history button 40 px; action row wraps, Dismiss and Done stay together on the right |
| Crop growth (`CropGrowthTracking.tsx`) | tabs 32 px high | tabs 48 px high |

Advisory, Schemes, Reels, Notifications and Subscription were rendered with empty data in the same sweep and passed the same measurements; they are unchanged. They were not checked with real rows.

## Services near me (checked and refined 2026-11-28)

The five pages (`src/pages/services/`) were rendered at 320 px (Marathi) and 393 px (English) with test answers for the same database functions the pages call (`farm_services_nearby`, `farm_services_providers`, `nursery_store`, `farm_service_requests_mine`) and the catalogue tables. Filled and empty states were both measured: no overflow, no text under 12 px, no control under 36 px, no looping animation. These pages already use theme tokens and large controls, so the look is kept.

| | Before | After |
|---|---|---|
| Nursery store plant card | stock pill beside the photo, broken into three lines at 320 px | stock pill on its own row under the photo, one line |
| Status pill (`StatusBadge` in `ProviderUi.tsx`) | long text touched the pill edge when it wrapped | wraps with inner spacing; one-line pills unchanged |
| Sticky bottom action bar (`ProviderPage`) and sticky header (`PageShell`) | see-through with blur | solid background, no blur |
| Ask for work: starting land | always the first located land | the land the farmer last chose in the app when it is located, else the first located land (`readChosenLand`) |

No database function call, argument or store is changed. The request still sends the `land_id` the farmer sees selected.

**Seen, not changed (logic):** `AskForWork.tsx` hides lands that have no `center_lat` / `center_lon`, with no line telling the farmer why a land is missing from the choice.

## Community (refined 2026-11-28)

Rendered at 320 px (Marathi) and 393 px (English) inside a layout shaped like the app (fixed header, scrolling main, dock), with test rows for `social_posts`, `post_likes`, `post_saves`, `post_reactions`, `crop_groups`, `group_chats`, `group_chat_members`. All five tabs were opened, filled and empty. No query, mutation or hook is changed.

| | Before | After |
|---|---|---|
| Bottom of the page | the old bottom bar (`BottomNavigation`, 93 px, blurred) was drawn behind the dock | only the dock; `CommunityPage` no longer renders `BottomNavigation` (the component file is kept) |
| Tabs | 32 px high | 44 px high |
| Post action row | reaction counts and the comment button ran into each other at 320 px | row wraps; comment, listen, share and save stay together on the right |
| Small tap areas | Show original 16 px, hashtag chips 24 px, Refresh 32 px, reactions 28 px | 36 to 40 px |
| Text under 12 px | 5 | 0 |
| Words fixed in English | Anonymous Farmer, Unknown location, Just now, Hot, Listen, Share, Save, reaction names, "2 days ago" from date-fns | `social.groups.anonymous`, new keys `social.post.listen`, `social.trending.hot`, `social.reactions.*` (en/hi/mr); a missing location shows nothing; time comes from `src/lib/relativeTime.ts` (`Intl.RelativeTimeFormat` in the app language) |
| Blur and looping animation | blur on group cards, group search, trending cards; create-post button pulsed forever | none |

**Seen, not changed (logic or content):**
- `TrendingTopics.tsx` shows `MOCK_TRENDING`, six fixed topics with fixed counts written in Hindi in the code, with "posts", "farmers" and the category in English. It reads no table.
- `Advisory.tsx` shows three fixed texts from the language files with fixed times ("2 hours ago"). It reads no table.
- `Schemes.tsx` shows three fixed schemes from the language files. The "Apply now" button has no action.
- Community has its own header (back, language, search, bell) under the app header, so three bars (181 px) stay at the top while scrolling.

## Reels, Subscription, Notification settings, AI dashboard (2026-11-28)

Rendered inside a layout shaped like the app (fixed header, scrolling main, dock) at 320x568, 360x640 and 393x852 with a 47/34 px notch. Reels used a test answer for the `weather` function's `youtube_feed` action; Subscription used plan rows copied in shape from the live `subscription_plans` farmer rows (read-only query). No query, mutation or hook is changed.

| Page | Before | After |
|---|---|---|
| Reels (`ReelsPage.tsx`, `ReelActionRail.tsx`) | the page is a full-screen layer under the dock, so the caption's last lines and the Watch on YouTube button were behind the dock; on a 568 px high screen the six side buttons ran up into the top bar | caption ends above the dock (`--lf-dock-h` + bottom inset); side buttons sized from screen height (44 to 56 px) so all six fit; Watch button 40 px; no text under 12 px |
| Subscription (`SubscriptionPage.tsx`) | a plan with no limit showed the word "unlimited", a plan with no value showed an empty box | ∞ (the sign the usage meter already uses) and — |
| Notification settings | passes | unchanged |

**Seen, not changed (logic or data):**
- Subscription: live plan rows carry feature codes that have no name in the language files (`ecommerce`, `basic_analytics`, `inventory_management`, `payment_gateway`, `iot_integration`, `webhook_support`); they show as raw English. Live limits also carry `max_dealers`, `max_farmers`, `max_products`, `max_storage_gb`, `max_api_calls_per_day`.
- Subscription: the soil-report meter reads `limits.soil_reports_per_month`; the live Shakti and AI PRO rows have no such key, so the meter shows "/ 0" in red. `subscription_usage_logs` had no rows at the time of the check.
- Subscription: every plan that is not the current one says "Upgrade to", including cheaper plans and Free. Payment status and currency are shown as stored (English).
- Notification settings: `notificationService.initialize()` waits on `navigator.serviceWorker.ready`, which never answers when no service worker is registered; the page then stays on "Loading".
- Reels: side-button names for screen readers are English words in code (`ariaLabel="Like"` etc.). `reels.watch_on_channel` is read with an English fallback.
- `AIScheduleDashboard.tsx` (`/app/ai-dashboard`) is English only, names an AI model and has a "Marketing Insights" tab. No link to it was found in the app. Same for `/app/videos/legacy`.

## Two-way ratings (approved as a design 2026-11-28, backend drafted, nothing applied)

Design boards 14 to 20 on the proposal canvas. Decisions approved: blind period 7 days, "New" below 3 ratings, picture words instead of typed text.

Live state read on 2026-11-28: `service_requests` has `farmer_rating` and `rated_at` only; 2 requests, 0 done, 0 rated; `farm_services_policy` has no rating keys; no `service_rating_tags` table. The customer workspace has no tables, so customer and produce ratings are not drafted.

Draft: `docs/living-farm/drafts/20261128150000_service_two_way_ratings.sql`. It adds the provider's stars for the farmer, picture words on both sides, the blind rule and the "New" rule for the service side. It replaces four live functions with bodies taken from the live database the same day (`farm_service_refresh_provider_stats`, `farm_service_requests_mine`, `farm_service_request_rate`, `provider_request_card`) and removes nothing. It has not been run.
