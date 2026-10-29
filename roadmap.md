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