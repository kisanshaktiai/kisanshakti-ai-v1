import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/config";
import { getSupabaseFunctionUrl } from "@/config/supabase";

// Components
import ErrorBoundary from "@/components/ErrorBoundary";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FirstRunOnboardingController } from "@/components/onboarding/FirstRunOnboardingController";
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

// Pages
import Home from "./pages/Home";
import Weather from "./pages/Weather";
import Market from "./pages/Market";
import Advisory from "./pages/Advisory";
import Schemes from "./pages/Schemes";
import Profile from "./pages/Profile";
import ProfileEdit from "./pages/ProfileEdit";
import NotFound from "./pages/NotFound";
import SplashScreen from "./pages/SplashScreen";
import LanguageSelection from "./pages/LanguageSelection";
import AuthScreen from "./pages/AuthScreen";
import PinAuth from "./pages/PinAuth";
import SetPin from "./pages/SetPin";
import LandManagement from "./pages/LandManagement";
import AddLand from "./pages/AddLand";
import EditLand from "./pages/EditLand";
import LandDetails from "./pages/LandDetails";
import AIChat from "./pages/AIChat";
import Social from "./pages/Social";
import Analytics from "./pages/Analytics";
import { CommunityPage } from "./components/social/CommunityPage";
import { ModernCommunityChatRoom } from "./components/social/ModernCommunityChatRoom";
import CropSelectionTest from "./pages/CropSelectionTest";
import Schedule from "./pages/Schedule";
import MobileAuth from "./pages/MobileAuth";
import NDVIAnalysis from "./pages/NDVIAnalysis";
import SoilHealthReport from "./pages/SoilHealthReport";
import AIScheduleDashboard from "./pages/AIScheduleDashboard";
import VideoReels from "./pages/VideoReels";
import InstallPWA from "./pages/InstallPWA";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";

// Stores and Services
import { useAuthStore } from "@/stores/authStore";
import { useLanguageStore } from "@/stores/languageStore";
import { toast } from "@/hooks/use-toast";
import LocationService from "@/services/LocationService";
// Removed: useLocationPermission - now using contextual PermissionManager
import { WhiteLabelService } from "@/services/WhiteLabelService";
import { useLocationPreloader } from "@/hooks/useLocationPreloader";
import { syncService } from "@/services/syncService";
import { localDB } from "@/services/localDB";
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

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { tenant, branding, isLoading: tenantLoading } = useTenant();
  const { checkAuth, requirePin, session } = useAuthStore();
  const { currentLanguage } = useLanguageStore();
  const [isInitializing, setIsInitializing] = useState(true);
  const [currentStep, setCurrentStep] = useState('Initializing...');
  
  // Preload location data for faster form loading
  useLocationPreloader();

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
        // Wait for TenantProvider to load tenant data
        if (tenantLoading || !tenant) {
          console.log('⏳ [AppInit] Waiting for TenantProvider to load tenant...');
          return;
        }

        const currentDomain = window.location.hostname;
        console.log('🔐 [Security] Starting secure multi-tenant initialization for:', currentDomain);
        console.log('✅ [Security] Tenant loaded from TenantProvider:', {
          id: tenant.id,
          name: tenant.name,
          domain: currentDomain
        });
        
        // Helper function for non-blocking tasks
        const runInBackground = (fn: () => void) => {
          if ('requestIdleCallback' in window) {
            requestIdleCallback(fn);
          } else {
            setTimeout(fn, 0);
          }
        };
        
        // CRITICAL: Use static manifest.json only - no dynamic API calls
        // This prevents 429 rate limiting errors and ensures PWA installability
        console.log('📱 [Manifest] Using static /manifest.json (no API calls)');
        
        // STEP 1: Set tenant isolation context for all services (fast)
        setCurrentStep('Preparing your workspace...');
        tenantIsolationService.setTenantContext(tenant.id, currentDomain);
        
        // Cache tenant primary color for initial loader
        if (branding?.primary_color) {
          localStorage.setItem('tenant_primary_color', branding.primary_color);
        }
        
        // STEP 2: Initialize tenant-scoped local storage (fast)
        await localDB.initializeWithTenant(tenant.id);
        
        // STEP 3: Check authentication with tenant context validation (potentially slow)
        setCurrentStep('Verifying credentials...');
        await checkAuth();
        
        // Validate auth tenant matches current tenant
        const { user, session } = useAuthStore.getState();
        
        if (user?.id) {
          tenantIsolationService.setUserId(user.id);
        }
        
        if (session && user?.tenantId !== tenant.id) {
          console.error('🚨 [Security] TENANT MISMATCH DETECTED! Force logout.', {
            sessionTenant: user?.tenantId,
            currentTenant: tenant.id,
            userId: user?.id
          });
          useAuthStore.getState().logout();
          tenantIsolationService.clearContext();
          await localDB.clearAll();
        }
        
        // STEP 4: Start location service in background (non-blocking)
        setCurrentStep('Almost ready...');
        runInBackground(() => {
          LocationService.getCurrentLocation(true).catch(() => null);
        });
        
        // Minimal delay for smooth transition
        await new Promise(resolve => setTimeout(resolve, 150));
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
      syncService.performSync(false).catch(() => {
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
      {/* PHASE 1 FIX: Single onboarding controller - no duplicates */}
      <FirstRunOnboardingController />
      {/* PHASE 2 FIX: Single PWA install component */}
      <PWAInstallBanner />
      {children}
    </>
  );
}

// Update router with all routes
const router = createBrowserRouter([
  {
    path: "/",
    element: <SplashScreen />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/language-selection",
    element: <LanguageSelection />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/auth",
    element: <AuthScreen />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/mobile-auth",
    element: <MobileAuth />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/pin-auth",
    element: <PinAuth />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/pin",
    element: <PinAuth />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/set-pin",
    element: <SetPin />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/app",
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Home /> },
      { path: "weather", element: <Weather /> },
      { path: "market", element: <Market /> },
      { path: "advisory", element: <Advisory /> },
      { path: "schemes", element: <Schemes /> },
      { path: "profile", element: <Profile /> },
      { path: "profile/edit", element: <ProfileEdit /> },
      { path: "lands", element: <LandManagement /> },
      { path: "lands/add", element: <AddLand /> },
      { path: "lands/:id/edit", element: <EditLand /> },
      { path: "lands/:id", element: <LandDetails /> },
      { path: "lands/:id/soil", element: <SoilHealthReport /> },
      { path: "lands/:id/ndvi", element: <NDVIAnalysis /> },
      { path: "ai-chat", element: <AIChat /> },
      { path: "chat", element: <AIChat /> }, // Alias for ai-chat
      { path: "social", element: <Social /> },
      { path: "social/community/:communityId", element: <CommunityPage /> },
      { path: "social/community/:communityId/chat/:channelId", element: <ModernCommunityChatRoom /> },
      { path: "analytics", element: <Analytics /> },
      { path: "test/crop-selection", element: <CropSelectionTest /> },
      { path: "schedule", element: <Schedule /> },
      { path: "ai-dashboard", element: <AIScheduleDashboard /> },
      { path: "ndvi", element: <NDVIAnalysis /> },
      { path: "videos", element: <VideoReels /> },
      { path: "notifications/settings", element: <NotificationSettingsPage /> },
    ],
  },
  {
    path: "/install",
    element: <InstallPWA />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "*",
    element: <NotFound />,
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