import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { useEffect, useState, Suspense } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/config";
import { lazyWithRetry as lazy } from "@/utils/lazyWithRetry";

// Components - Keep critical path components eager loaded
import ErrorBoundary from "@/components/ErrorBoundary";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
// Multi-role identity (Farmer + Service Provider + Customer) — inert until the
// server reports the multi_role_identity flag as on for the tenant.
import { FarmerRoleGate } from "@/components/identity/FarmerRoleGate";
import { WorkspaceRoute } from "@/components/identity/WorkspaceRoute";
import { AccountResume } from "@/components/identity/AccountResume";
import { ProviderFlagGate } from "@/components/provider/ProviderFlagGate";
// FirstRunOnboardingController removed — replaced by PermissionOnboarding + FeatureWalkthrough
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { AppLoadingProgress } from "@/components/AppLoadingProgress";

// Extend Window interface for PWA prompt
declare global {
  interface Window {
    __capturedPwaPrompt?: any;
  }
}

// PERFORMANCE: Lazy load all page components (with auto-retry + stale-chunk recovery)
const Home = lazy(() => import("./pages/Home"));
const Weather = lazy(() => import("./pages/Weather"));
const Market = lazy(() => import("./pages/Market"));
// "Services near me" (Provider Workspace part A, file 6): farmer side, behind the farm_services_search flag.
const ServicesNearMe = lazy(() => import("./pages/services/ServicesNearMe"));
const ServiceProviders = lazy(() => import("./pages/services/ServiceProviders"));
const NurseryStorePage = lazy(() => import("./pages/services/NurseryStorePage"));
const AskForWork = lazy(() => import("./pages/services/AskForWork"));
const MyServiceRequests = lazy(() => import("./pages/services/MyServiceRequests"));
const Advisory = lazy(() => import("./pages/Advisory"));
const Schemes = lazy(() => import("./pages/Schemes"));
const Profile = lazy(() => import("./pages/Profile"));
const ProfileEdit = lazy(() => import("./pages/ProfileEdit"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SplashScreen = lazy(() => import("./pages/SplashScreen"));
const LanguageSelection = lazy(() => import("./pages/LanguageSelection"));
const AuthScreen = lazy(() => import("./pages/AuthScreen"));
const PinAuth = lazy(() => import("./pages/PinAuth"));
const SetPin = lazy(() => import("./pages/SetPin"));
const Activate = lazy(() => import("./pages/Activate"));
const ForgotPin = lazy(() => import("./pages/ForgotPin"));
const LandManagement = lazy(() => import("./pages/LandManagement"));
const AddLand = lazy(() => import("./pages/AddLand"));
const EditLand = lazy(() => import("./pages/EditLand"));
const LandDetails = lazy(() => import("./pages/LandDetails"));
const EnvDiagnostics = lazy(() => import("./pages/EnvDiagnostics"));
const AIChat = lazy(() => import("./pages/AIChat"));
const Analytics = lazy(() => import("./pages/Analytics"));
const AICommunityPage = lazy(() => import("./pages/CommunityPage"));
const CropSelectionTest = lazy(() => import("./pages/CropSelectionTest"));
const Schedule = lazy(() => import("./pages/Schedule"));
const MobileAuth = lazy(() => import("./pages/MobileAuth"));
const NDVIAnalysis = lazy(() => import("./pages/NDVIAnalysis"));
const SoilHealthReport = lazy(() => import("./pages/SoilHealthReport"));
const AIScheduleDashboard = lazy(() => import("./pages/AIScheduleDashboard"));
const VideoReels = lazy(() => import("./pages/VideoReels"));
const ReelsPage = lazy(() => import("./pages/ReelsPage"));
const InstallPWA = lazy(() => import("./pages/InstallPWA"));
const NotificationSettingsPage = lazy(() => import("./pages/NotificationSettingsPage"));
const CropGrowthTracking = lazy(() => import("./pages/CropGrowthTracking"));
const ProactiveAlerts = lazy(() => import("./pages/ProactiveAlerts"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const PermissionOnboarding = lazy(() => import("./pages/PermissionOnboarding"));
// Multi-role identity pages and shells
const ChooseRoles = lazy(() => import("./pages/identity/ChooseRoles"));
const AccountOnboarding = lazy(() => import("./pages/identity/AccountOnboarding"));
const RolesPage = lazy(() => import("./pages/identity/RolesPage"));
const WorkspaceHome = lazy(() => import("./pages/identity/WorkspaceHome"));
const WorkspaceProfile = lazy(() => import("./pages/identity/WorkspaceProfile"));
// Provider Workspace (services, hours, equipment, nursery) — behind the provider_workspace flag
const ProviderHome = lazy(() => import("./pages/provider/ProviderHome"));
const ProviderBusiness = lazy(() => import("./pages/provider/ProviderBusiness"));
const ProviderRequests = lazy(() => import("./pages/provider/ProviderRequests"));
const ProviderProfileForm = lazy(() => import("./pages/provider/ProviderProfileForm"));
const ProviderServices = lazy(() => import("./pages/provider/ProviderServices"));
const ProviderServiceForm = lazy(() => import("./pages/provider/ProviderServiceForm"));
const ProviderHours = lazy(() => import("./pages/provider/ProviderHours"));
const ProviderDaysOff = lazy(() => import("./pages/provider/ProviderDaysOff"));
const ProviderEquipment = lazy(() => import("./pages/provider/ProviderEquipment"));
const ProviderNursery = lazy(() => import("./pages/provider/ProviderNursery"));
const WorkspaceLayout = lazy(() =>
  import("./components/identity/WorkspaceLayout").then((m) => ({ default: m.WorkspaceLayout }))
);

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

// Stores and Services
import { useAuthStore } from "@/stores/authStore";
import { useLanguageStore } from "@/stores/languageStore";
import { toast } from "@/hooks/use-toast";
import { tenantIsolationService } from "@/services/tenantIsolationService";
import { useGlobalRealtimeSync } from "@/hooks/useGlobalRealtimeSync";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import { GoogleMapsProvider } from "@/contexts/GoogleMapsContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// SECURITY (2026-10-06): drop every cached query (lands, chats, schedules,
// entitlements) the moment a farmer logs out so nothing bleeds to the next login.
if (typeof window !== 'undefined') {
  window.addEventListener('ks:auth-logout', () => queryClient.clear());
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { tenant, branding, isLoading: tenantLoading } = useTenant();
  const { checkAuth, requirePin, session } = useAuthStore();
  const { currentLanguage } = useLanguageStore();
  const [isInitializing, setIsInitializing] = useState(true);
  const [currentStep, setCurrentStep] = useState('Initializing...');
  
  // Initialize global real-time sync
  useGlobalRealtimeSync();

  // PWA prompt is now captured in main.tsx BEFORE React loads
  // This useEffect just logs if we already have a captured prompt
  useEffect(() => {
    if (window.__capturedPwaPrompt) {
      console.log('✅ [PWA] Prompt already captured before React mounted');
      console.log('📋 [PWA] Captured at:', window.__pwaPromptCapturedAt ? new Date(window.__pwaPromptCapturedAt).toISOString() : 'unknown');
    } else {
      console.log('⏳ [PWA] No prompt captured yet - waiting for browser event');
    }
  }, []);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // PRODUCTION FIX: Fast startup - proceed immediately with cached data
        const cachedTenantRaw = localStorage.getItem('tenant_config_cache');
        const hasCachedTenant = !!cachedTenantRaw;
        
        // If tenant is still loading but we have cache, use cached tenant for fast startup
        if (tenantLoading && !tenant && hasCachedTenant) {
          try {
            const cached = JSON.parse(cachedTenantRaw!);
            if (cached.data?.id) {
              console.log('🚀 [AppInit] Using cached tenant for fast startup:', cached.data.name);
              // Set tenant context immediately from cache
              tenantIsolationService.setTenantContext(cached.data.id, window.location.hostname);
              // Continue with init - TenantProvider will sync later
            }
          } catch (e) {
            console.warn('⚠️ [AppInit] Cache parse failed, waiting for TenantProvider');
          }
        }
        
        // Only block if no tenant AND no cache (first-time user)
        if (!tenant && !hasCachedTenant) {
          console.log('⏳ [AppInit] First-time user, waiting for tenant...');
          return;
        }

        // Use tenant from TenantProvider or from cache for context setup
        const activeTenant = tenant || (hasCachedTenant ? JSON.parse(cachedTenantRaw!).data : null);
        
        if (!activeTenant?.id) {
          console.log('⏳ [AppInit] No active tenant, waiting...');
          return;
        }
        
        const currentDomain = window.location.hostname;
        console.log('🔐 [Security] Starting secure multi-tenant initialization for:', currentDomain);
        
        // PERFORMANCE FIX: Use requestIdleCallback for ALL non-critical tasks
        const runInBackground = (fn: () => void, delay: number = 0) => {
          if ('requestIdleCallback' in window) {
            requestIdleCallback(() => setTimeout(fn, delay));
          } else {
            setTimeout(fn, delay);
          }
        };
        
        // CRITICAL: Use static manifest.json only - no dynamic API calls
        console.log('📱 [Manifest] Using static /manifest.json (no API calls)');
        
        // STEP 1: Set tenant isolation context (fast, synchronous)
        setCurrentStep('Preparing your workspace...');
        tenantIsolationService.setTenantContext(activeTenant.id, currentDomain);
        
        // Cache tenant primary color for initial loader (non-blocking)
        if (branding?.primary_color) {
          runInBackground(() => {
            localStorage.setItem('tenant_primary_color', branding.primary_color!);
          });
        }
        
        // STEP 2: Initialize tenant-scoped local storage (potentially slow - run in background)
        runInBackground(async () => {
          const { localDB } = await import("@/services/localDB");
          await localDB.initializeWithTenant(activeTenant.id);
        }, 100);
        
        // STEP 3: Check authentication (critical path - must be sync)
        setCurrentStep('Verifying credentials...');
        await checkAuth();
        
        // Validate auth tenant matches current tenant
        const { user, session } = useAuthStore.getState();
        
        if (user?.id) {
          tenantIsolationService.setUserId(user.id);
        }
        
        // Farmer activation (2026-11-25): a farmer belongs to the tenant whose
        // activation code they redeemed, and that is not always the tenant this
        // domain resolves to. Until now a difference here signed the farmer out,
        // which would sign out every activated farmer at the next app start.
        // The farmer's tenant is decided by the server and enforced by the
        // database on every request (the session token). TenantProvider follows
        // the signed-in farmer and loads that tenant; this effect then runs
        // again with it and sets the tenant context and local database above.
        if (session && user?.tenantId && user.tenantId !== activeTenant.id) {
          console.warn('[AppInit] Signed-in farmer belongs to another tenant than the one loaded; TenantProvider is loading it.');
        }
        
        // STEP 4: Start location service in background (non-blocking, delayed)
        setCurrentStep('Almost ready...');
        runInBackground(async () => {
          const LocationService = (await import("@/services/LocationService")).default;
          LocationService.getCurrentLocation(true).catch(() => null);
        }, 2000); // Delay by 2 seconds

        runInBackground(async () => {
          const { preloadAllLocationData } = await import("@/hooks/useLocationPreloader");
          preloadAllLocationData().catch(() => null);
        }, 5000);
        
        // PERFORMANCE FIX: Minimal delay for smooth transition (reduced from 150ms)
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error('🚨 [Security] App initialization failed:', error);
        toast({
          title: "Initialization Error",
          description: "Failed to initialize application. Please refresh.",
          variant: "destructive"
        });
      } finally {
        setIsInitializing(false);
      }
    };

    initializeApp();
  }, [tenant, tenantLoading, checkAuth]);

  // Initialize sync service ONLY when user is authenticated (non-blocking background task)
  useEffect(() => {
    const initializeSync = () => {
      const { user, session: currentSession } = useAuthStore.getState();
      
      // Only run sync if we have both user and valid session
      if (!user?.id || !user?.tenantId || !currentSession) {
        console.log('⏸️ [Sync] Skipping - no authenticated user');
        return;
      }
      
      // CRITICAL FIX: Ensure tenant isolation service has user ID before sync
      const currentContext = tenantIsolationService.validateContext(false);
      if (currentContext.valid && !currentContext.userId) {
        console.log('🔧 [Sync] Adding user ID to tenant context before sync');
        tenantIsolationService.setUserId(user.id);
      }
      
      console.log('▶️ [Sync] Starting background sync for authenticated user:', {
        userId: user.id,
        tenantId: user.tenantId
      });
      
      // Run sync in background without blocking app load
      import("@/services/syncService")
        .then(({ syncService }) => syncService.performSync(false))
        .catch(() => {
          // Silent fail - user will sync on next login or manual refresh
          console.log('[Sync] Background sync skipped - will retry on next interaction');
        });
    };
    
    // Only trigger sync when session is available (after auth completes)
    if (session) {
      initializeSync();
    }
  }, [session]); // Depend on session to ensure auth is complete

  // Note: Theme is now applied by TenantProvider automatically

  // Apply language changes - only if different from current i18n language
  useEffect(() => {
    if (currentLanguage && i18n.language !== currentLanguage) {
      console.log('🌐 [AppInitializer] Syncing language:', {
        from: i18n.language,
        to: currentLanguage
      });
      i18n.changeLanguage(currentLanguage).then(() => {
        console.log('✅ [AppInitializer] Language synced successfully');
      });
    } else if (currentLanguage) {
      console.log('✅ [AppInitializer] Language already in sync:', currentLanguage);
    }
  }, [currentLanguage]);

  // REMOVED: Automatic location permission request
  // Location permission is now requested contextually when user accesses location-dependent features
  // See PermissionManager service and usePermission hook for on-demand permission requests

  return (
    <>
      <AppLoadingProgress isLoading={isInitializing} currentStep={currentStep} />
      <OfflineIndicator />
      <PWAUpdatePrompt />
      {/* Onboarding popups removed — see PermissionOnboarding page + FeatureWalkthrough overlay */}
      {/* PHASE 2 FIX: Single PWA install component */}
      <PWAInstallBanner />
      {children}
    </>
  );
}

