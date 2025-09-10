import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/config";

// Components
import ErrorBoundary from "@/components/ErrorBoundary";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

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
import LandDetails from "./pages/LandDetails";
import AIChat from "./pages/AIChat";

// Stores
import { useTenantStore } from "@/stores/tenantStore";
import { useAuthStore } from "@/stores/authStore";
import { useLanguageStore } from "@/stores/languageStore";

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
  const { fetchTenant, tenant, applyWhiteLabelTheme } = useTenantStore();
  const { checkAuth, requirePin, session } = useAuthStore();
  const { currentLanguage } = useLanguageStore();

  useEffect(() => {
    // Initialize tenant
    fetchTenant();
    
    // Check authentication status and require PIN on app open
    checkAuth();
    
    // If there's an existing session, require PIN verification
    if (session && session.isPinVerified) {
      requirePin();
    }
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

  return <>{children}</>;
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
          path: "lands/add",
          element: <AddLand />,
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