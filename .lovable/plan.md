# Compact weather-card update

## Goal
Make the home weather card easier for rural farmers to scan without redesigning its structure or changing weather calculations, while showing only authenticated provider alert levels.

## Changes
- Increase the card typography from its current size and use stronger font weights so key weather information is easier to read on narrow mobile screens.
- Keep every updated color tied to the existing tenant theme tokens; no fixed colors will be introduced.
- Preserve the compact rain badge as `38% / 6h` (localized as `38% / 6 hours` or its language equivalent).
- Add a short, prominent sentence below the location/update row: “Today rain probability is {{value}}% in the next {{hours}} hours.”
- Show the sentence whenever forecast data is available, including a real 0% probability, rather than hiding it.
- Add matching English, Hindi, and Marathi translation keys using natural farmer-friendly wording.
- Continue deriving the percentage from the maximum hourly rain probability across the next six forecast hours; no hardcoded weather value.
- Color the rain-probability line only from an active authenticated weather-service alert linked to the farmer’s location: green, yellow, orange, red, or purple/magenta according to the provider alert level. Light blue is reserved for provider-classified very light rain, drizzle, or snow.
- Do not infer an official alert color from the rain percentage. If no current authenticated alert exists, use the normal theme information color and do not present an invented warning level.

## Confirmed current state
- The home card’s six-hour percentage already comes from live hourly forecast probability, with the daily forecast as fallback.
- `weather_alerts` has fields for provider source, severity, IMD color code, warning codes, validity, and location, but currently contains zero rows.
- The IMD provider includes a district-warning reader and verified IMD color mapping, but it is not currently called by the weather function; therefore the card cannot truthfully display an official alert color yet.

## Technical details
- Update the inline home weather card in `src/pages/Home.tsx` and the shared weather response/store types needed to carry alert provenance.
- Wire the existing IMD district-warning reader into the authenticated weather flow, persist current warnings to `weather_alerts`, and return only a current location-matched alert to the card. Preserve existing provider fallback behavior for forecast data.
- Map the provider’s own color/severity value to semantic theme variants; never calculate warning severity from locally invented percentage thresholds.
- Add the new interpolation key to the three existing weather locale files.
- Reuse semantic roles such as `primary`, `foreground`, `muted-foreground`, and `info`.
- Keep the existing click, expand/collapse, refresh, and weather-fetch behavior unchanged.
- Do not add a schema migration; the required authenticated alert columns already exist.

## Verification
- Run the app type check and theme-token guard.
- Add or run a focused weather contract test confirming provider color passthrough, location/time filtering, and neutral fallback when no alert exists.
- Verify the card at the current narrow mobile viewport in English, Hindi, and Marathi.
- Confirm long translated text wraps cleanly without overlapping temperature, controls, or forecast metrics.