// Update router with all routes - wrapped in Suspense for lazy loading
const router = createBrowserRouter([
  {
    path: "/",
    element: <Suspense fallback={<PageLoader />}><SplashScreen /></Suspense>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/index",
    element: <Navigate to="/" replace />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/language-selection",
    element: <Suspense fallback={<PageLoader />}><LanguageSelection /></Suspense>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/permissions",
    element: <Suspense fallback={<PageLoader />}><PermissionOnboarding /></Suspense>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/auth",
    element: <AccountResume><Suspense fallback={<PageLoader />}><AuthScreen /></Suspense></AccountResume>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/mobile-auth",
    element: <Suspense fallback={<PageLoader />}><MobileAuth /></Suspense>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/pin-auth",
    element: <Suspense fallback={<PageLoader />}><PinAuth /></Suspense>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/pin",
    element: <Suspense fallback={<PageLoader />}><PinAuth /></Suspense>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/set-pin",
    element: <Suspense fallback={<PageLoader />}><SetPin /></Suspense>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/forgot-pin",
    element: <Suspense fallback={<PageLoader />}><ForgotPin /></Suspense>,
    errorElement: <RouteErrorBoundary />,
  },
  // Farmer activation: where ProtectedRoute sends a farmer who has not redeemed a code.
  {
    path: "/activate",
    element: <Suspense fallback={<PageLoader />}><Activate /></Suspense>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/app",
    element: (
      <FarmerRoleGate>
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      </FarmerRoleGate>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Suspense fallback={<PageLoader />}><Home /></Suspense> },
      { path: "home", element: <Suspense fallback={<PageLoader />}><Home /></Suspense> },
      { path: "weather", element: <Suspense fallback={<PageLoader />}><Weather /></Suspense> },
      { path: "market", element: <Suspense fallback={<PageLoader />}><Market /></Suspense> },
      { path: "services-near-me", element: <Suspense fallback={<PageLoader />}><ServicesNearMe /></Suspense> },
      { path: "services-near-me/ask", element: <Suspense fallback={<PageLoader />}><AskForWork /></Suspense> },
      { path: "services-near-me/requests", element: <Suspense fallback={<PageLoader />}><MyServiceRequests /></Suspense> },
      { path: "services-near-me/nursery/:accountId", element: <Suspense fallback={<PageLoader />}><NurseryStorePage /></Suspense> },
      { path: "services-near-me/:family", element: <Suspense fallback={<PageLoader />}><ServiceProviders /></Suspense> },
      { path: "advisory", element: <Suspense fallback={<PageLoader />}><Advisory /></Suspense> },
      { path: "schemes", element: <Suspense fallback={<PageLoader />}><Schemes /></Suspense> },
      { path: "profile", element: <Suspense fallback={<PageLoader />}><Profile /></Suspense> },
      { path: "profile/edit", element: <Suspense fallback={<PageLoader />}><ProfileEdit /></Suspense> },
      { path: "lands", element: <Suspense fallback={<PageLoader />}><LandManagement /></Suspense> },
      { path: "lands/add", element: <Suspense fallback={<PageLoader />}><AddLand /></Suspense> },
      { path: "lands/:id/edit", element: <Suspense fallback={<PageLoader />}><EditLand /></Suspense> },
      { path: "lands/:id", element: <Suspense fallback={<PageLoader />}><LandDetails /></Suspense> },
      { path: "lands/:id/soil", element: <Suspense fallback={<PageLoader />}><SoilHealthReport /></Suspense> },
      { path: "lands/:id/ndvi", element: <Suspense fallback={<PageLoader />}><NDVIAnalysis /></Suspense> },
      { path: "diagnostics/environment", element: <Suspense fallback={<PageLoader />}><EnvDiagnostics /></Suspense> },
      { path: "ai-chat", element: <Suspense fallback={<PageLoader />}><AIChat /></Suspense> },
      { path: "chat", element: <Suspense fallback={<PageLoader />}><AIChat /></Suspense> },
      { path: "community", element: <Suspense fallback={<PageLoader />}><AICommunityPage /></Suspense> },
      { path: "analytics", element: <Suspense fallback={<PageLoader />}><Analytics /></Suspense> },
      { path: "test/crop-selection", element: <Suspense fallback={<PageLoader />}><CropSelectionTest /></Suspense> },
      { path: "schedule", element: <Suspense fallback={<PageLoader />}><Schedule /></Suspense> },
      { path: "ai-dashboard", element: <Suspense fallback={<PageLoader />}><AIScheduleDashboard /></Suspense> },
      { path: "ndvi", element: <Suspense fallback={<PageLoader />}><NDVIAnalysis /></Suspense> },
      { path: "videos", element: <Suspense fallback={<PageLoader />}><ReelsPage /></Suspense> },
      { path: "reels", element: <Suspense fallback={<PageLoader />}><ReelsPage /></Suspense> },
      { path: "videos/legacy", element: <Suspense fallback={<PageLoader />}><VideoReels /></Suspense> },
      { path: "notifications/settings", element: <Suspense fallback={<PageLoader />}><NotificationSettingsPage /></Suspense> },
      { path: "crop-growth", element: <Suspense fallback={<PageLoader />}><CropGrowthTracking /></Suspense> },
      { path: "growth-tracking", element: <Suspense fallback={<PageLoader />}><CropGrowthTracking /></Suspense> },
      { path: "proactive-alerts", element: <Suspense fallback={<PageLoader />}><ProactiveAlerts /></Suspense> },
      { path: "subscription", element: <Suspense fallback={<PageLoader />}><SubscriptionPage /></Suspense> },
    ],
  },
  // ── Multi-role identity ────────────────────────────────────────────────
  {
    path: "/choose-roles",
    element: <Suspense fallback={<PageLoader />}><ChooseRoles /></Suspense>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/welcome",
    element: (
      <WorkspaceRoute allowIncomplete>
        <Suspense fallback={<PageLoader />}><AccountOnboarding /></Suspense>
      </WorkspaceRoute>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/roles",
    element: (
      <WorkspaceRoute>
        <Suspense fallback={<PageLoader />}><RolesPage /></Suspense>
      </WorkspaceRoute>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/provider",
    element: (
      <WorkspaceRoute role="SERVICE_PROVIDER">
        <Suspense fallback={<PageLoader />}><WorkspaceLayout role="SERVICE_PROVIDER" /></Suspense>
      </WorkspaceRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<PageLoader />}>
            <ProviderFlagGate fallback={<WorkspaceHome role="SERVICE_PROVIDER" />}><ProviderHome /></ProviderFlagGate>
          </Suspense>
        ),
      },
      { path: "profile", element: <Suspense fallback={<PageLoader />}><WorkspaceProfile /></Suspense> },
      { path: "requests", element: <Suspense fallback={<PageLoader />}><ProviderFlagGate><ProviderRequests /></ProviderFlagGate></Suspense> },
      { path: "business", element: <Suspense fallback={<PageLoader />}><ProviderFlagGate><ProviderBusiness /></ProviderFlagGate></Suspense> },
      { path: "business/profile", element: <Suspense fallback={<PageLoader />}><ProviderFlagGate><ProviderProfileForm /></ProviderFlagGate></Suspense> },
      { path: "business/services", element: <Suspense fallback={<PageLoader />}><ProviderFlagGate><ProviderServices /></ProviderFlagGate></Suspense> },
      { path: "business/services/new", element: <Suspense fallback={<PageLoader />}><ProviderFlagGate><ProviderServiceForm /></ProviderFlagGate></Suspense> },
      { path: "business/services/:serviceId", element: <Suspense fallback={<PageLoader />}><ProviderFlagGate><ProviderServiceForm /></ProviderFlagGate></Suspense> },
      { path: "business/hours", element: <Suspense fallback={<PageLoader />}><ProviderFlagGate><ProviderHours /></ProviderFlagGate></Suspense> },
      { path: "business/days-off", element: <Suspense fallback={<PageLoader />}><ProviderFlagGate><ProviderDaysOff /></ProviderFlagGate></Suspense> },
      { path: "business/equipment", element: <Suspense fallback={<PageLoader />}><ProviderFlagGate><ProviderEquipment /></ProviderFlagGate></Suspense> },
      { path: "business/nursery", element: <Suspense fallback={<PageLoader />}><ProviderFlagGate><ProviderNursery /></ProviderFlagGate></Suspense> },
    ],
  },
  {
    path: "/customer",
    element: (
      <WorkspaceRoute role="CUSTOMER">
        <Suspense fallback={<PageLoader />}><WorkspaceLayout role="CUSTOMER" /></Suspense>
      </WorkspaceRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Suspense fallback={<PageLoader />}><WorkspaceHome role="CUSTOMER" /></Suspense> },
      { path: "profile", element: <Suspense fallback={<PageLoader />}><WorkspaceProfile /></Suspense> },
    ],
  },
  {
    path: "/install",
    element: <Suspense fallback={<PageLoader />}><InstallPWA /></Suspense>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "*",
    element: <Suspense fallback={<PageLoader />}><NotFound /></Suspense>,
  }
]);

export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>
        <TenantProvider>
          <GoogleMapsProvider>
            <QueryClientProvider client={queryClient}>
              <TooltipProvider>
                <AppInitializer>
                  <RouterProvider router={router} />
                </AppInitializer>
                <Toaster />
                <Sonner />
                {/* PHASE 2 FIX: Removed duplicate PWA components */}
                {/* PWAInstallBanner is rendered in AppInitializer */}
              </TooltipProvider>
            </QueryClientProvider>
          </GoogleMapsProvider>
        </TenantProvider>
      </ErrorBoundary>
    </I18nextProvider>
  );
}