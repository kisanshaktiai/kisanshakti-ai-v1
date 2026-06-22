import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('❌ [ErrorBoundary] Caught error:', error);
    console.error('❌ [ErrorBoundary] Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/app';
  };

  private handleClearCacheAndReload = () => {
    // Clear all caches for fresh start
    localStorage.removeItem('tenant_config_cache');
    localStorage.removeItem('white_label_config');
    localStorage.removeItem('language-storage');
    
    // Clear service worker caches
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    
    // Signal service worker to clear
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' });
    }
    
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isModuleError = this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
                           this.state.error?.message?.includes('Loading chunk') ||
                           this.state.error?.message?.includes('Loading CSS chunk');
      
      return (
        <div className="min-h-mobile-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
          <Card className="max-w-md w-full p-6 text-center space-y-4 shadow-xl">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                {isModuleError ? 'App Update Required' : 'Something went wrong'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isModuleError 
                  ? 'A new version of the app is available. Please refresh to get the latest version.'
                  : 'The application encountered an error. Please try refreshing the page.'}
              </p>
              
              {/* Error details for debugging */}
              {this.state.error && (
                <details className="mt-4 text-left">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    Technical Details
                  </summary>
                  <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                    {this.state.error.toString()}
                  </pre>
                </details>
              )}
            </div>

            <div className="space-y-2">
              <Button onClick={this.handleReset} className="w-full" size="lg">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Page
              </Button>
              
              <div className="flex gap-2">
                <Button onClick={this.handleGoHome} variant="outline" className="flex-1">
                  <Home className="w-4 h-4 mr-2" />
                  Go Home
                </Button>
                
                <Button onClick={this.handleClearCacheAndReload} variant="outline" className="flex-1">
                  Clear Cache
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;