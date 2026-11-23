# Photo registration flow check

## Rule
Photo scans must respect the farmer's chosen land or General Scan mode, preserve farmer/tenant ownership, and explain failures without discarding the selected photos.

## Read and checked
| Place | Result from code inspection |
| --- | --- |
| Chat camera and attachments (`EnhancedAIChatInterface`) | Uses shared capture, passes selected land/session, or offers land selection from general chat. Inherits shared recovery. |
| InstaScan (`InstaScanFlow`) | Uses shared capture with owned land options; auto-binds a sole land. Inherits shared recovery. |
| Crop schedule/task proof (`TaskPhotoUploadDialog`) | Passes land, schedule, task and GPS requirement to shared capture. Land route checks related ownership. |
| Crop growth capture (`CropGrowthTracking`) | Passes selected land to shared capture. No independent registration write. |
| Satellite routine photo prompt (`AskCard`) | Passes its land to shared capture. |
| Satellite attention photo prompt (`AttentionCard`) | Passes its land to shared capture. |
| Shared camera General Scan and crop-mismatch fallback (`CropPhotoCapture`) | Keeps selected shots after failures. Added explicit land recovery: bound cameras previously had no Change control after switching to General Scan. Unbound cameras return to land picker. |
| Shared upload/diagnosis calls (`cropPhotoService`) | Checks verified identity/session across asynchronous boundaries. Propagates specific setup error using a cloned response. Regression tests cover original-body preservation and unrelated-error handling. |
| Offline photo retry (`syncService`, `syncPendingPhotoCaptures`, `uploadQueued`) | Only queues land-bound photos; checks farmer/tenant and session, preserves failed items. Does not invoke General Scan. |
| Chat photo action dispatch (`ai-agriculture-chat/index.ts`) | Uses identity from the existing guard for upload and diagnosis actions. |
| Land upload and diagnosis (`photo-routes`, `perception-engine`) | Requires owned land and checks related schedule/task/session. Diagnosis verifies farmer and land for each upload. Not affected by NULL-land registration. |
| General upload (`photo-routes`) | Intentionally uses NULL land and guarded farmer/tenant. Live legacy trigger rejects it; specific unavailable response added instead of generic registration failure. |
| General diagnosis and evidence linking (`general-scan`) | Verifies each general upload's farmer/tenant before diagnosis. NULL-land diagnosis and linking also conflict with legacy live triggers. Database repair held for permission. AI model routing and agronomy logic unchanged. |
| Legacy scan processing (`ai-crop-scan`) | Updates existing uploads and stores analysis; does not register new photo evidence. Not the source of this registration error. |
| Growth upload history (`useCropGrowthTracking`) | Reads existing land uploads; does not register General Scan evidence. Existing records unchanged. |
| Live `crop_photo_fill_context()` | Read live definition: always looks up a land; rejects NULL. Confirmed registration blocker. |
| Live `crop_photo_diagnosis_fill_identity()` | Read live definition: always derives identity from land; rejects NULL. Confirmed diagnosis blocker. |
| Live `crop_photo_diagnosis_photo_same_land()` | Read live definition: compares land equality; NULL = NULL does not pass. Confirmed General Scan linking blocker. |
| Live `crop_growth_uploads_path_owner_chk` | Read live constraint: builds path from land_id; NULL expression does not enforce the intended `_general` owner path. Requires targeted database repair together with the triggers, not a bypass. |

## Limits
- No database, access policy, agronomy settings, or settled photo/diagnosis records changed.
- No deployment performed.
- General Scan remains unavailable until targeted database repair is approved and completed.
- Signed-in farmer capture/upload/diagnosis end-to-end and native device camera remain unverified; source inspection and mocked regressions are not equivalent to these checks.