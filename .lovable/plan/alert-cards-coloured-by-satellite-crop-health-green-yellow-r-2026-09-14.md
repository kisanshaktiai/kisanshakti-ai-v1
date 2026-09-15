# Alert cards coloured by satellite crop health (green → yellow → red)

Every alert card on the alerts page will take its colour from the field's latest satellite crop-health reading (NDVI), sliding smoothly across a green → yellow → red scale, exactly like a colour slider. Healthy field = green card, struggling field = red card.

## What I checked

- The alerts themselves do not store an NDVI number (of 616 recent alerts, none carry one; some text mentions "NDVI --").
- Satellite readings do exist per field in the NDVI table: 2,792 rows across 40 fields, newest dated 13 Sep 2026.
- So the colour has to come from the field's latest satellite reading, matched to the alert's field.
- Today cards are all the same neutral white; only the small icon and a thin left strip differ by category/priority.

## The colour scale

Continuous, not stepped:

```text
NDVI  0.20        0.35        0.50        0.65+
      red  →  orange  →  yellow  →  light green  →  green
      (weak crop)                        (healthy crop)
```

- Below 0.20 stays full red, 0.65 and above stays full green; in between the colour blends smoothly, so a 0.42 field sits visibly between yellow and orange.
- The whole card is tinted: background wash, border, left rail, icon bubble and the small health chip all share the same colour, so one card reads as one signal.
- Text stays fully readable — tints stay light behind Marathi/Hindi text, and headline text keeps the strong foreground colour used on the crop-schedule cards.
- The inner solution panel inside an expanded alert follows the same colour as its card.
- Each card shows the reading it used, e.g. "NDVI 0.42 · 13 Sep", so the colour always has a number behind it.

## When there is no reading

- Field has no satellite reading, or the newest one is older than 21 days, or it was too cloudy to trust: the card keeps today's neutral look and shows "satellite reading not available" instead of a false green.
- Handled (done/dismissed) alerts stay muted regardless of colour.
- The top summary bar and the field chips reuse the same scale so counts and cards agree.

## Technical notes

- Files: `src/pages/ProactiveAlerts.tsx`, `src/components/proactive/AlertEvidenceSection.tsx`, plus a small new hook `src/hooks/useLandNdvi.ts`.
- Hook fetches the latest `ndvi_data` row per `land_id` for the lands present in the loaded alerts (single query, newest-per-land, filtered on acceptable cloud cover / quality, cached by React Query). Read-only; no alert generation or agronomic logic changes.
- New helper `ndviColor(ndvi)` returns CSS `color-mix(in oklab, hsl(var(--destructive)) x%, hsl(var(--warning)) …)` blends between the existing `--destructive`, `--warning` and `--success` tenant tokens — continuous gradient with zero hex values, so tenant theming and the theme-token guard still hold.
- Card surface uses a low-alpha blend of the same colour; rail/badge use the full-strength blend. Foreground stays `text-foreground` / `text-muted-foreground`.
- `AlertEvidenceSection` keeps its existing risk-band prop shape but receives the NDVI-derived tone from the parent.
- Verify with a mobile-viewport Playwright pass on the alerts page: colours differ across fields, text contrast holds, and cards without readings render neutral.
