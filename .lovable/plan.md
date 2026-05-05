
# Community Feature — Forensic Audit & 2030-Ready Modernization Plan

## 1. Audit Findings

### A. Architecture & Data Layer (`useCommunityPosts.ts`, Supabase)

**Bugs / Risks**
- **Race-condition counters**: `useLikePost` does manual `select → update` for `likes_count`. Two concurrent likes will lose increments. Same risk in any reaction counter path.
- **Stale closure bug in `handleLike` / `handleSave` (PostCard)**: `setIsLiked(newIsLiked)` then `mutate({ isLiked })` passes the OLD state. The mutation receives `isLiked` not `newIsLiked`, so the toggle direction is inverted on rapid taps after first render.
- **Duplicate realtime channel**: `useCommunityPosts` opens its own `community-posts-${tenant.id}` channel while a global singleton already runs in `AppLayout` (per memory `proactive-alerts-realtime-singleton-contract`). Violates the "singleton subscription" core rule → channel conflicts.
- **No pagination**: Hard `limit(50)` with no infinite scroll. Will not scale to 1M users.
- **N+1 image storage**: `media_urls` stores raw base64 data URLs (QuickPostCreator passes the FileReader result straight into the post). Bloats DB rows, breaks CDN caching, kills bandwidth on 2G/3G.
- **No comments table query / no actual comments UI** — `MessageCircle` shows count only.
- **`saved-posts-full` does two round-trips** instead of a single join.
- **Translation cached only in memory** (`useTranslateText`); same post re-translated for every viewer.
- **TTS cost**: regenerated per user per play, no audio cache key.
- **Backdrop-blur everywhere** (`backdrop-blur-xl`) — violates project core rule "opaque backgrounds for FPS on mobile".

**Schema gaps to verify**
- Missing `post_comments`, `post_reports`, `post_translations` (cache), `post_media` (separate from row), `community_groups_members`.
- No moderation flags (`is_flagged`, `moderation_status`, `ai_safety_score`).

### B. UI / UX Friction for Rural Farmers

| Issue | Impact |
|---|---|
| Two stacked headers + language pill + tabs = ~180px wasted before first post on a 390×844 screen | Cognitive overload, low content density |
| 5 tabs (Feed/Groups/Trending/Saved/My Posts) with English labels in `social.json` defaults | Low-literacy users can't map tabs to function |
| Voice button is press-and-hold on touch — works on Android but unreliable on iOS Safari (no `onTouchEnd` if finger moves out) | Voice fails silently — the #1 input mode for the target user |
| `QuickPostCreator` shows a textarea by default — pushes typing as primary action | Conflicts with voice-first mandate |
| Reactions (🙏🌾💚) + Like + Comment + Share + Save + TTS = **7 tap targets** in one row | Decision paralysis; thumbs hit wrong target |
| Swipe-to-save / swipe-to-translate is undiscoverable; no onboarding hint | Feature dead on arrival |
| `authorAvatar: '👨‍🌾'` hardcoded for every farmer | No personalization, no trust signal |
| English-only timestamps (`formatDistanceToNow` w/ no locale) | "5 minutes ago" never shown in Marathi |
| No empty-state CTA pointing to voice button | Cold-start farmers see "🌱 No posts yet" and bounce |
| `displayContent` falls back to original silently if translation fails | Marathi farmer sees Hindi/Punjabi posts with no warning |
| No image lightbox, no pinch-zoom — farmers can't inspect a disease photo | Kills the most useful use case |
| FAB + QuickPostCreator both create posts — duplicate entry points | Confusion |

### C. AI Integration — Currently Almost None
- Only translation (generic) and TTS exist.
- No use of the project's **Symbolic Decision Brain** for community posts.
- No auto-tagging of crop/disease from photo, no smart-reply, no moderation, no duplicate-question detection, no expert-routing.

---

## 2. Redesign — 2030-Ready, Voice-First, Rural-Indian

### Information architecture (collapse 5 tabs → 3)
```
[ Feed ]   [ Ask AI ]   [ Groups ]
   ↑           ↑            ↑
default   new — routes   merges Trending+
          to symbolic    Saved+MyPosts
          brain          into profile sheet
```
- Saved + My Posts move into a **profile sheet** opened from header avatar.
- Trending becomes a **horizontal chip strip above the feed**, not a full tab.

