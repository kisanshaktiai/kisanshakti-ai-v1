# Graph Report - src  (2026-08-10)

## Corpus Check
- Large corpus: 622 files · ~528,555 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 3204 nodes · 8744 edges · 171 communities (138 shown, 33 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 174 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- UI Primitives (shadcn)
- Reels Feed Hook
- Local DB (IndexedDB)
- NDVI Science
- Local DB (IndexedDB) 2
- Analytics Library
- Voice Services
- Decision Graph: Facts
- Chat Interface
- Chat Interface 2
- UI Primitives (shadcn) 2
- Land Management
- Location Service
- App
- Market Intelligence
- Crop Schedule
- Marketplace
- UI Primitives (shadcn) 3
- Crop Schedule 2
- Community Feed
- Weather
- Voice UI
- Voice Services 2
- i18n / Localization
- Community Feed 2
- Decision Graph Types
- Farm Intelligence
- Crop Growth
- Voice Services 3
- Voice Services 4
- Chat Interface 3
- Loading Skeletons
- Subscription/Billing
- UI Primitives (shadcn) 4
- Chat Interface 4
- Land Management 2
- Toast Notifications
- Tenant Context
- Decision Graph: Audit
- Land Management 3
- Permission Manager
- Weather 2
- Crop Schedule 3
- UI Primitives (shadcn) 5
- Home
- Use You Tube Channel Reels
- Chat Interface 5
- Onboarding
- Proactive Alerts
- Crop Schedule 4
- Universal T T S Service
- Decision Rules.Types
- Crops
- Maps
- Native T T S Service
- Voice Services 5
- Regional Adapter
- Hybrid T T S Service
- Voice Services 6
- Voice Services 7
- Chat Interface 6
- Header
- Crop Schedule 5
- Chat
- Storage Service
- Tts Store
- Voice Services 8
- Tts Settings Store
- Voice Services 9
- Kokoro T T S Service
- Chat Sync Service
- Enhanced Native T T S Service
- Kokoro T T S Service 2
- Notification Service
- Sync Service
- Chat Interface 7
- Chat Image Storage
- Use Land Chat Context
- Native T T S Service 2
- Chat 2
- Voice Services 10
- Voice Services 11
- Layout
- Crops 2
- UI Primitives (shadcn) 6
- Subscription/Billing 2
- Tts
- Enhanced Native T T S Service 2
- UI Primitives (shadcn) 7
- Voice Services 12
- Tenant Isolation Service
- Tts 2
- Voice Services 13
- Voice Services 14
- Permission Onboarding
- Bottom Navigation
- Chat Interface 8
- Use Community Groups
- Youtube
- Image Preprocessing
- Tts 3
- Observability
- Chat 3
- Version Service
- Voice Services 15
- Voice Download Service
- White Label Service
- Use Realtime Data
- Subscription Context
- Cost Calculator
- Update State Manager
- Chat Interface 9
- UI Primitives (shadcn) 8
- Land Management 4
- Proactive
- UI Primitives (shadcn) 9
- Google Maps Context
- Voice Services 16
- Chat Interface 10
- Chat Interface 11
- Land Management 5
- Supabase Integration
- Offline Auth Service
- Offline Data Service
- Service Worker Registration
- Capacitor Init
- Voice Services 17
- Lands API
- Voice Services 18
- Chat Interface 12
- Language
- Land Management 6
- Crop Schedule 6
- UI Primitives (shadcn) 10
- UI Primitives (shadcn) 11
- Error Boundary
- Crop Schedule 7
- UI Primitives (shadcn) 12
- Data Isolation Service
- Enhanced Native T T S Service 3
- Schedules Api
- Toast Manager
- Chat Interface 13
- Chat Interface 14
- Chat Interface 15
- Community Feed 3
- Land Management 7
- Language 2
- Weather 3
- Use Crop Growth Tracking
- Chat 4
- Enhanced Native T T S Service 4
- Community Feed 4
- Voice Navigation Store
- Lazy With Retry
- Chat Interface 16
- Community Feed 5
- Marketplace 2
- Weather 4
- Chat 5
- Layout 2
- Weather 5
- Weather 6
- Weather 7
- Sw Custom
- Vite Env.D
- Query Keys

## God Nodes (most connected - your core abstractions)
1. `cn()` - 576 edges
2. `useAuthStore` - 168 edges
3. `Button` - 161 edges
4. `Card` - 129 edges
5. `Badge()` - 98 edges
6. `supabase` - 90 edges
7. `useTenant()` - 79 edges
8. `useToast()` - 75 edges
9. `CardContent` - 72 edges
10. `supabaseWithAuth()` - 63 edges

## Surprising Connections (you probably didn't know these)
- `SectionCard()` --calls--> `cn()`  [EXTRACTED]
  components/analytics/AnalyticsSections.tsx → lib/utils.ts
- `AdvisorySection()` --calls--> `cn()`  [EXTRACTED]
  components/chat/CanonicalAdvisoryCard.tsx → lib/utils.ts
- `ConfidenceBadge()` --calls--> `cn()`  [EXTRACTED]
  components/chat/CanonicalAdvisoryCard.tsx → lib/utils.ts
- `AuditCard()` --calls--> `cn()`  [EXTRACTED]
  components/chat/DataAuditCards.tsx → lib/utils.ts
- `CausesList()` --calls--> `cn()`  [EXTRACTED]
  components/chat/DiagnosticResponseCard.tsx → lib/utils.ts

## Import Cycles
- None detected.

## Communities (171 total, 33 thin omitted)

### Community 0 - "UI Primitives (shadcn)"
Cohesion: 0.04
Nodes (80): ProductCard(), AnalysisStep(), HomeFeaturesGridImpl(), TenantBackground(), TenantBackgroundProps, AccordionContent, AccordionItem, AccordionTrigger (+72 more)

### Community 1 - "Reels Feed Hook"
Cohesion: 0.06
Nodes (54): GroupChatSheet(), GroupChatSheetProps, BrandBlock(), InstaScanFlowProps, InstaScanResult, AvatarUpload(), CropScheduleView(), ScheduleDebugPanel() (+46 more)

### Community 3 - "NDVI Science"
Cohesion: 0.07
Nodes (53): NDVIEarlyWarning(), NDVIHealthScore(), computeBounds(), ESRI_SAT_STYLE, NDVIMapView(), NDVIMapViewProps, normalizeNdviAssetUrl(), polygonCssClipPath() (+45 more)

### Community 4 - "Local DB (IndexedDB) 2"
Cohesion: 0.06
Nodes (40): SyncStatusIndicator(), getSupabaseFunctionUrl(), SUPABASE_CONFIG, useOfflineData(), ResolvedLand, useSyncReady(), Database, dataIsolation (+32 more)

### Community 5 - "Analytics Library"
Cohesion: 0.07
Nodes (50): Analytics, chartBase, CropStageCard(), defaultRec(), DisclaimerCard(), FinancialCard(), MarketPulseCard(), RecommendationsCard() (+42 more)

### Community 6 - "Voice Services"
Cohesion: 0.07
Nodes (6): ActionHandler, DialogManager, IntentMatcher, levenshteinDistance(), similarity(), VoiceIntent

### Community 7 - "Decision Graph: Facts"
Cohesion: 0.05
Nodes (49): buildDecisionInput(), calculateDataConfidence(), CROP_GROUP_MAP, CROP_STAGE_DAS, CropStageConfig, DataAge, extractCropStage(), extractFarmingMode() (+41 more)

### Community 8 - "Chat Interface"
Cohesion: 0.06
Nodes (24): NotificationSettingsPage, AdvisorySection(), CanonicalAdvisoryCard(), CanonicalAdvisoryCardProps, CanonicalFarmerAdvisory, ConfidenceBadge(), PRODUCT_LABELS, PRODUCT_THEMES (+16 more)

### Community 9 - "Chat Interface 2"
Cohesion: 0.10
Nodes (30): EnhancedSpeakerButtonProps, categoryStyles, getLabels(), RecommendationCard(), RecommendationCards(), RecommendationCategory, AnalysisData, CropGrowthAnalysisCard() (+22 more)

### Community 10 - "UI Primitives (shadcn) 2"
Cohesion: 0.09
Nodes (33): ForgotPin, InstallPWA, MobileAuth, SetPin, AppHeader(), ProtectedRoute(), ProtectedRouteProps, FarmingSplashAnimation() (+25 more)

### Community 11 - "Land Management"
Cohesion: 0.07
Nodes (37): FieldChip(), FieldChipProps, LandFormDialog(), LandMapThumb(), LatLng, Props, COUNTRIES, LocationPickerSection() (+29 more)

### Community 12 - "Location Service"
Cohesion: 0.08
Nodes (20): District, LocationCache, State, Taluka, useLocationCache, Village, useLocationData(), useLocationPermission() (+12 more)

### Community 13 - "App"
Cohesion: 0.05
Nodes (36): Advisory, AICommunityPage, AIScheduleDashboard, AuthScreen, CropGrowthTracking, CropSelectionTest, EditLand, EnvDiagnostics (+28 more)

### Community 14 - "Market Intelligence"
Cohesion: 0.09
Nodes (30): AISellingAdvisor(), AISellingAdvisorProps, CropChips(), CropChipsProps, CropGroup, CropGroupButtons(), CropGroupButtonsProps, defaultGroups (+22 more)

### Community 15 - "Crop Schedule"
Cohesion: 0.08
Nodes (32): VideoReels, APPLICATION_METHOD_TRANSLATIONS, PRODUCT_NAME_TRANSLATIONS, PRODUCT_TYPE_TRANSLATIONS, ProductRecommendation, ProductRecommendationCard(), ProductRecommendationCardProps, productTypeConfig (+24 more)

### Community 16 - "Marketplace"
Cohesion: 0.09
Nodes (28): Market, Alert, CropGrowthAlerts(), CropGrowthAlertsProps, Crop, CropGroup, EnhancedCropSelectorProps, groupIcons (+20 more)

### Community 17 - "UI Primitives (shadcn) 3"
Cohesion: 0.11
Nodes (30): CropSelectionCard(), EditLandWizard(), EditLandWizardProps, LatLng, initialFormData, LandFormData, ModernLandWizardProps, MarketStateSelectorProps (+22 more)

### Community 18 - "Crop Schedule 2"
Cohesion: 0.11
Nodes (27): FeedbackDialogProps, Crop, CropGroup, CropSelectionDialogProps, groupIcons, SmartCropInputProps, LanguageConfirmDialog(), LOCALIZED (+19 more)

### Community 19 - "Community Feed"
Cohesion: 0.09
Nodes (29): CommentsSheet(), CommentsSheetProps, FarmerAvatar(), FarmerAvatarProps, hashString(), PALETTE, SIZES, ImageLightbox() (+21 more)

### Community 20 - "Weather"
Cohesion: 0.09
Nodes (28): ScheduleGenerator(), NOTE: this instance is normally a store *follower* — the weather page or, WeatherWidget(), useAuthReady(), useLands(), LandWeatherStateResult, useLandWeatherState(), useLocation() (+20 more)

### Community 21 - "Voice UI"
Cohesion: 0.09
Nodes (27): ModernVoiceAssistant(), UnifiedVoiceOrchestrator(), VoiceCard, VoiceCardProps, VoiceConfirmDialog(), ROUTE_HINTS, ROUTE_HINTS_HI, VoiceContextualHints() (+19 more)

### Community 22 - "Voice Services 2"
Cohesion: 0.09
Nodes (7): RetrainingBatch, RetrainingExample, RetrainingQueue, ErrorReport, TelemetryEvent, UserFeedback, VoiceTelemetry

### Community 23 - "i18n / Localization"
Cohesion: 0.08
Nodes (28): AddLand, GeneralChatWelcomeCard(), GeneralChatWelcomeCardProps, QUICK_ACTIONS, LandInstructionDialog(), LandInstructionDialogProps, ModernLandWizard(), NDVIAlertBanner() (+20 more)

### Community 24 - "Community Feed 2"
Cohesion: 0.11
Nodes (26): CommunityFeed(), CommunityFeedProps, transformPost(), CommunityTabs(), CommunityTabsProps, tabs, CreatePostFAB(), CreatePostFABProps (+18 more)

### Community 25 - "Decision Graph Types"
Cohesion: 0.05
Nodes (34): AbioticTolerance, ActionMapping, AgroClimaticZone, AIAdjustments, CauseRule, ConflictRule, CottonSubStage, CropVariety (+26 more)

### Community 26 - "Farm Intelligence"
Cohesion: 0.09
Nodes (25): EtoRainMiniTimeline(), EtoRainMiniTimelineProps, FarmIntelligenceCard(), IrrigationGauge(), IrrigationGaugeProps, fmt(), PHASE_STYLE, RiskEpisodeChips() (+17 more)

### Community 27 - "Crop Growth"
Cohesion: 0.11
Nodes (18): Analysis, CropGrowthHistory(), CropGrowthHistoryProps, Upload, CropGrowthUploader(), CropGrowthUploaderProps, CropPhotoGuidelines(), CropPhotoGuidelinesProps (+10 more)

### Community 28 - "Voice Services 3"
Cohesion: 0.09
Nodes (8): NetworkStatusService, OfflineCapability, OfflineConfig, PendingOperation, TODO: Implement actual operation execution, CacheConfig, CacheEntry, VoiceCache

### Community 29 - "Voice Services 4"
Cohesion: 0.12
Nodes (16): ModernVoiceContext, ModernVoiceContextType, shouldUseCapacitorSpeech(), ExtractedSlots, SlotPattern, ASRProvider, ASRResult, DialogueState (+8 more)

### Community 30 - "Chat Interface 3"
Cohesion: 0.09
Nodes (29): DataAudit, DecisionBrainResponse, DiagnosisOnlyCard(), DiagnosisOnlyCardProps, getLabels(), DiagnosticEscalationUI(), getLabels(), Message (+21 more)

### Community 31 - "Loading Skeletons"
Cohesion: 0.17
Nodes (17): LandSpecificChatTabProps, MessageSkeleton(), Product, ProductGrid(), ProductGridProps, AnalyticsSkeleton(), HomeSkeleton(), LandDetailsSkeleton() (+9 more)

### Community 32 - "Subscription/Billing"
Cohesion: 0.11
Nodes (21): AIChat, defaultMenuItems, HindenburgMenu(), HindenburgMenuProps, MenuItemType, PATH_TO_ENTITLEMENT, AppBootGate(), ChatQuotaBanner() (+13 more)

### Community 33 - "UI Primitives (shadcn) 4"
Cohesion: 0.12
Nodes (22): GeneralChatLandPicker(), PickerLand, Props, Props, ReportReason, ReportReasonSheet(), CartItem, ShoppingCartProps (+14 more)

### Community 34 - "Chat Interface 4"
Cohesion: 0.11
Nodes (24): ActionItem, BlockedAction, BlockedActionCard(), BlockedActionCardProps, ConfidenceIndicator(), ConfidenceIndicatorProps, ConfidenceInfo, DecisionBrainCards() (+16 more)

### Community 35 - "Land Management 2"
Cohesion: 0.10
Nodes (21): InstaScanCamera(), InstaScanCameraProps, QualityStatus, AreaDisplay(), AreaDisplayProps, GoogleMapBoundaryDrawer(), GoogleMapBoundaryDrawerProps, IS_NATIVE (+13 more)

### Community 36 - "Toast Notifications"
Cohesion: 0.12
Nodes (23): Toast, ToastAction, ToastActionElement, ToastClose, ToastDescription, ToastProps, ToastTitle, toastVariants (+15 more)

### Community 37 - "Tenant Context"
Cohesion: 0.14
Nodes (22): BrandingConfig, firstThemeValue(), mergeThemeGroups(), normalizeThemeConfig(), PWAConfig, setThemeAlias(), SplashScreenConfig, TenantConfig (+14 more)

### Community 38 - "Decision Graph: Audit"
Cohesion: 0.10
Nodes (15): AuditLogBatch, AuditLogEntry, flushLogBuffer(), forceFlush(), generateLogId(), hashInput(), lastFlushTime, LOG_BUFFER (+7 more)

### Community 39 - "Land Management 3"
Cohesion: 0.13
Nodes (22): Crop, CropGroup, CropManagementDialog(), CropManagementDialogProps, FormData, formSchema, groupIcons, FormData (+14 more)

### Community 40 - "Permission Manager"
Cohesion: 0.14
Nodes (8): usePermission(), UsePermissionOptions, PermissionContext, PermissionManager, PermissionManagerClass, PermissionStatus, PermissionType, StoredPermission

### Community 41 - "Weather 2"
Cohesion: 0.12
Nodes (18): paddingClasses, PageShell(), PageShellProps, spacingClasses, variantClasses, FarmingRecommendations(), FarmingRecommendationsProps, HourlyForecastChart() (+10 more)

### Community 42 - "Crop Schedule 3"
Cohesion: 0.13
Nodes (17): CreateGroupModal(), CreateGroupModalProps, GROUP_EMOJIS, CentralizedCropSelector(), CentralizedCropSelectorProps, Crop, CropGroup, Props (+9 more)

### Community 43 - "UI Primitives (shadcn) 5"
Cohesion: 0.22
Nodes (15): ModernLandCardProps, LocationPermissionDialogProps, iconMap, PermissionRequestModalProps, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription (+7 more)

### Community 44 - "Home"
Cohesion: 0.12
Nodes (15): Home, AlertsSummaryCard(), AlertSummary, priorityConfig, HomeFeatureCard, HomeFeaturesGrid, Props, HomeRecentActivity (+7 more)

### Community 45 - "Use You Tube Channel Reels"
Cohesion: 0.15
Nodes (18): ReelsPage, fmt(), RailButton(), ReelActionRail(), fetchOfficialShorts(), fetchViaProxies(), parseFeed(), parseShortsMarkdown() (+10 more)

### Community 46 - "Chat Interface 5"
Cohesion: 0.15
Nodes (17): InteractiveScheduleTable(), InteractiveScheduleTableProps, ScheduleRow, ProgressTimeline(), ProgressTimelineProps, TimelineStage, ResponseSectionCard(), ResponseSectionCardProps (+9 more)

### Community 47 - "Onboarding"
Cohesion: 0.14
Nodes (14): haptic(), MapControls(), MapControlsProps, computeCoachPos(), FeatureWalkthrough(), Pos, Step, STEPS (+6 more)

### Community 48 - "Proactive Alerts"
Cohesion: 0.13
Nodes (19): ProactiveAlerts, AppLayout(), useEnhancedTTS(), getAlertMessage(), getAlertTitle(), ProactiveAlert, useProactiveAlerts(), CATEGORY_TOKEN (+11 more)

### Community 49 - "Crop Schedule 4"
Cohesion: 0.16
Nodes (15): BackdatedConsentDialog(), CropDateInputProps, FarmingMode, FarmingOption, farmingOptions, FarmingTypeDialog(), FarmingTypeDialogProps, IntercropData (+7 more)

### Community 50 - "Universal T T S Service"
Cohesion: 0.16
Nodes (6): speakText(), stopSpeaking(), SUPPORTED_LANGUAGES, TTSOptions, TTSResult, UniversalTTSService

### Community 51 - "Decision Rules.Types"
Cohesion: 0.10
Nodes (19): ActionType, AquaticToxicity, BeeToxicity, CANONICAL_GROUP_NAMES, CanonicalGroup, ConditionsJson, CropStage, DecisionRule (+11 more)

### Community 52 - "Crops"
Cohesion: 0.13
Nodes (13): Crop, CropGroup, CropSelector(), CropSelectorProps, groupIcons, Crop, CropGroup, SimpleCropSelectorProps (+5 more)

### Community 53 - "Maps"
Cohesion: 0.14
Nodes (14): LandCard(), generateBoundarySvg(), LandThumbnail(), LandThumbnailProps, urlCache, GOOGLE_MAPS_LIBRARIES, GoogleMapsScriptContext, GoogleMapsScriptContextType (+6 more)

### Community 54 - "Native T T S Service"
Cohesion: 0.13
Nodes (4): VoiceWeatherSummary(), VoiceWeatherSummaryProps, NativeTTSService, resumeSpeaking()

### Community 55 - "Voice Services 5"
Cohesion: 0.13
Nodes (5): CircuitBreaker, CircuitBreakerConfig, CircuitBreakerFactory, CircuitBreakerStats, CircuitState

### Community 56 - "Regional Adapter"
Cohesion: 0.15
Nodes (16): AgroClimaticZone, applyRegionalModifiers(), determineZone(), getZoneSpecificNotes(), isDiseaseAction(), isIrrigationAction(), RegionalModificationResult, STATE_TO_ZONE (+8 more)

### Community 58 - "Voice Services 6"
Cohesion: 0.16
Nodes (4): AudioProcessor, AudioProcessorConfig, ProcessedAudio, TODO: Implement actual WebM re-encoding with opus codec

### Community 60 - "Chat Interface 6"
Cohesion: 0.15
Nodes (15): getBeeIcon(), getCauseColor(), getCauseIcon(), getConfidenceColor(), getIPMLabel(), HowSection, NextStepsSection, SafetyInfo (+7 more)

### Community 61 - "Header"
Cohesion: 0.29
Nodes (9): ConnectionStatusIcon(), HeaderStatusDot(), StatusPill(), UnifiedSyncButton(), OfflineIndicator(), useOfflineStatus(), useSyncAction(), SyncMetadata (+1 more)

### Community 62 - "Crop Schedule 5"
Cohesion: 0.15
Nodes (13): ClimateAlertBanner(), ClimateAlertBannerProps, ClimateState, isHigh(), CropSchedule, CropScheduleViewProps, ScheduleTask, isValidValue() (+5 more)

### Community 63 - "Chat"
Cohesion: 0.14
Nodes (12): ACTION_TYPE_LABELS, CONFIDENCE_LABELS, DATA_SOURCE_LABELS, DIAGNOSTIC_LABELS, formatFreshness(), formatLocalizedNumber(), formatLocalizedPercentage(), FRESHNESS_LABELS (+4 more)

### Community 64 - "Storage Service"
Cohesion: 0.19
Nodes (10): generateFilePath(), getPublicUrl(), StorageBucket, StorageUsage, uploadAvatar(), uploadChatAttachment(), uploadFile(), uploadLandImage() (+2 more)

### Community 65 - "Tts Store"
Cohesion: 0.19
Nodes (13): EnhancedSpeakerButton(), TTSSettingsModal(), base64ToBlob(), splitIntoSentences(), useAdvancedTextToSpeech(), UseAdvancedTextToSpeechProps, ALL_INDIAN_LANGUAGES, PREINSTALLED_VOICES (+5 more)

### Community 66 - "Voice Services 8"
Cohesion: 0.23
Nodes (9): LandSpecificChatTab(), InstaScanResults(), preloadAllLocationData(), CapacitorSpeechResult, initCapacitorSpeechRecognition(), isCapacitorSpeechAvailable(), requestSpeechPermission(), startCapacitorListening() (+1 more)

### Community 67 - "Tts Settings Store"
Cohesion: 0.19
Nodes (14): iconSizeMap, sizeMap, SpeakerButton(), SpeakerButtonProps, useTTS(), DEFAULT_SETTINGS, TTS_LANGUAGES, TTSLanguageCode (+6 more)

### Community 68 - "Voice Services 9"
Cohesion: 0.18
Nodes (4): NativeVoiceButton(), NativeVoiceButtonProps, useNativeVoiceNavigation(), NativeSpeechRecognitionService

### Community 69 - "Kokoro T T S Service"
Cohesion: 0.17
Nodes (13): UseHybridTTSOptions, UseHybridTTSReturn, ALL_SUPPORTED_LANGUAGES, HybridTTSConfig, TTSCallbacks, TTSProvider, TTSResult, DEFAULT_KOKORO_VOICE (+5 more)

### Community 70 - "Chat Sync Service"
Cohesion: 0.17
Nodes (5): ChatSyncService, MessageStatus, OptimisticMessage, SyncResult, AIChatMessageData

### Community 75 - "Chat Interface 7"
Cohesion: 0.19
Nodes (13): ClarificationOption, ClarificationOptionsUI(), ClarificationOptionsUIProps, cleanOptionLabel(), getLabels(), getOptionIcon(), LABELS, MultiChoiceOption() (+5 more)

### Community 76 - "Chat Image Storage"
Cohesion: 0.23
Nodes (11): EnhancedAIChatInterface(), compressAudioForStorage(), compressImageForStorage(), compressVideoForStorage(), extractVideoThumbnail(), extractVideoThumbnailSafe(), getAuthenticatedClient(), uploadChatImage() (+3 more)

### Community 77 - "Use Land Chat Context"
Cohesion: 0.22
Nodes (12): daysBetween(), fmtDate(), LandContextCard(), LandContextCardProps, ndviStatus(), EMPTY_CTX, fetchLandChatContext(), LandChatContext (+4 more)

### Community 78 - "Native T T S Service 2"
Cohesion: 0.19
Nodes (12): UseTTSOptions, UseTTSReturn, ALL_INDIAN_LANGUAGES, FALLBACK_LANGUAGES, pauseSpeaking(), IMPORTANT: Indian languages should NEVER fall back to English directly, speakNow(), stopSpeaking() (+4 more)

### Community 79 - "Chat 2"
Cohesion: 0.14
Nodes (8): applyDiagnosticAnswer(), DIAGNOSTIC_LABELS, DiagnosticAnswerResult, DiagnosticMode, DiagnosticQuestion, DiagnosticSessionState, getPhotoInstructions(), PossibleCause

### Community 80 - "Voice Services 10"
Cohesion: 0.24
Nodes (13): ADVISORY_INTENTS, ANNOUNCEMENTS, IntentPattern, LOCAL_INTENTS, bestPhoneticMatch(), DIALECT_VARIATIONS, generatePhoneticVariants(), hindiSoundex() (+5 more)

### Community 82 - "Layout"
Cohesion: 0.23
Nodes (9): SpeakPageButton(), ScrollContext, useAppScrollRef(), ScrollToTopFab(), ScrollToTopFabProps, FeatureRouteGate(), REASON_KEYS, ROUTE_FEATURE_MAP (+1 more)

### Community 83 - "Crops 2"
Cohesion: 0.22
Nodes (10): CropInput(), CropInputProps, CropSelectionButton(), CropSelectionButtonProps, CropSelectionDialog(), CropSelectorModal(), CropSelectorModalProps, EnhancedCropSelector() (+2 more)

### Community 84 - "UI Primitives (shadcn) 6"
Cohesion: 0.20
Nodes (11): LanguageSelector(), SyncButton(), DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator (+3 more)

### Community 85 - "Subscription/Billing 2"
Cohesion: 0.18
Nodes (10): PlanBadge(), PlanBadgeProps, SubscriptionCard(), UsageMeter(), UsageMeterProps, FEATURE_LABELS, PaymentRow, PLAN_ICONS (+2 more)

### Community 86 - "Tts"
Cohesion: 0.22
Nodes (8): SyncStatus(), TTSSettingsPanel(), TTSSettingsPanelProps, DEFAULT_PREFS, TTSVoiceSettings(), VoiceDownloadPrompt(), VoiceDownloadPromptProps, Slider

### Community 87 - "Enhanced Native T T S Service 2"
Cohesion: 0.18
Nodes (12): TTSVoiceSettingsProps, UseEnhancedTTSOptions, UseEnhancedTTSReturn, ALL_INDIAN_LANGUAGES, enhancedTTSService, PREFERRED_VOICES, QUALITY_INDICATORS, TTSCallbacks (+4 more)

### Community 88 - "UI Primitives (shadcn) 7"
Cohesion: 0.19
Nodes (13): Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext, CarouselOptions (+5 more)

### Community 89 - "Voice Services 12"
Cohesion: 0.25
Nodes (10): SimpleVoiceMicButton(), SimpleVoiceMicButtonProps, VoiceSuggestion, ModernVoiceProvider(), detectBrowser(), getUnsupportedMessage(), getVoicePlatformInfo(), hasBrowserSpeechAPI() (+2 more)

### Community 93 - "Voice Services 14"
Cohesion: 0.19
Nodes (4): LanguageDetectionResult, LanguageDetector, LanguagePattern, SupportedLanguage

### Community 94 - "Permission Onboarding"
Cohesion: 0.24
Nodes (12): PermissionOnboarding, checkPermission(), ITEMS, loadStored(), mapCapState(), openNativeSettings(), PermissionOnboarding(), PermItem (+4 more)

### Community 95 - "Bottom Navigation"
Cohesion: 0.21
Nodes (10): BottomNavigation(), BottomNavigationProps, navItems, FloatingActionButton(), ShoppingCart(), defaultFeatures, featureCategories, FeatureItem (+2 more)

### Community 96 - "Chat Interface 8"
Cohesion: 0.17
Nodes (8): CausesList(), DiagnosticData, DiagnosticResponseCard(), DiagnosticResponseCardProps, DisambiguationQuestion, getLabelsFromT(), PossibleCause, WarningFooter()

### Community 97 - "Use Community Groups"
Cohesion: 0.26
Nodes (11): CommunityGroups(), CommunityGroupsProps, CROP_ICONS, getGroupIcon(), getGroupName(), CommunityGroup, CropGroup, useCommunityGroups() (+3 more)

### Community 98 - "Youtube"
Cohesion: 0.33
Nodes (10): VideoHelpCard(), VideoHelpCardProps, ReelActionRailProps, ReelPlayer(), ReelPlayerProps, Reel, buildYouTubeEmbed(), getYouTubeId() (+2 more)

### Community 99 - "Image Preprocessing"
Cohesion: 0.24
Nodes (10): InstaScanFlow(), autoEnhanceImage(), calculateQualityMetrics(), ImageQualityMetrics, preprocessImage(), PreprocessingResult, preprocessMultipleImages(), TODO: Extract and handle EXIF orientation if needed (+2 more)

### Community 100 - "Tts 3"
Cohesion: 0.31
Nodes (10): UseTTSFacadeOptions, UseTTSFacadeReturn, KOKORO_LANGUAGES, NATIVE_LANGUAGES, speak(), stopSpeaking(), ttsFacade, TTSOptions (+2 more)

### Community 101 - "Observability"
Cohesion: 0.22
Nodes (11): dedupe, EventType, flush(), initObservability(), queue, reportError(), reportEvent(), Severity (+3 more)

### Community 102 - "Chat 3"
Cohesion: 0.33
Nodes (12): convertActionsToFollowups(), deduplicateByCategory(), FollowUpQuestion, generateContextAwareFollowups(), getConfirmationQuestion(), getFertilizerYieldQuestion(), getNextActionQuestion(), getPreventionQuestion() (+4 more)

### Community 107 - "Use Realtime Data"
Cohesion: 0.20
Nodes (8): AppInitializer(), useGlobalRealtimeSync(), COMMON_STATES, RealtimeTable, RETRY_DELAYS, useRealtimeData(), UseRealtimeDataOptions, IS_NATIVE

### Community 108 - "Subscription Context"
Cohesion: 0.26
Nodes (9): SubscriptionHeaderChip(), SubscriptionStatusBanner(), useBannerHeightVar(), SubscriptionContext, SubscriptionGate(), SubscriptionGateProps, SubscriptionProviderProps, useSubscriptionContext() (+1 more)

### Community 109 - "Cost Calculator"
Cohesion: 0.21
Nodes (9): calculateTaskCost(), CostBreakdown, CostEstimate, findProductPrice(), getLaborRate(), LABOR_REQUIREMENTS, MARKET_PRICES, parseDose() (+1 more)

### Community 111 - "Chat Interface 9"
Cohesion: 0.29
Nodes (8): MessageStatus, VisionAnalysisCard(), WorldClassCamera(), VoiceDownloadCard(), AvatarUploadProps, Avatar, AvatarFallback, AvatarImage

### Community 112 - "UI Primitives (shadcn) 8"
Cohesion: 0.25
Nodes (7): Drawer(), DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 113 - "Land Management 4"
Cohesion: 0.25
Nodes (9): Season, seasonOf(), SeasonPicker(), SeasonPickerProps, SEASONS, CropStageResult, deriveCropCycle(), seasonToSowingDate() (+1 more)

### Community 114 - "Proactive"
Cohesion: 0.25
Nodes (9): AlertEvidenceSection, AlertEvidenceSectionProps, EVIDENCE_LABELS, getHeader(), getLabel(), getSolutionField(), getSolutionSteps(), SECTION_HEADERS (+1 more)

### Community 115 - "UI Primitives (shadcn) 9"
Cohesion: 0.25
Nodes (9): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, getPayloadConfigFromPayload(), THEMES (+1 more)

### Community 116 - "Google Maps Context"
Cohesion: 0.31
Nodes (10): cacheApiKey(), clearApiKeyCache(), fetchApiKeyDirect(), fetchWithTimeout(), getCachedApiKey(), getGoogleMapsApiKey(), GoogleMapsContext, GoogleMapsContextType (+2 more)

### Community 118 - "Chat Interface 10"
Cohesion: 0.24
Nodes (9): CropGroup, CropRecommendation, CropRecommendationCard(), CropRecommendationCardProps, CropSelectionResult, getLabels(), LABELS, SingleCropCard() (+1 more)

### Community 119 - "Chat Interface 11"
Cohesion: 0.24
Nodes (9): DiagnosticEscalationData, DiagnosticEscalationUIProps, DiagnosticHypothesis, getCategoryColor(), getCategoryIcon(), HypothesisCard(), HypothesisCardProps, LABELS (+1 more)

### Community 120 - "Land Management 5"
Cohesion: 0.29
Nodes (7): LandVoiceCapture(), LandVoiceCaptureProps, LANG_MAP, VoiceInput, VoiceInputProps, useSpeechRecognition(), UseSpeechRecognitionProps

### Community 121 - "Supabase Integration"
Cohesion: 0.20
Nodes (9): CompositeTypes, Constants, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables, TablesInsert (+1 more)

### Community 124 - "Service Worker Registration"
Cohesion: 0.27
Nodes (7): getRegistration(), isActive(), register(), RegistrationCallback, ServiceWorkerConfig, trackInstalling(), UpdateCallback

### Community 125 - "Capacitor Init"
Cohesion: 0.31
Nodes (7): App(), registerServiceWorker(), Window, appResumeCallbacks, getPlatform(), initializeCapacitor(), isNativeApp()

### Community 126 - "Voice Services 17"
Cohesion: 0.33
Nodes (7): UseNativeVoiceNavigationReturn, VoiceNavigationState, MatchedIntent, LANGUAGE_MAP, NativeSpeechConfig, nativeSpeechRecognition, SpeechRecognitionResult

### Community 128 - "Voice Services 18"
Cohesion: 0.25
Nodes (7): ActionContext, ActionResult, ConversationTurn, CorrectionIntent, DialogContext, PendingConfirmation, UndoAction

### Community 129 - "Chat Interface 12"
Cohesion: 0.25
Nodes (4): AuditCard(), DataAuditCards(), DataAuditCardsProps, DataAuditItem

### Community 130 - "Language"
Cohesion: 0.36
Nodes (5): TTSSettingsModalProps, LanguageCard(), LanguageCardProps, RadioGroup, RadioGroupItem

### Community 131 - "Land Management 6"
Cohesion: 0.25
Nodes (7): allCrops, cropCategories, cropStages, irrigationTypes, soilHealthStatus, soilTypes, waterSources

### Community 132 - "Crop Schedule 6"
Cohesion: 0.36
Nodes (7): getCropIcon(), getSoilIcon(), getWaterIcon(), Land, LandScheduleStatus, LandSelector(), LandSelectorProps

### Community 133 - "UI Primitives (shadcn) 10"
Cohesion: 0.25
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 134 - "UI Primitives (shadcn) 11"
Cohesion: 0.29
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 136 - "Crop Schedule 7"
Cohesion: 0.33
Nodes (4): Insight, insightTypeColors, insightTypeLabels, MarketingInsightsDashboard()

### Community 137 - "UI Primitives (shadcn) 12"
Cohesion: 0.43
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 142 - "Chat Interface 13"
Cohesion: 0.47
Nodes (5): ColorCodedCard(), ColorCodedCardProps, getIcon(), ICON_MAP, parseContent()

### Community 143 - "Chat Interface 14"
Cohesion: 0.33
Nodes (5): CATEGORY_STYLES, FollowUpQuestion, FollowUpQuestions(), FollowUpQuestionsProps, headerLabels

### Community 144 - "Chat Interface 15"
Cohesion: 0.40
Nodes (4): WaveformVisualizer(), WaveformVisualizerProps, languageNames, VoiceConversationPanelProps

### Community 145 - "Community Feed 3"
Cohesion: 0.33
Nodes (5): CATEGORY_COLORS, MOCK_TRENDING, TrendingTopic, TrendingTopics(), TrendingTopicsProps

### Community 146 - "Land Management 7"
Cohesion: 0.40
Nodes (5): cropToEmoji(), LandRef(), LandRefProps, LandRefShape, LandCard()

### Community 147 - "Language 2"
Cohesion: 0.47
Nodes (4): LocationDetector(), LocationDetectorProps, GeocodingResult, useReverseGeocoding()

### Community 148 - "Weather 3"
Cohesion: 0.40
Nodes (4): WeatherAnimation(), WeatherAnimationProps, WeatherHeroCard(), WeatherHeroCardProps

### Community 149 - "Use Crop Growth Tracking"
Cohesion: 0.33
Nodes (5): CropGrowthAlert, CropGrowthAnalysis, CropGrowthUpload, useCropGrowthTracking(), CropGrowthTracking()

### Community 150 - "Chat 4"
Cohesion: 0.33
Nodes (3): QueryClassification, SAFETY_CRITICAL_KEYWORDS, SIMPLE_QUERY_PATTERNS

### Community 152 - "Community Feed 4"
Cohesion: 0.40
Nodes (4): INDIAN_LANGUAGES, Language, LanguageSelector(), LanguageSelectorProps

### Community 153 - "Voice Navigation Store"
Cohesion: 0.50
Nodes (4): DEFAULT_SETTINGS, useVoiceNavigationStore, VoiceNavigationSettings, VoiceNavigationStore

### Community 154 - "Lazy With Retry"
Cohesion: 0.70
Nodes (3): isChunkLoadError(), lazyWithRetry(), retryImport()

### Community 155 - "Chat Interface 16"
Cohesion: 0.50
Nodes (3): CARD_THEMES, EnhancedColorCodedCard(), EnhancedColorCodedCardProps

### Community 156 - "Community Feed 5"
Cohesion: 0.50
Nodes (3): CommunityHeader(), CommunityHeaderProps, LANGUAGES

### Community 157 - "Marketplace 2"
Cohesion: 0.50
Nodes (3): Category, CategoryFilter(), CategoryFilterProps

### Community 158 - "Weather 4"
Cohesion: 0.50
Nodes (3): RainfallChart(), RainfallChartProps, RainfallData

### Community 159 - "Chat 5"
Cohesion: 0.50
Nodes (3): DEPRECATED_MESSAGE, GuardedAdvisory, RuleViolation

## Knowledge Gaps
- **819 isolated node(s):** `Window`, `queryClient`, `router`, `AppLoadingProgressProps`, `BottomNavigationProps` (+814 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `UI Primitives (shadcn)` to `Reels Feed Hook`, `NDVI Science`, `Analytics Library`, `Chat Interface`, `Chat Interface 2`, `UI Primitives (shadcn) 2`, `Land Management`, `Market Intelligence`, `Crop Schedule`, `Marketplace`, `UI Primitives (shadcn) 3`, `Crop Schedule 2`, `Community Feed`, `Weather`, `Voice UI`, `i18n / Localization`, `Community Feed 2`, `Crop Growth`, `Chat Interface 3`, `Loading Skeletons`, `Subscription/Billing`, `UI Primitives (shadcn) 4`, `Chat Interface 4`, `Land Management 2`, `Toast Notifications`, `Land Management 3`, `Weather 2`, `Crop Schedule 3`, `UI Primitives (shadcn) 5`, `Home`, `Use You Tube Channel Reels`, `Chat Interface 5`, `Onboarding`, `Proactive Alerts`, `Crop Schedule 4`, `Crops`, `Native T T S Service`, `Chat Interface 6`, `Header`, `Crop Schedule 5`, `Tts Store`, `Voice Services 8`, `Tts Settings Store`, `Voice Services 9`, `Chat Interface 7`, `Chat Image Storage`, `Use Land Chat Context`, `Layout`, `Crops 2`, `UI Primitives (shadcn) 6`, `Subscription/Billing 2`, `Tts`, `UI Primitives (shadcn) 7`, `Voice Services 12`, `Bottom Navigation`, `Chat Interface 8`, `Use Community Groups`, `Subscription Context`, `Chat Interface 9`, `UI Primitives (shadcn) 8`, `Land Management 4`, `Proactive`, `UI Primitives (shadcn) 9`, `Chat Interface 10`, `Chat Interface 11`, `Land Management 5`, `Chat Interface 12`, `Language`, `Crop Schedule 6`, `UI Primitives (shadcn) 10`, `UI Primitives (shadcn) 11`, `UI Primitives (shadcn) 12`, `Chat Interface 13`, `Chat Interface 14`, `Community Feed 3`, `Land Management 7`, `Weather 3`, `Use Crop Growth Tracking`, `Community Feed 4`, `Chat Interface 16`, `Community Feed 5`, `Marketplace 2`, `Weather 4`, `Layout 2`, `Weather 5`, `Weather 6`, `Weather 7`?**
  _High betweenness centrality (0.298) - this node is a cross-community bridge._
- **Why does `flushLogBuffer()` connect `Decision Graph: Audit` to `Voice Services 8`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `useAuthStore` connect `Reels Feed Hook` to `NDVI Science`, `Crop Schedule 6`, `Local DB (IndexedDB) 2`, `Analytics Library`, `Chat Interface`, `UI Primitives (shadcn) 2`, `App`, `Market Intelligence`, `Marketplace`, `UI Primitives (shadcn) 3`, `Community Feed`, `Weather`, `Use Crop Growth Tracking`, `i18n / Localization`, `Community Feed 2`, `Crop Growth`, `Voice Services 4`, `Subscription/Billing`, `UI Primitives (shadcn) 4`, `Land Management 2`, `Tenant Context`, `Crop Schedule 3`, `Home`, `Use You Tube Channel Reels`, `Proactive Alerts`, `Crop Schedule 4`, `Header`, `Crop Schedule 5`, `Voice Services 8`, `Chat Image Storage`, `Use Land Chat Context`, `Subscription/Billing 2`, `Tts`, `Voice Services 12`, `Use Community Groups`, `Image Preprocessing`, `Use Realtime Data`, `Subscription Context`, `Chat Interface 9`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `Window`, `queryClient`, `router` to the rest of the system?**
  _819 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Primitives (shadcn)` be split into smaller, more focused modules?**
  _Cohesion score 0.03903693314633006 - nodes in this community are weakly interconnected._
- **Should `Reels Feed Hook` be split into smaller, more focused modules?**
  _Cohesion score 0.06128364389233954 - nodes in this community are weakly interconnected._
- **Should `Local DB (IndexedDB)` be split into smaller, more focused modules?**
  _Cohesion score 0.07344632768361582 - nodes in this community are weakly interconnected._