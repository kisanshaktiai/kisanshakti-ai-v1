# Compact weather-card update

## Goal
Make the home weather card easier for rural farmers to scan without redesigning its structure or changing weather calculations.

## Changes
- Refine the card typography with slightly smaller, bolder labels and values so the information remains clear on narrow mobile screens.
- Keep every updated color tied to the existing tenant theme tokens; no fixed colors will be introduced.
- Preserve the compact rain badge as `38% / 6h` (localized as `38% / 6 hours` or its language equivalent).
- Add a short, prominent sentence below the location/update row: “Today rain probability is {{value}}% in the next {{hours}} hours.”
- Show the sentence whenever forecast data is available, including a real 0% probability, rather than hiding it.
- Add matching English, Hindi, and Marathi translation keys using natural farmer-friendly wording.
- Continue deriving the percentage from the maximum hourly rain probability across the next six forecast hours; no hardcoded weather value.

## Technical details
- Update the inline home weather card in `src/pages/Home.tsx`.
- Add the new interpolation key to the three existing weather locale files.
- Reuse semantic roles such as `primary`, `foreground`, `muted-foreground`, and `info`.
- Keep the existing click, expand/collapse, refresh, and weather-fetch behavior unchanged.

## Verification
- Run the app type check and theme-token guard.
- Verify the card at the current narrow mobile viewport in English, Hindi, and Marathi.
- Confirm long translated text wraps cleanly without overlapping temperature, controls, or forecast metrics.
