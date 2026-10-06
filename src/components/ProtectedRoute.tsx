import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { Loader2 } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isPinRequired, isLoading, validateSession, session, checkAuth } = useAuthStore();
  const { hasSelectedLanguage, hasCompletedSplash } = useAuthFlowStore();
  const location = useLocation();
  const isOnline = useOfflineStatus();

  // Check for existing auth on mount
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Try to restore auth from storage
      checkAuth();
    }
  }, [checkAuth, isLoading, isAuthenticated]);

  // Validate session on mount and when session changes
  useEffect(() => {
    // Only validate if we have auth state loaded
    if (!isLoading && isAuthenticated) {
      console.log('ProtectedRoute: Validating session', { 
        session, 
        isAuthenticated, 
        isPinRequired,
        sessionPinVerified: session?.isPinVerified,
        isOnline
      });
      const isValid = validateSession();
      console.log('Session validation result:', isValid);
    }
  }, [validateSession, session, isLoading, isAuthenticated, isOnline]);

  // Debug logs
  useEffect(() => {
    console.log('ProtectedRoute state:', { 
      isAuthenticated, 
      isPinRequired, 
      hasSelectedLanguage, 
      session,
      location: location.pathname,
      isOnline
    });
  }, [isAuthenticated, isPinRequired, hasSelectedLanguage, session, location, isOnline]);

  if (isLoading) {
    return (
      <div className="min-h-mobile-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If PIN is required, redirect to PIN entry
  if (isPinRequired && session) {
    console.log('ProtectedRoute: Redirecting to PIN entry');
    return <Navigate to="/pin" state={{ from: location }} replace />;
  }

  // If not authenticated, check if we're offline with cached data
  if (!isAuthenticated) {
    // Check if there's cached auth data for offline mode
    // SECURITY (2026-10-06): only a persisted, PIN-verified session counts.
    // The bare presence of 'auth-storage' (which survives logout with user=null)
    // or 'offline_auth_data' (PIN cache — still requires PIN entry) must not open
    // protected screens offline.
    let hasVerifiedCachedSession = false;
    try {
      const st = JSON.parse(localStorage.getItem('auth-storage') || 'null')?.state;
      hasVerifiedCachedSession = !!(st?.user?.id && st?.session?.isPinVerified);
    } catch { /* corrupt cache → not authenticated */ }

    if (!isOnline && hasVerifiedCachedSession) {
      console.log('ProtectedRoute: Offline mode with cached auth, allowing access');
      
      // Try to restore auth if not already restoring
      if (!isLoading) {
        checkAuth();
      }
      
      // Allow rendering while auth is being restored
      return <>{children}</>;
    }
    
    // If online but still loading auth, wait
    if (isLoading) {
      return (
        <div className="min-h-mobile-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }
    
    // Redirect to splash screen to start proper auth flow
    console.log('ProtectedRoute: Not authenticated, redirecting to splash');
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  console.log('ProtectedRoute: User authenticated, showing protected content');
  return <>{children}</>;
}