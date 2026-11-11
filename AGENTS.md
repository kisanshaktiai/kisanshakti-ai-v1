# Project AGENTS.md — standing technical rules

## Edge-function type checking
- The preview build runs `deno check` across the whole ai-agriculture-chat function graph. The graph must stay at ZERO type errors (`deno check index.ts` from `supabase/functions/ai-agriculture-chat` exits 0). Why: a single bad type import in one file cascades hundreds of TS2339/never errors and fails the platform build, even though deploys ignore type errors.
- When extending type contracts for DB/JSONB-populated values, add optional fields to the interface in the shared type file rather than scattering casts.

## Location names
- DB stores canonical English names + UUID FKs for state/district/taluka/village (trigger normalize_location_text_columns replaces UUIDs); UI localises only via src/lib/locationI18n.ts / useLocalizedPlace. Why: integrations need ASCII names; 6 lakh villages x 12 languages is too large to store.

## Land imagery
- My Land cards render the saved parcel boundary/center as a satellite map and must never consume `lands.ndvi_thumbnail_url`; NDVI imagery is reserved for analysis views. Why: vegetation-index rasters are analytical evidence, not parcel-identification thumbnails.

## Shared crop camera
- Active crop-photo entry points use CropPhotoCapture and cropPhotoService, not legacy WebRTC or direct-storage uploaders; why: consistent capture, private signed uploads, and land-bound evidence.
- Photo queue work and policy caches are scoped to the active verified farmer/tenant session, with identity rechecked across asynchronous boundaries; why: logout or tenant switches must not consume another identity's media.

## Market prices
- Market cards and local controls use the Button surface/quiet/filter variants rather than accent-filled ghost states; why: tenant accent colors must not flood data cards or reduce price readability on hover.
- Market coordinates are resolved at runtime from DB location tables (villages → taluka/district centroids) by `market-price-intelligence/marketGeo.ts`; never hand-code market coordinates or corridor lists. "Major markets" are derived from data volume. Why: keeps the market feed region-agnostic and DB-driven.
- Market scope uses verified source commodity codes, not translated names, units, or category prefixes; all market consumers pass the same scope. Why: the source mixes animals and produce in Other, and even dairy shares the animal-code prefix.
- Market catalogs page through source rows and ranked feeds expose offset/total/hasMore; the UI uses complete selectors and incremental result loading. Why: neither the PostgREST cap nor visual truncation may hide available items.
- Market source reads use primary-key cursor paging and share a short-lived public catalog with an in-flight lock; never cache farmer records there. Why: repeated deep OFFSET scans overload the database while selectors need the same reference rows.
- Transient database read retries are bounded and rebuild the query; never apply them to writes. Why: recover intermittent timeouts without duplicating mutations.

## Schedule review isolation
- Evidence-incomplete plans persist only in the server-only review-draft ledger, never crop_schedules or schedule_tasks; why: drafts must not mutate land state or enter executable schedule workflows.
- Repeated-picking stages retain separate DB-backed phases; never truncate them at first maturity or merge them into one harvest task, because maturity does not certify the last picking date.
