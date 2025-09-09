import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isPinRequired, isLoading, validateSession, session } = useAuthStore();
  const { hasSelectedLanguage } = useAuthFlowStore();
  const location = useLocation();

  // Validate session on mount and when session changes
  useEffect(() => {
    console.log('ProtectedRoute: Validating session', { session, isAuthenticated, isPinRequired });
    validateSession();
  }, [validateSession, session]);

  // Debug logs
  useEffect(() => {
    console.log('ProtectedRoute state:', { 
      isAuthenticated, 
      isPinRequired, 
      hasSelectedLanguage, 
      session,
      location: location.pathname 
    });
  }, [isAuthenticated, isPinRequired, hasSelectedLanguage, session, location]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If PIN is required, redirect to PIN entry
  if (isPinRequired && session) {
    console.log('ProtectedRoute: Redirecting to PIN entry');
    return <Navigate to="/pin" state={{ from: location }} replace />;
  }

  // If not authenticated, check language selection
  if (!isAuthenticated) {
    console.log('ProtectedRoute: Not authenticated, checking language');
    if (!hasSelectedLanguage) {
      return <Navigate to="/language-selection" state={{ from: location }} replace />;
    }
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  console.log('ProtectedRoute: User authenticated, showing protected content');
  return <>{children}</>;
}