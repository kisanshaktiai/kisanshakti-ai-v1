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
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LocationPermissionDialog } from "@/components/LocationPermissionDialog";
import { OfflineIndicator } from "@/components/OfflineIndicator";

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

// Stores and Services
import { useTenantStore } from "@/stores/tenantStore";
import { useAuthStore } from "@/stores/authStore";
import { useLanguageStore } from "@/stores/languageStore";
import LocationService from "@/services/LocationService";
import { useLocationPermission } from "@/hooks/useLocationPermission";
import { WhiteLabelService } from "@/services/WhiteLabelService";
import { useLocationPreloader } from "@/hooks/useLocationPreloader";
import { syncService } from "@/services/syncService";
import { localDB } from "@/services/localDB";

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
  
  // Preload location data for faster form loading
  useLocationPreloader();

  useEffect(() => {
    // Initialize app with performance optimization
    const initializeApp = async () => {
      // Initialize local database
      await localDB.initialize();
      
      // Start fetching tenant data
      const tenantPromise = fetchTenant();
      
      // Check authentication status in parallel
      // This will restore auth state from localStorage if it exists
      const authPromise = checkAuth();
      
      // Fetch initial GPS location when app starts
      const locationPromise = LocationService.getCurrentLocation(true).then(location => {
        if (location) {
          console.log('Initial location fetched:', location);
        }
      });
      
      // Wait for critical tasks
      await Promise.all([tenantPromise, authPromise, locationPromise]);
      
      // If there's an existing session, require PIN verification
      if (session && session.isPinVerified) {
        requirePin();
      }
      
      // Start listening for tenant and theme changes
      listenForTenantChanges();
      
      // Initialize sync service
      if (session?.farmerId && tenant?.id) {
        syncService.performSync(false).catch(console.error);
      }
    };

    initializeApp();
  }, []);

  // Apply white label theme whenever tenant changes
  useEffect(() => {
    if (tenant) {
      const whiteLabelConfig = (tenant as any).white_label_config || {};
      applyWhiteLabelTheme(whiteLabelConfig);
    }
  }, [tenant, applyWhiteLabelTheme]);

  // Apply language changes
  useEffect(() => {
    if (currentLanguage && i18n.language !== currentLanguage) {
      i18n.changeLanguage(currentLanguage);
    }
  }, [currentLanguage]);

  // Check and request location permission after auth
  useEffect(() => {
    const checkPermissions = async () => {
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
      <OfflineIndicator />
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
    path: "/splash",
    element: <SplashScreen />,
  },
  {
    path: "/language-selection",
    element: <LanguageSelection />,
  },
  {
    path: "/auth",
    element: <AuthScreen />,
  },
  {
    path: "/mobile-auth",
    element: <MobileAuth />,
  },
  {
    path: "/pin-auth",
    element: <PinAuth />,
  },
  {
    path: "/pin",
    element: <PinAuth />,
  },
  {
    path: "/set-pin",
    element: <SetPin />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Home /> },
      { path: "weather", element: <Weather /> },
      { path: "market", element: <Market /> },
      { path: "advisory", element: <Advisory /> },
      { path: "schemes", element: <Schemes /> },
      { path: "profile", element: <Profile /> },
      { path: "profile/edit", element: <ProfileEdit /> },
      { path: "land", element: <LandManagement /> },
      { path: "land/add", element: <AddLand /> },
      { path: "land/edit/:id", element: <EditLand /> },
      { path: "land/:id", element: <LandDetails /> },
      { path: "ai-chat", element: <AIChat /> },
      { path: "social", element: <Social /> },
      { path: "social/community/:communityId", element: <CommunityPage /> },
      { path: "social/community/:communityId/chat/:channelId", element: <ModernCommunityChatRoom /> },
      { path: "analytics", element: <Analytics /> },
      { path: "test/crop-selection", element: <CropSelectionTest /> },
      { path: "schedule", element: <Schedule /> },
    ],
  },
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