/**
 * PermissionRequestModal - Contextual pre-permission modal
 * Shows before native permission prompt to explain why permission is needed
 */

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
} from '@/components/ui/alert-dialog';
import { MapPin, Camera, Mic, Users, Settings, CheckCircle2 } from 'lucide-react';

interface PermissionRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  icon: string;
  benefits: string[];
  onConfirm: () => void;
  onDeny: () => void;
  isBlocked?: boolean;
}

const iconMap = {
  MapPin,
  Camera,
  Mic,
  Users,
  Settings
};

export const PermissionRequestModal: React.FC<PermissionRequestModalProps> = ({
  open,
  onOpenChange,
  title,
  description,
  icon,
  benefits,
  onConfirm,
  onDeny,
  isBlocked = false
}) => {
  const IconComponent = iconMap[icon as keyof typeof iconMap] || MapPin;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
            <IconComponent className="h-10 w-10 text-primary" />
          </div>
          <AlertDialogTitle className="text-center text-xl">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center space-y-4">
            <p className="text-base text-foreground">{description}</p>
            
            <div className="text-left space-y-3 pt-2">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">{benefit}</p>
                </div>
              ))}
            </div>

            {!isBlocked && (
              <p className="text-xs text-muted-foreground pt-2">
                Your data is stored securely and never shared without your permission.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel onClick={onDeny} className="w-full sm:w-auto">
            Not Now
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="w-full sm:w-auto">
            {isBlocked ? 'Open Settings' : 'Allow Access'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
