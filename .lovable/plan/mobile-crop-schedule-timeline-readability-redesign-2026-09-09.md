# Mobile crop-schedule timeline readability redesign

## Goal
Rebuild the schedule timeline as a high-contrast, field-ready mobile view that uses the full phone width, keeps long Marathi/Hindi instructions readable in sunlight, and inherits every visual color from the active tenant theme.

## Verified audit findings
- The screenshot shows pale body copy inside a lightly tinted task panel, a narrow content column, excess nested spacing, and the completion area competing with the fixed bottom navigation.
- `FarmerTaskTimeline` renders key instructions, quantities, dates, collapsed previews, and technical details with `text-muted-foreground`; this makes essential farmer instructions visually secondary.
- Timeline cards use translucent `/5`, `/20`, and `/70` surfaces, gradients, pulsing indicators, shadows, and fixed white icon text. This conflicts with the project’s opaque mobile-performance rule and weakens contrast under bright outdoor conditions.
- The week/month/all views use `FarmerTaskTimeline`, while today uses the visually different `ModernTaskCard`; the same task therefore changes hierarchy and interaction depending on the selected tab.
- `CropScheduleView` adds horizontal padding around the timeline and several summary/card layers before it, reducing usable width and duplicating information.
- The tenant system already supplies semantic background, surface, foreground, border, primary, warning, success, destructive, and info roles. It also computes readable foregrounds for status colors, so the redesign does not need hardcoded colors.
- The presentation layer already exposes farmer-safe `what`, ordered `how`, `howMuch`, technical details, and translation state; this redesign can remain presentation-only with no agronomic logic changes.

## Selected direction
Use the chosen **Industrial Field Utility** composition: bold high-contrast structure, strong status bands, a clear timeline rail, and large field-safe controls. “Black” and “safety yellow” are visual roles, not literal fixed colors: dark/high-contrast text comes from tenant foreground tokens, and warning emphasis comes from the tenant warning token.

## Implementation

### 1. Establish tenant-owned high-contrast roles
- Add reusable semantic roles for the schedule rail, active task surface, instruction surface, and strong text by deriving them from the existing tenant background/card/foreground/border/status variables.
- Use opaque token surfaces only; remove blur, glass overlays, fixed white/black text, hardcoded palette classes, and decorative task gradients from this flow.
- Ensure warning, success, destructive, primary, and neutral treatments always pair with their semantic foreground token and retain text/icon labels so color is never the only signal.

### 2. Recompose the mobile timeline
- Make the schedule stream nearly edge-to-edge with a compact page gutter and safe bottom clearance.
- Replace the decorative title treatment with a sturdy tenant-foreground heading, task count, and compact current stage/day context using existing schedule/stage data only.
- Use a continuous high-contrast rail with explicit completed, current, overdue, and upcoming markers; remove pulse effects and reduce motion when requested by the device.
- Group tasks chronologically while minimizing date-header height and repeated chrome.

### 3. Redesign each task for field scanning
- Use one shared farmer-first card hierarchy across today/week/month/all views: status/date → task name → quantity → numbered instructions → safety → actions.
- Keep essential text at readable body size and strong contrast; reserve muted text only for genuinely secondary metadata.
- Show the first useful instruction in the collapsed state without pale text. Expanded state shows all stored steps as large numbered rows, verified quantities as prominent data blocks, precautions as a labeled warning band, and technical evidence collapsed by default.
- Keep Listen and Photo as 44px minimum icon actions with accessible labels; make the completion action full-width, clearly named, and separated from bottom navigation.
- Preserve existing farmer-language and no-invention safeguards; missing data remains explicitly unavailable rather than fabricated.

### 4. Unify duplicate task presentations
- Make `ModernTaskCard` and `FarmerTaskTimeline` consume the same visual task-body building blocks so tab changes do not alter meaning, readability, or available instructions.
- Remove the extra clickable wrapper around the today card and prevent nested actions from opening competing dialogs.
- Keep editing, video help, speech, photo, and completion behavior intact while simplifying their placement.

### 5. Verify production readiness
- Check Marathi, Hindi, and English with long task names and multi-step content at narrow phone widths.
- Validate contrast, text wrapping, 44px tap targets, keyboard/screen-reader names, reduced motion, no overlap with bottom navigation, and no horizontal clipping.
- Test light, dark, bright, and low-saturation tenant themes to confirm the interface inherits tenant colors without fixed palette leakage.
- Run focused schedule presentation tests, type checks, the hardcoded-color/theme guard, and a Playwright mobile visual pass of collapsed and expanded tasks.

## Scope guardrail
This changes only schedule timeline/card presentation and shared semantic styling. It will not change schedule generation, stage resolution, database rules, dosage calculations, translations, or any agronomic decision logic.
