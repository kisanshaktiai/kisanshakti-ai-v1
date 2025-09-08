import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/config";

// Components
import ErrorBoundary from "@/components/ErrorBoundary";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Pages
import Home from "./pages/Home";
import Login from "./pages/Login";
import Weather from "./pages/Weather";
import Market from "./pages/Market";
import Advisory from "./pages/Advisory";
import Schemes from "./pages/Schemes";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

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
  const { fetchTenant } = useTenantStore();
  const { checkAuth } = useAuthStore();
  const { currentLanguage } = useLanguageStore();

  useEffect(() => {
    // Initialize tenant
    fetchTenant();
    
    // Check authentication status
    checkAuth();
  }, []);

  useEffect(() => {
    // Apply language
    i18n.changeLanguage(currentLanguage);
  }, [currentLanguage]);

  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppInitializer>
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                
                {/* Protected Routes */}
                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route index element={<Home />} />
                  <Route path="/weather" element={<Weather />} />
                  <Route path="/market" element={<Market />} />
                  <Route path="/advisory" element={<Advisory />} />
                  <Route path="/schemes" element={<Schemes />} />
                  <Route path="/profile" element={<Profile />} />
                </Route>

                {/* Fallback Routes */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppInitializer>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </ErrorBoundary>
);

export default App;