### Post Card v2 (one card = one decision)
- **Big photo first** (4:3, full-bleed, tap to lightbox + pinch-zoom).
- **Single primary action**: 🙏 *Helped me* (one merged reaction). Long-press reveals 🌾/💚.
- **Voice play** = persistent floating speaker on the card edge, auto-detect language.
- **Translate badge** is opt-out, not opt-in (auto-translated by default to farmer's app language; "show original" link).
- **Author row**: real photo when available, district + crop badge ("🌾 Sugarcane, Pune"), trust score.
- **Comments collapsed to count + voice-comment quick reply**.

### Quick Post v2 — Voice-first, image-first
- Default state shows **two huge buttons**: 🎤 *Speak* (60% width) and 📷 *Photo* (40%). No textarea visible.
- Tapping speak opens a **full-screen voice sheet** with waveform, language auto-detect, live transcript, edit-after-stop. Avoids press-and-hold reliability issues.
- Photo flow: select → AI auto-tags crop, suggests caption + hashtags via Lovable AI (`google/gemini-3-flash-preview`) → farmer confirms.

### AI features (via edge functions only, Lovable AI Gateway)
1. **`community-ai-enrich`** — on post insert trigger:
   - Caption suggestion from photo
   - Crop + likely disease detection (feeds Symbolic Decision Brain)
   - Auto-hashtags + auto-translation into 8 supported languages, cached in `post_translations`
   - Safety/moderation score (block hate, spam, misinformation)
2. **`community-smart-reply`** — context-aware suggested replies in farmer's language ("Try neem oil 2ml/L", "I had same issue last kharif").
3. **`community-ask-ai` tab** — routes question into existing Symbolic Decision Brain; the AI's answer is posted as a community post authored by "KisanShakti AI" so other farmers benefit (semantic deduplication of FAQs).
4. **Duplicate question detection** at post time: "3 farmers asked this — see answers" → redirects, reduces noise.
5. **Expert routing**: posts with low AI confidence get flagged for human agronomist queue.

### Mobile-first rules applied
- Opaque card backgrounds (no `backdrop-blur-xl`) per project core rule.
- All tap targets ≥ 48×48, thumb zone bottom-third.
- Skeleton loaders, optimistic UI for like/save/reaction.
- `react-window` virtualized feed with cursor pagination (`created_at` keyset).
- All copy via i18n; date-fns locale per `currentLanguage`.

---

## 3. Implementation Plan (phased, non-breaking)

### Phase 1 — Stability & Correctness (no UI change)
1. Fix `handleLike` / `handleSave` stale-state bug (pass `newIsLiked`/`newIsSaved`).
2. Replace manual counter updates with **Postgres RPC `toggle_post_like(post_id)`** that uses `INSERT … ON CONFLICT DO NOTHING` + atomic `UPDATE … SET likes_count = likes_count ± 1`. Same for saves & reactions.
3. Remove the per-component realtime channel from `useCommunityPosts`; subscribe through the existing global singleton in `AppLayout`, dispatch `queryClient.invalidateQueries` from one place.
4. Add cursor pagination (`useInfiniteQuery`, keyset on `created_at,id`).
5. Move base64 images to **Supabase Storage bucket `community-media`** (public read, RLS write); store only the public URL in `media_urls`.
6. Strip `backdrop-blur-*` from PostCard, QuickPostCreator, CommunityHeader, LanguageSelector pill.

### Phase 2 — Schema additions (migrations)
- `post_translations(post_id, language_code, content, generated_at)` — unique (post_id, language_code).
- `post_comments(id, post_id, farmer_id, tenant_id, content, language_code, parent_id, created_at)` + RLS.
- `post_reports(id, post_id, farmer_id, reason, created_at)`.
- Add columns to `social_posts`: `ai_crop text, ai_disease text, ai_safety_score numeric, ai_confidence numeric, moderation_status text default 'approved', primary_media_url text`.
- RPCs: `toggle_post_like`, `toggle_post_save`, `toggle_post_reaction`, `feed_cursor(p_tenant, p_after timestamptz, p_limit int)`.

### Phase 3 — Voice-first Quick Post v2
- Replace press-and-hold with **full-screen voice sheet** (tap to start, tap to stop, abort button).
- Two-button default state (Speak / Photo); textarea only after voice transcript or on explicit "Type" toggle.
- Wire transcript → optimistic post → background AI enrichment.

### Phase 4 — Post Card v2
- Photo-first layout, lightbox with pinch-zoom, single primary reaction with long-press menu.
- Auto-translate-by-default with per-user preference stored in `farmer_preferences`.
- Inline comments thread (lazy-loaded), voice-comment quick reply.

### Phase 5 — AI edge functions (Lovable AI Gateway)
- `supabase/functions/community-ai-enrich/index.ts` — triggered by DB webhook on `social_posts` insert. Uses `google/gemini-3-flash-preview` for text + `google/gemini-2.5-flash-image` analysis tools. Writes back enrichment columns + populates `post_translations` for the 8 supported languages.
- `supabase/functions/community-smart-reply/index.ts` — on demand from comment composer.
- `supabase/functions/community-ask-ai/index.ts` — bridges to existing Symbolic Decision Brain; persists AI answer as a community post.
- All three: CORS, JWT validation, 429/402 surfaced to client toasts, no client-side prompts.

### Phase 6 — IA collapse & navigation
- Tabs: Feed / Ask AI / Groups. Trending → chip strip. Saved + My Posts → profile sheet from header avatar.
- One creation entry-point: keep FAB only; remove duplicate inline composer on Feed tab (move composer into FAB sheet).

### Phase 7 — Polish & growth
- Localized timestamps (date-fns `hi`, `mr`, `pa`, `ta`, `te`, `bn`, `gu`, `kn`).
- Skeleton loaders, virtualized list.
- Onboarding coach-marks for swipe and voice (one-time, dismissible).
- Trust badges (verified expert, top contributor) with localized labels.

---

## 4. Backwards-compatibility guarantees
- Existing `social_posts`, `post_likes`, `post_saves`, `post_reactions`, `farmers` schema preserved — only **additive** columns/tables.
- Existing hooks keep their signatures; internal implementation swapped.
- Symbolic Decision Brain untouched; community AI edge functions are new and isolated.
- Multi-tenant RLS preserved on every new table (`tenant_id` + `has_role` patterns).

---

## 5. Out of scope (call out before building)
- Real-time chat/messaging inside Community (separate feature).
- Marketplace integration in posts.
- Video posts (planned for later phase).

If you approve this plan, I will start with **Phase 1 (stability) + Phase 2 (schema migrations)** in the next message — these are non-breaking and unlock everything else.
