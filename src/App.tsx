import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/config";

// Components
import ErrorBoundary from "@/components/ErrorBoundary";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LocationPermissionDialog } from "@/components/LocationPermissionDialog";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import { AppLoadingProgress } from "@/components/AppLoadingProgress";

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

// Stores and Services
import { useTenantStore } from "@/stores/tenantStore";
import { useAuthStore } from "@/stores/authStore";
import { useLanguageStore } from "@/stores/languageStore";
import { toast } from "@/hooks/use-toast";
import LocationService from "@/services/LocationService";
import { useLocationPermission } from "@/hooks/useLocationPermission";
import { WhiteLabelService } from "@/services/WhiteLabelService";
import { useLocationPreloader } from "@/hooks/useLocationPreloader";
import { syncService } from "@/services/syncService";
import { localDB } from "@/services/localDB";
import { tenantIsolationService } from "@/services/tenantIsolationService";
import { useGlobalRealtimeSync } from "@/hooks/useGlobalRealtimeSync";

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
  const { fetchTenant, tenant, applyWhiteLabelTheme, listenForTenantChanges } = useTenantStore();
  const { checkAuth, requirePin, session } = useAuthStore();
  const { currentLanguage } = useLanguageStore();
  const { permissionStatus, requestPermission } = useLocationPermission();
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [hasRequestedPermission, setHasRequestedPermission] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [currentStep, setCurrentStep] = useState('Initializing...');
  
  // Preload location data for faster form loading
  useLocationPreloader();

  // Initialize global real-time sync
  useGlobalRealtimeSync();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Get current domain for security validation
        const currentDomain = window.location.hostname;
        console.log('🔐 [Security] Starting secure multi-tenant initialization for:', currentDomain);
        
        // Set dynamic manifest link immediately
        const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
        if (manifestLink) {
          manifestLink.href = `https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/generate-manifest?domain=${encodeURIComponent(currentDomain)}`;
        }
        
        // STEP 1: TENANT RESOLUTION (BLOCKING - CRITICAL SECURITY)
        setCurrentStep('Identifying tenant...');
        await fetchTenant();
        
        const { tenant: loadedTenant } = useTenantStore.getState();
        
        if (!loadedTenant) {
          console.error('🚨 [Security] CRITICAL: Tenant not found for domain:', currentDomain);
          throw new Error('Tenant not found for domain: ' + currentDomain);
        }
        
        console.log('✅ [Security] Tenant loaded:', {
          id: loadedTenant.id,
          name: loadedTenant.name,
          domain: currentDomain
        });
        
        // CRITICAL: Set tenant isolation context for all services
        tenantIsolationService.setTenantContext(
          loadedTenant.id,
          currentDomain
        );
        
        // STEP 2: INITIALIZE TENANT-SCOPED LOCAL STORAGE (BLOCKING)
        setCurrentStep('Initializing secure storage...');
        await localDB.initializeWithTenant(loadedTenant.id);
        
        // STEP 3: CHECK AUTH WITH TENANT CONTEXT VALIDATION (BLOCKING)
        setCurrentStep('Checking authentication...');
        await checkAuth();
        
        // CRITICAL SECURITY: Validate auth tenant matches current tenant
        const { user, session } = useAuthStore.getState();
        
        // Update tenant isolation service with user ID after auth
        if (user?.id) {
          tenantIsolationService.setUserId(user.id);
        }
        
        if (session && user?.tenantId !== loadedTenant.id) {
          console.error('🚨 [Security] TENANT MISMATCH DETECTED! Force logout.', {
            sessionTenant: user?.tenantId,
            currentTenant: loadedTenant.id,
            userId: user?.id
          });
          // Force logout for security
          useAuthStore.getState().logout();
          tenantIsolationService.clearContext();
          await localDB.clearAll();
        }
        
        // STEP 4: NON-BLOCKING TASKS (Background)
        setCurrentStep('Finalizing...');
        listenForTenantChanges();
        LocationService.getCurrentLocation(true).catch(() => null);
        
        // Small delay to show final step
        await new Promise(resolve => setTimeout(resolve, 300));
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
  }, []);

  // Initialize sync service ONLY when user is authenticated (non-blocking background task)
  useEffect(() => {
    const initializeSync = () => {
      const { user } = useAuthStore.getState();
      
      // Silent skip if no user
      if (!user?.id || !user?.tenantId) {
        return;
      }
      
      // Run sync in background without blocking app load
      syncService.performSync(false).catch(() => {
        // Silent fail - user will sync on next login or manual refresh
        console.log('[Sync] Background sync skipped - will retry on next interaction');
      });
    };
    
    // Start sync immediately in background (non-blocking)
    initializeSync();
  }, []);

  // Apply white label theme whenever tenant changes
  useEffect(() => {
    if (tenant?.whiteLabel) {
      console.log('🎨 [App] Applying white label theme for tenant:', tenant.name);
      console.log('🎨 [App] Theme config:', {
        logo: tenant.whiteLabel.brand_identity?.logo_url,
        primary_color: tenant.whiteLabel.brand_identity?.primary_color,
        company_name: tenant.whiteLabel.brand_identity?.company_name
      });
      applyWhiteLabelTheme(tenant.whiteLabel);
    }
  }, [tenant, applyWhiteLabelTheme]);

  // Apply language changes
  useEffect(() => {
    if (currentLanguage && i18n.language !== currentLanguage) {
      i18n.changeLanguage(currentLanguage);
    }
  }, [currentLanguage]);

  // Check and request location permission after auth (only once per session)
  useEffect(() => {
    const checkPermissions = async () => {
      // Check if we've already shown the dialog in this browser session
      const hasShownDialog = sessionStorage.getItem('location-dialog-shown');
      if (hasShownDialog) return;

      const storedSession = localStorage.getItem('auth-storage');
      
      if (storedSession) {
        try {
          const sessionData = JSON.parse(storedSession);
          if (sessionData?.state?.session?.farmerId && 
              sessionData?.state?.session?.isPinVerified &&
              !hasRequestedPermission) {
            
            // Wait a bit to ensure app is loaded
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check if we need to show location permission dialog
            if (permissionStatus === 'prompt' || permissionStatus === 'denied') {
              setShowLocationDialog(true);
              setHasRequestedPermission(true);
              sessionStorage.setItem('location-dialog-shown', 'true');
            }
          }
        } catch (error) {
          console.error('Error parsing session:', error);
        }
      }
    };

    checkPermissions();
  }, [permissionStatus, hasRequestedPermission]);

  const handleLocationPermissionRequest = async () => {
    const result = await requestPermission();
    setShowLocationDialog(false);
  };

  return (
    <>
      <AppLoadingProgress isLoading={isInitializing} currentStep={currentStep} />
      <OfflineIndicator />
      <PWAUpdatePrompt />
      {children}
      <LocationPermissionDialog 
        open={showLocationDialog}
        onOpenChange={setShowLocationDialog}
        onAllow={handleLocationPermissionRequest}
        onDeny={() => setShowLocationDialog(false)}
      />
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
      { path: "lands/edit/:id", element: <EditLand /> },
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
    ],
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
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AppInitializer>
              <RouterProvider router={router} />
            </AppInitializer>
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </I18nextProvider>
  );
}