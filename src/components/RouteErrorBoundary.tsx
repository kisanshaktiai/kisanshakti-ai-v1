import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, Home, ArrowLeft, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { t } = useTranslation();

  let errorMessage = t('common.somethingWentWrong') || 'Something went wrong';
  let errorStatus = '500';
  let errorTitle = 'Error';

  if (isRouteErrorResponse(error)) {
    errorStatus = String(error.status);
    errorTitle = error.statusText || 'Error';
    
    if (error.status === 404) {
      errorMessage = t('error.pageNotFound') || 'The page you are looking for does not exist';
      errorTitle = 'Page Not Found';
    } else if (error.status === 403) {
      errorMessage = t('error.accessDenied') || 'You do not have permission to access this page';
      errorTitle = 'Access Denied';
    } else if (error.status === 500) {
      errorMessage = t('error.serverError') || 'An internal server error occurred';
      errorTitle = 'Server Error';
    }
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  const handleGoHome = () => {
    navigate('/app');
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-subtle">
      <Card className="max-w-md w-full shadow-elegant">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {errorStatus} - {errorTitle}
          </CardTitle>
          <CardDescription className="mt-2 text-base">
            {errorMessage}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={handleGoHome}
            className="w-full"
            variant="default"
          >
            <Home className="w-4 h-4 mr-2" />
            {t('common.goHome') || 'Go to Dashboard'}
          </Button>
          
          <div className="flex gap-2">
            <Button
              onClick={handleGoBack}
              className="flex-1"
              variant="outline"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('common.goBack') || 'Go Back'}
            </Button>
            
            <Button
              onClick={handleRefresh}
              className="flex-1"
              variant="outline"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('common.refresh') || 'Refresh'}
            </Button>
          </div>

          {/* Debug info in development */}
          {import.meta.env.DEV && error instanceof Error && (
            <details className="mt-4 p-3 bg-muted rounded-lg text-xs">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                Debug Information
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">
                {error.stack}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}