# Analytics Forensic Audit and Surgical Repair

## Confirmed findings
- The charts reference CSS variables as literal `hsl(var(...))` strings inside canvas drawing. Tenant colors can change after mount, but Chart.js does not reliably resolve or redraw them, causing black or stale chart colors.
- Revenue, profit, yield, water need, cost breakdown, nutrient bands, pH limits, and recommendation thresholds currently include frontend agronomic constants. This violates the database-as-source-of-truth rule.
- The database already contains authoritative crop schedules, crop water requirements, crop baseline guidelines, market prices, and economics tables, but the analytics hook does not load them.
- The selected period currently filters tasks, finance, and NDVI, but weather, soil, and market have separate fixed recency rules. Query failures are silently converted to empty data, making “no data” indistinguishable from “could not load.”
- Task totals can include cancelled or historical schedules because tasks are fetched by farmer and mapped from every referenced schedule instead of the land’s active schedule.
- Forecast generation is intentionally paused and the farmer currently has no forecast rows. The Generate button therefore promises an action that always returns a conflict.
- Mobile labels and icon controls are smaller than appropriate for outdoor, one-handed use. The disclaimer component also triggers a React ref warning because it cannot receive a ref.

## Implementation
1. **Make the database authoritative**
   - Extend the analytics data query to load each land’s active schedule economics, crop-stage water requirement, crop baseline nutrient/pH values, canonical market mapping, and available yield/economics records.
   - Remove frontend crop-name maps and agronomic thresholds from analytics calculations.
   - Return unavailable values as unavailable instead of inventing defaults.
   - Keep only universal unit conversions and display formatting in code.

2. **Correct data scope and failure states**
   - Count tasks only from each land’s active schedule and selected date range.
   - Use exact canonical crop matching for market prices rather than English substring matching.
   - Preserve partial analytics when one table fails, but expose the failed sections so the page shows an honest unavailable state.
   - Include the verified session identity in analytics cache keys to prevent stale cross-session empty results.

3. **Fix tenant theme wiring**
   - Resolve `--chart-1` through `--chart-5`, foreground, border, card, primary, and destructive tokens to computed colors before passing them to Chart.js.
   - Recompute chart colors when the tenant theme changes so graphs never fall back to black or retain an old tenant palette.
   - Use chart tokens for separate datasets rather than shades hardcoded from one primary color.

4. **Improve farmer usability without redesigning the page**
   - Increase essential labels and touch targets for sunlight and one-handed use.
   - Replace the non-working forecast Generate action with an honest unavailable state while generation remains server-paused.
   - Make `DisclaimerCard` ref-safe to remove the analytics runtime warning.
   - Keep the current page structure and translations.

5. **Verification**
   - Add focused tests proving no analytics agronomic constants remain, active-schedule task scoping is enforced, missing DB values do not create projections, and chart colors resolve from tenant tokens.
   - Run targeted tests, TypeScript checks, hardcoded-color/theme guards, and browser checks on the current farmer’s all-farm and Shinghan Mal views.
   - Re-query the live tables to compare displayed values with their source rows. No forecast generator or schedule-generation code will be changed.

## Technical scope
Frontend analytics hooks, calculation helpers, analytics cards/charts, and focused tests. A database migration will be used only if an essential canonical mapping or access policy is demonstrably missing; existing tables are preferred.
