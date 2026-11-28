# Living Farm — where every existing screen is in this branch

Farmer-app repo, branch `living-farm-ui`. "Old look" means the page is untouched and still works; it gets the new design in a later milestone.

| Route | Status in this milestone | Reached from |
|---|---|---|
| `/app`, `/app/home` | **New: Field home** | dock: Field |
| `/app/all` | **New: All launcher** | dock: All |
| `/app/land` | **New: Land** (sky, crop, water and soil of the chosen land) | dock: Land |
| `/app/day` | **New: Day** (sun path, week strip, the day's tasks) | dock: Day |
| `/app/weather` | new look; same data calls | temperature on Field home; All |
| `/app/market` | new look for the page and prices tab; same queries | All |
| `/app/services-near-me` | checked and refined 2026-11-28, working | All (services block, when the flag is on) |
| `/app/services-near-me/ask` | checked and refined 2026-11-28, working | from its parent page, as before |
| `/app/services-near-me/requests` | checked and refined 2026-11-28, working | from its parent page, as before |
| `/app/services-near-me/nursery/:accountId` | checked and refined 2026-11-28, working | from its parent page, as before |
| `/app/services-near-me/:family` | checked and refined 2026-11-28, working | from its parent page, as before |
| `/app/advisory` | old look, working — fixed sample text, not database rows (see DATABASE_WIRING) | All |
| `/app/schemes` | old look, working — fixed sample text, not database rows (see DATABASE_WIRING) | All |
| `/app/profile` | checked 2026-11-28: fits 320 and 393 px, no small text, tokens only; left as it is | All |
| `/app/profile/edit` | checked 2026-11-28: fits, readable, tokens only; left as it is | from its parent page, as before |
| `/app/lands` | new look; same data calls | Land: "All my lands"; All |
| `/app/lands/add` | instructions and confirm card refined; map-drawing screen unchanged | + on Field home; Land page |
| `/app/lands/:id/edit` | old look, working | from its parent page, as before |
| `/app/lands/:id` | new look; same data calls, one land per page | land chip on Field home (one land); Land page |
| `/app/lands/:id/soil` | lighter loading only; body unchanged | from its parent page, as before |
| `/app/lands/:id/ndvi` | refined: chosen land, lighter loading, larger tabs; cards unchanged | from its parent page, as before |
| `/app/diagnostics/environment` | old look, working | from its parent page, as before |
| `/app/ai-chat` | old look, working | same page as chat |
| `/app/chat` | reply card, reply actions and composer in the new look; rest old look, working | voice button → Type; All |
| `/app/community` | refined 2026-11-28 (one bottom bar, tabs, action row, translated labels), working | All |
| `/app/analytics` | refined 2026-11-28 (text size, touch targets), working | All |
| `/app/schedule` | land step and schedule view refined; crop input step still as before | Day: "Full schedule" and "Make a schedule"; task pin and chip on Field; All |
| `/app/ai-dashboard` | old look, working | from its parent page, as before |
| `/app/ndvi` | refined: chosen land, lighter loading, larger tabs; cards unchanged | All |
| `/app/videos` | old look, working | All |
| `/app/reels` | old look, working | video card on All |
| `/app/videos/legacy` | old look, working | from its parent page, as before |
| `/app/notifications/settings` | old look, working | All |
| `/app/crop-growth` | refined 2026-11-28 (text size, touch targets), working | All |
| `/app/growth-tracking` | old look, working | from its parent page, as before |
| `/app/proactive-alerts` | refined 2026-11-28 (text size, touch targets), working | alert pin and chip; All |
| `/app/subscription` | old look, working | All; any locked item |
| `/`, `/language-selection`, `/permissions`, `/auth`, `/mobile-auth`, `/pin`, `/pin-auth`, `/set-pin`, `/forgot-pin`, `/activate`, `/choose-roles`, `/welcome`, `/roles`, `/install`, not-found | old look, working | entry flow, unchanged |
| `/provider` and its 10 children, `/customer` and `/customer/profile` | old look, working | role switcher, unchanged (separate shell) |

## What the old home showed, and where it is now

| Old home block | Now |
|---|---|
| Weather card with land carousel | Field home: temperature, rain chance, sun and clouds over the selected land; land picker |
| Weather schedule alerts, alerts summary | Field home: alert pin, the sentence, alert chip (same `proactive_alerts` rows) |
| Main and secondary feature tiles | All launcher, from the same feature registry and plan locks. The invented statistics on the tiles (price, trends, member and scheme counts) are not carried over. |
| Services near me block | All launcher, unchanged component |
| Video help card | All launcher, unchanged component |
| Recent activity (auto-rotating) | Not carried over: it rotated land names and static lines, no activity data. |

## Changed behaviour to check

- The floating voice-navigation button is hidden on the Field home only (it would cover the sentence card). It is on every other page as before, moved to sit just above the new dock.
- The round role-switch button (people with several roles) is in the top row on Field, Day and Land. On other farmer pages it floats just above the dock, at the left.
- The old bottom bar (Home, Community, Scan menu, Analytics, Profile) is replaced by the dock. Community, Analytics and Profile are on All.
- `HindenburgMenu` is still mounted but nothing opens it now; every working destination it listed is on All. Its links to `/app/finance`, `/app/irrigation`, `/app/solar`, `/app/help` and `/app/contact` had no routes.
- `src/pages/Home.tsx` and `src/components/BottomNavigation.tsx` are left in the repo, unused, until you confirm nothing is missing.
