import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MapPin, Navigation, CloudRain, Sprout } from 'lucide-react';

interface LocationPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAllow: () => void;
  onDeny: () => void;
}

export const LocationPermissionDialog: React.FC<LocationPermissionDialogProps> = ({
  open,
  onOpenChange,
  onAllow,
  onDeny,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Navigation className="h-10 w-10 text-primary" />
          </div>
          <AlertDialogTitle className="text-center text-xl">
            Enable Location Services
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center space-y-4">
            <p className="text-base">
              Allow Kisan Shakti to access your location for enhanced features:
            </p>
            <div className="text-left space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <CloudRain className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Accurate Weather Updates</p>
                  <p className="text-sm text-muted-foreground">Get real-time weather for your exact location</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Sprout className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Personalized Agricultural Insights</p>
                  <p className="text-sm text-muted-foreground">Receive crop recommendations based on your region</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Local Market Prices</p>
                  <p className="text-sm text-muted-foreground">Find best prices at nearby markets</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Your location data is stored locally and never shared without your permission.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel onClick={onDeny} className="w-full sm:w-auto">
            Not Now
          </AlertDialogCancel>
          <AlertDialogAction onClick={onAllow} className="w-full sm:w-auto">
            Allow Location Access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};