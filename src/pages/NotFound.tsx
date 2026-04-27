import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-mobile-screen items-center justify-center bg-background">
      <div className="text-center px-4">
        <h1 className="mb-4 text-6xl font-bold text-primary">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">
          {t('error.notFound.title', 'Oops! Page not found')}
        </p>
        <p className="mb-8 text-sm text-muted-foreground max-w-md mx-auto">
          {t('error.notFound.description', 'The page you are looking for might have been removed or is temporarily unavailable.')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="default" size="lg">
            <Link to="/app/home" className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              {t('common.returnToHome', 'Return to Home')}
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/app" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t('common.goBack', 'Go Back')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
