
# Community Page – 2030 Mobile-First Rebuild (Rural India focus)

The audit findings are accurate. This plan turns them into a single coherent pass that is opinionated about the constraint that matters most: **rural farmers on 360–390 px Android phones, low RAM, choppy 3G, sun-glare screens, often illiterate or low-literacy, used to WhatsApp**. Every decision below trades chrome for content.

---

## A. Reclaim the screen (highest impact)

Right now ~210 px of vertical space is locked by 3 stacked sticky bars + a blurred background — on a 390×688 viewport that's **31% of the screen gone before any post**.

Target: **one sticky bar, ≤ 96 px total**.

```text
BEFORE                              AFTER
┌────────────────────────┐ 68 px   ┌────────────────────────┐
│ Header (blur)          │         │ Compact Header (opaque)│ 56 px
├────────────────────────┤ 48 px   │  ←  Community  🌐हि 🔔 │
│ Language pill (blur)   │         ├────────────────────────┤
├────────────────────────┤ 56 px   │ Tab pills (always-text)│ 40 px
│ Tabs (icon only)       │         └────────────────────────┘
└────────────────────────┘
        = 172 px                            = 96 px  (–76 px / +11% feed)
```

Concrete changes:
- **Merge LanguageSelector into the header** as a small `🌐 हिं ▾` pill next to the bell. Remove the entire second sticky strip.
- **Header height**: 56 px (one row), drop subtitle ("12,450 farmers"). Move it into the empty state.
- **Remove `backdrop-blur-2xl` everywhere** (header, tabs, cards, QuickPost). Replace with solid `bg-background` / `bg-card` per project core rule. Major FPS win on Redmi/Realme entry phones.
- **Tabs**: switch `hidden sm:inline` → **always show label**, but only the active tab's label; inactive tabs are icon-only. Keeps text discoverable for low-literacy users while staying compact at 360 px.

```text
[🏠 Feed]  [👥]  [📈]  [🔖]  [👤]      ← active = icon + word
```

---

## B. Touch & gesture safety

Rural users hold phones one-handed in fields, often with gloves or wet fingers.

- **Remove horizontal `drag="x"` on PostCard** (lines 174–178). It hijacks the browser's vertical-scroll heuristics and prevents the system back-swipe on Android. Replace with explicit, tappable affordances already in the action bar (Save, Translate-toggle button is already present). No swipe = no accidental save.
- **QuickPostCreator voice button**: switch from hold-to-record to **tap-to-start / tap-to-stop** with a visible 60 s ring timer. Hold-to-record is unreliable on touch (the existing `onMouseLeave` hack never fires) and causes hung recordings + locked mic permissions. Tap-toggle is the WhatsApp pattern farmers already know after the lock-slide gesture; we'll skip the slide and just toggle.
- All buttons stay ≥ 44 × 44 px (already true).

---

## C. Trust & safety in actions

- **Report flow**: replace one-tap report with a small bottom sheet asking the reason (Spam / Wrong info / Abuse / Other) + Cancel. Show toast + Undo (5 s) on submit. Mutation only fires after confirmation.
- **Moderation transparency**: when a post is auto-blocked by `community-moderate`, surface the category ("Blocked: medical claim") in the toast, not a generic message.

---

## D. Real data (kill placeholders)

- **Avatars**: derive from `farmer.avatar_url`. Fallback = first letter of name on a stable color (hash of `farmer_id` → one of 8 palette HSL tokens). Drop the 👨‍🌾 emoji in `PostCard`, `QuickPostCreator`, `CommunityFeed.transformPost`, and `CommunityPage.transformedSavedPosts`.
- **Notifications**: delete `mockNotifications`. Wire `CommunityHeader` to a new `useCommunityNotifications` hook that reads from the `notifications` table filtered to `type in ('post_like','post_comment','post_reaction','follow')`. Empty state stays.
- **Saved tab fake math**: drop `Math.floor(likes*0.5)` etc. Fetch real reaction counts via the same select used in `useCommunityPosts` (the columns `helpful_count`, `tried_count`, `thanks_count` already exist on the post row).

---

## E. Unify reactions vs likes

Today: 3 emoji reactions + heart-like (via swipe) + bookmark = 5 concepts. Farmers will not parse this.

