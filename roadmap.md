# Schedule graphical view
- [x] Remove the pending-sections notice and preserve the Basic view.
- [x] Add a Beta horizontal biological-stage timeline from saved DB stage metadata, with stage-only tasks and existing actions.
- [x] Test grouping, unknown stages and repeated-picking isolation; 11 regressions passed, new modules lint clean, preview build OK; isolated navigation verified at 394×732 and 1280×1800.
- [ ] Verify signed-in stage navigation and task completion read-back: external unmanaged farmer session unavailable; isolated sample-task checks do not verify the authenticated flow.

# Schedule availability repair
- [x] Move review loading to the owner-checked schedules-api read route; deployed only schedules-api. 24 regressions passed, preview build OK, and unauthenticated/invalid-token probes return 401. Authenticated read-back remains blocked by the unavailable external farmer session below.
- [x] Confirm activation blockers reject repeated-picking and missing-variety-evidence plans before persistence; no review-only flow exists.
- [x] Create approved server-only review ledger, owner-scoped save/list paths and durable localized review screen; isolate selections from executable tasks and quantities. 22 safety/isolation tests passed; review module typecheck and mobile controls passed.
- [x] Preserve repeated-picking phases rather than truncating/merging them at first maturity; activation still requires verified recurrence evidence.
- [ ] Finish release eligibility integration: concurrent edits added a new pre-baseline release gate importing missing scientific-release-gate.ts, blocking function validation and draft generation. Preserve those edits until their owner completes them.
- [ ] Verify authenticated staging creation/read-back and safe production release: external unmanaged farmer session unavailable; no deployment performed.

# Market appearance refinement
- [x] Remove accent-filled card hover and unify neutral Market control states.
- [x] Refine mobile card hierarchy, filter alignment, and price-detail spacing without changing data logic.
- [x] Verify isolated card hover/detail controls at 394×684 and 1280×1800; 19 market regressions passed and preview build is OK. Existing lint errors remain in Market page data typings; signed-in whole-page verification remains blocked by external unmanaged authentication (tracked below).

# Camera consolidation
- [x] Fix shared capture translations, mobile dialog, preview lifecycle, and empty-land exit.
- [x] Route active diagnostic camera entry points through the shared capture tool; retire unused cameras and direct growth upload path.
- [x] Verify photo identity isolation with regressions and retain private, land-bound uploads.
- [x] Run camera regressions and verify mobile/gallery preview and desktop fit (15 tests passed).
- [ ] Authenticated native-camera/upload end-to-end verification: external Supabase session unavailable; browser component check is not a signed-in farmer flow.
- [ ] Verify 10M-user capacity: requires production capacity information and authorized load testing.

## Retained limitations
- Existing crop-growth history/analysis reads remain legacy; new shared capture returns the decision in its dialog, not a replacement legacy analysis record. Video capture is retired from crop diagnostics; historical video records remain.
- NDVI layout and toast overhaul were not part of this camera approval.

# Market product separation
- [x] Separate agricultural produce and livestock using verified source commodity codes, without DB changes.
- [x] Replace clipped filter rails with aligned, complete selectors; paginate all available price results.
- [x] Run market regressions (11 passed), live produce/livestock probes, and isolated component checks at 394×732 and 1280×1800.
- [ ] Signed-in market-page end-to-end verification: external unmanaged Supabase session is unavailable; isolated UI/live public-data checks do not verify the farmer session.

# Land and market timeout repair
- [x] Replace repeated offset scans with cursor paging and shared market catalog caching; deployed and live selectors return all 180 produce items and 9 livestock items.
- [x] Recover transient land read timeouts without retrying writes or weakening ownership checks; bounded recovery regressions pass.
- [x] Run targeted regressions (16 passed), function type checks, preview build, and live market requests (200); unauthenticated lands remain 401.
- [ ] Signed-in land-read verification: external unmanaged farmer session is unavailable.
- [ ] Further cold-catalog optimization: complete historical scans still take 21–36 seconds; eliminating them requires an approved database catalog/aggregation change, outside the no-DB-change scope.
