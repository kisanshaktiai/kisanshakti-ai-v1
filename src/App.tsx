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

// Stores and Services
import { useTenantStore } from "@/stores/tenantStore";
import { useAuthStore } from "@/stores/authStore";
import { useLanguageStore } from "@/stores/languageStore";
import LocationService from "@/services/LocationService";
import { useLocationPermission } from "@/hooks/useLocationPermission";
import { WhiteLabelService } from "@/services/WhiteLabelService";
import { useLocationPreloader } from "@/hooks/useLocationPreloader";

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
    };
    
    initializeApp();
    
    // Listen for online/offline events
    const handleOnline = () => {
      console.log('App is online - refreshing white-label config');
      const whiteLabelService = WhiteLabelService.getInstance();
      whiteLabelService.forceRefresh();
    };
    
    const handleOffline = () => {
      console.log('App is offline - using cached data');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchTenant, checkAuth, requirePin]);

  // Apply theme whenever tenant changes
  useEffect(() => {
    if (tenant?.whiteLabel) {
      applyWhiteLabelTheme(tenant.whiteLabel);
    }
  }, [tenant, applyWhiteLabelTheme]);

  useEffect(() => {
    // Apply language
    i18n.changeLanguage(currentLanguage);
  }, [currentLanguage]);

  // Handle location permission on app initialization
  useEffect(() => {
    const initializeLocation = async () => {
      // Check if we've already requested permission in this session
      const hasRequested = sessionStorage.getItem('location_permission_requested');
      if (hasRequested) {
        setHasRequestedPermission(true);
        return;
      }

      // Check if user is authenticated
      if (!session) return;

      // Check current permission status
      const isGranted = await LocationService.isLocationPermissionGranted();
      
      if (!isGranted && permissionStatus === 'prompt') {
        // Show custom dialog for first-time users
        setShowLocationDialog(true);
      } else if (isGranted) {
        // Start location tracking if permission is already granted
        LocationService.startLocationTracking();
      }
    };

    // Wait a bit after app loads to show location dialog
    const timer = setTimeout(() => {
      initializeLocation();
    }, 2000);

    return () => clearTimeout(timer);
  }, [session, permissionStatus]);

  const handleLocationAllow = async () => {
    setShowLocationDialog(false);
    sessionStorage.setItem('location_permission_requested', 'true');
    setHasRequestedPermission(true);
    
    const status = await requestPermission();
    if (status === 'granted') {
      // Start location tracking
      LocationService.startLocationTracking();
      // Get initial location
      await LocationService.getCurrentLocation(true);
    }
  };

  const handleLocationDeny = () => {
    setShowLocationDialog(false);
    sessionStorage.setItem('location_permission_requested', 'true');
    setHasRequestedPermission(true);
  };

  return (
    <>
      {children}
      <LocationPermissionDialog
        open={showLocationDialog}
        onOpenChange={setShowLocationDialog}
        onAllow={handleLocationAllow}
        onDeny={handleLocationDeny}
      />
    </>
  );
}

// Create router with future flags to resolve React Router v7 warnings
const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <AppInitializer><SplashScreen /></AppInitializer>,
    },
    {
      path: "/splash",
      element: <AppInitializer><SplashScreen /></AppInitializer>,
    },
    {
      path: "/language-selection",
      element: <AppInitializer><LanguageSelection /></AppInitializer>,
    },
    {
      path: "/auth",
      element: <AppInitializer><AuthScreen /></AppInitializer>,
    },
    {
      path: "/pin",
      element: <AppInitializer><PinAuth /></AppInitializer>,
    },
    {
      path: "/set-pin",
      element: <AppInitializer><SetPin /></AppInitializer>,
    },
    {
      path: "/crop-test",
      element: <AppInitializer><CropSelectionTest /></AppInitializer>,
    },
    {
      path: "/app",
      element: (
        <AppInitializer>
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        </AppInitializer>
      ),
      children: [
        {
          index: true,
          element: <Home />,
        },
        {
          path: "weather",
          element: <Weather />,
        },
        {
          path: "market",
          element: <Market />,
        },
        {
          path: "advisory",
          element: <Advisory />,
        },
        {
          path: "schemes",
          element: <Schemes />,
        },
        {
          path: "profile",
          element: <Profile />,
        },
        {
          path: "profile/edit",
          element: <ProfileEdit />,
        },
        {
          path: "lands",
          element: <LandManagement />,
        },
        {
          path: "schedule",
          element: <Schedule />,
        },
        {
          path: "lands/add",
          element: <AddLand />,
        },
        {
          path: "lands/:id/edit",
          element: <EditLand />,
        },
        {
          path: "lands/:id",
          element: <LandDetails />,
        },
        {
          path: "lands/:id/gallery",
          element: <div>Gallery Page - Coming Soon</div>,
        },
        {
          path: "lands/:id/activities",
          element: <div>Activities Page - Coming Soon</div>,
        },
        {
          path: "chat",
          element: <AIChat />,
        },
        {
          path: "social",
          element: <Social />,
        },
        {
          path: "analytics",
          element: <Analytics />,
        },
        {
          path: "community/:id",
          element: <CommunityPage />,
        },
        {
          path: "community/:id/chat",
          element: <ModernCommunityChatRoom />,
        },
      ],
    },
    {
      path: "*",
      element: <AppInitializer><NotFound /></AppInitializer>,
    },
  ],
  {
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  }
);

const App = () => (
  <ErrorBoundary>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </ErrorBoundary>
);

export default App;