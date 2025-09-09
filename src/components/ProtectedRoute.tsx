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
    validateSession();
  }, [validateSession, session]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // If PIN is required, redirect to PIN entry
  if (isPinRequired && session) {
    return <Navigate to="/pin" state={{ from: location }} replace />;
  }

  // If not authenticated, check language selection
  if (!isAuthenticated) {
    if (!hasSelectedLanguage) {
      return <Navigate to="/language-selection" state={{ from: location }} replace />;
    }
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}