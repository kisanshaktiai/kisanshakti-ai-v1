# Project AGENTS.md — standing technical rules

## Edge-function type checking
- The preview build runs `deno check` across the whole ai-agriculture-chat function graph. The graph must stay at ZERO type errors (`deno check index.ts` from `supabase/functions/ai-agriculture-chat` exits 0). Why: a single bad type import in one file cascades hundreds of TS2339/never errors and fails the platform build, even though deploys ignore type errors.
- When extending type contracts for DB/JSONB-populated values, add optional fields to the interface in the shared type file rather than scattering casts.

## Location names
- DB stores canonical English names + UUID FKs for state/district/taluka/village (trigger normalize_location_text_columns replaces UUIDs); UI localises only via src/lib/locationI18n.ts / useLocalizedPlace. Why: integrations need ASCII names; 6 lakh villages x 12 languages is too large to store.
