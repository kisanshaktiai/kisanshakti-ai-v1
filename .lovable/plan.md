# Risk-coloured alert cards (green → red)

Make each alert card on the alerts screen visually carry its risk level: calm green when things are fine, amber when attention is needed, orange/red when the field is at serious risk. Today every card is the same neutral white with only a thin coloured strip on the left, so a farmer cannot tell danger from routine at a glance.

## What the colour will be based on

Checked the live alert data: each alert already stores a priority (LOW / MEDIUM / HIGH / CRITICAL) and a risk score from 0 to 100. Crop-health (NDVI) readings are **not** stored on the recent alerts — the satellite value only appears inside the evidence details when the rule that created the alert supplied it, and none of the last 25 alerts had it.

So the colour ladder will be driven by:

1. Risk score (0-100) when present — the finest-grained signal.
2. Priority as the fallback and as a floor (a CRITICAL alert never renders green).
3. Crop-health (NDVI) value when the alert carries one — a low NDVI pushes the band upward, since a weak crop makes the same risk more serious.

Bands: safe/low (green) → moderate (blue/neutral) → attention (amber) → high (orange) → critical (red).

## What changes on screen

- Card background becomes a soft tint of its risk colour instead of plain white, with a matching border and a thicker left rail.
- Icon bubble, priority chip and the left rail all use the same risk colour, so one card reads as one signal.
- Critical cards get the strongest tint plus the existing ring, and stay readable — text keeps full contrast, tints stay light enough behind Marathi/Hindi text.
- Handled (done/dismissed) alerts drop back to the muted neutral look so live risk stands out.
- A small risk read-out (e.g. "risk 86") sits next to the priority chip so the colour has a number behind it.
- The top summary bar and the land chips reuse the same ladder, so counts and cards agree.

## Technical notes

- File: `src/pages/ProactiveAlerts.tsx`. Pure presentation change; no alert generation, ranking or agronomic logic is touched.
- Add a `riskBand(alert)` helper returning one of `low | moderate | attention | high | critical`, computed from `alert.risk_score`, `alert.priority`, and `trigger_data.ndvi` when present.
- Map bands to existing semantic tokens only (`success`, `primary`/`info`, `warning`, `destructive`) at fixed opacities — no hex values, no raw Tailwind palette colours, so tenant theming keeps working.
- Replace the current `CATEGORY_TOKEN` tone usage for card surface/rail/badge with the risk band; category keeps deciding only the icon glyph.
- Reuse the band map in `ReportSummary` and `LandCard` instead of their separate priority maps.
- Verify with a mobile Playwright pass on `/app/proactive-alerts` that tints are opaque enough for text contrast and that critical/low cards are clearly distinguishable.