Decision: **keep the 3 emoji reactions + Save. Remove "like" entirely.**
- Remove `useLikePost` calls and the `isLiked` state from `PostCard`.
- `helpful` (🙏) becomes the de-facto "like".
- Comment, Share, Save stay as icon-only actions on the right.

This drops the action row from 6 controls to 5, fits 360 px without wrap.

---

## F. Perceived speed

- **Skeleton cards** (3 shimmer cards) instead of the centered spinner in `CommunityFeed`, matching the real PostCard footprint. Same for saved tab.
- **Optimistic insert** for `useCreatePost`: prepend the new post to the cache immediately with status `sending`, then reconcile on success/error.
- **Translation cache**: change `useTranslateText` to first read `post_translations` for `(post_id, target_lang)`; only call `community-translate` on miss. The edge function already writes to that table.
- **Cached vs live badge**: when translation came from cache, render `🌐 हिं · saved`; when fresh, render `🌐 हिं · ✨ live`.

---

## G. FAB vs QuickPostCreator

Both create posts. On a 390 px screen QuickPostCreator already sits at the top of Feed/My-Posts. FAB is redundant and also covers the last post's Save button.

Decision: **remove FAB on Feed and My-Posts tabs**. Keep it only on Trending/Saved/Groups tabs (where QuickPostCreator isn't shown).

---

## H. Small polish

- Fix double `pt-3` typo in QuickPostCreator action bar.
- Make hashtags tappable → set active tab to Trending and pre-filter by tag.
- Add a lightbox on post-image tap (full-screen, pinch-zoom, close on swipe-down). Move TTS button to the post action row when image is present, so tap-image ≠ tap-TTS.
- Empty-feed: replace 🌱 with an illustration + 1 CTA "Share your first tip" + 3 trending hashtag chips.
- Dark-mode pass on `bg-card/80` → `bg-card` (no opacity), `border-border/50` → `border-border`.

---

## I. AI affordances (lightweight, on-device-friendly)

These are deliberately small to keep data usage low for rural users:
- **Voice playback**: tiny 16-bar waveform animated only while playing (CSS-only, no canvas). No-op when offline.
- **Crop tags from `community-caption-suggest`**: render as small chips under the post image (`#टमाटर #पत्ती-झुलसा`) — read from `post.metadata.crop_tags` if present.
- **Smart reply in CommentsSheet**: 3 suggested chips from a new `community-suggest-reply` edge function (gemini-3-flash-preview), only loaded when the sheet opens.
- Skip waveform / smart reply if `navigator.connection.effectiveType` is `2g`/`slow-2g`.

---

## Out of scope (call out, don't build now)

- CommentsSheet realtime + pagination + @mentions → separate phase.
- Groups tab redesign.
- TrendingTopics redesign beyond hashtag tap-through.

---

## Technical notes

Files to edit:
- `src/pages/CommunityPage.tsx` — remove sticky LanguageSelector strip, conditional FAB.
- `src/components/community/CommunityHeader.tsx` — compact 56 px row, embed language pill, wire real notifications, drop mocks.
- `src/components/community/CommunityTabs.tsx` — remove `top-[7.5rem]`, set `top-14`, remove blur, active-only label.
- `src/components/community/PostCard.tsx` — drop drag wrapper, remove like, add report-reason sheet, real avatar component, cached/live translation badge, tappable hashtags, image lightbox.
- `src/components/community/QuickPostCreator.tsx` — tap-toggle voice, fix `pt-3`, real avatar.
- `src/components/community/CommunityFeed.tsx` — skeletons, real reactions, drop emoji avatar.
- `src/hooks/useTranslateText.ts` — read `post_translations` first.
- `src/hooks/useCommunityPosts.ts` — optimistic insert in `useCreatePost`.
- New: `src/components/community/FarmerAvatar.tsx`, `src/components/community/PostCardSkeleton.tsx`, `src/components/community/ReportReasonSheet.tsx`, `src/components/community/ImageLightbox.tsx`, `src/hooks/useCommunityNotifications.ts`.
- New edge function: `supabase/functions/community-suggest-reply/index.ts`.

No DB migration needed (reaction counts and `post_translations` already exist).
