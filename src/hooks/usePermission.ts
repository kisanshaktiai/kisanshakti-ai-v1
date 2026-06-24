/**
 * usePermission - React hook for contextual permission requests
 */

import { useState } from 'react';
import { PermissionManager, PermissionType, PermissionStatus } from '@/services/PermissionManager';
import { toast } from '@/hooks/use-toast';

interface UsePermissionOptions {
  type: PermissionType;
  reason: string;
  feature: string;
  onGrant?: () => void;
  onDeny?: () => void;
}

export const usePermission = (options: UsePermissionOptions) => {
  const [status, setStatus] = useState<PermissionStatus>('prompt');
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState<any>(null);
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => Promise<PermissionStatus>) | null>(null);

  const checkPermission = async () => {
    const currentStatus = await PermissionManager.checkStatus(options.type);
    setStatus(currentStatus);
    return currentStatus;
  };

  const requestPermission = async () => {
    setIsLoading(true);
    
    try {
      const result = await PermissionManager.requestPermission({
        type: options.type,
        reason: options.reason,
        feature: options.feature,
        onGrant: options.onGrant,
        onDeny: options.onDeny
      });

      if (result.shouldShowModal) {
        setModalConfig(result.modalConfig);
        setOnConfirmCallback(() => result.onConfirm);
        setShowModal(true);
      } else {
        // Permission already granted
        const status = await result.onConfirm();
        setStatus(status);
        if (status === 'granted' && options.onGrant) {
          options.onGrant();
        }
      }
    } catch (error) {
      console.error('Permission request error:', error);
      toast({
        title: 'Permission Error',
        description: 'Failed to request permission. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleModalConfirm = async () => {
    if (onConfirmCallback) {
      setShowModal(false);
      setIsLoading(true);
      
      try {
        const status = await onConfirmCallback();
        setStatus(status);
        
        if (status === 'granted' && options.onGrant) {
          options.onGrant();
          toast({
            title: 'Permission Granted',
            description: `${options.feature} can now access your ${options.type}.`
          });
        } else if (status === 'denied' && options.onDeny) {
          options.onDeny();
          toast({
            title: 'Permission Denied',
            description: `${options.feature} cannot access your ${options.type}.`,
            variant: 'destructive'
          });
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleModalDeny = () => {
    setShowModal(false);
    if (options.onDeny) {
      options.onDeny();
    }
  };

  return {
    status,
    isLoading,
    showModal,
    modalConfig,
    checkPermission,
    requestPermission,
    handleModalConfirm,
    handleModalDeny
  };
};
