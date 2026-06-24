/**
 * PermissionManager - Centralized permission handling with contextual pre-permission modals
 * Handles Location, Camera, Microphone, and Contacts permissions
 */

export type PermissionType = 'location' | 'camera' | 'microphone' | 'contacts';
export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'blocked';

interface PermissionContext {
  type: PermissionType;
  reason: string;
  feature: string;
  onGrant?: () => void;
  onDeny?: () => void;
}

interface StoredPermission {
  status: PermissionStatus;
  timestamp: number;
  requestCount: number;
}

class PermissionManagerClass {
  private storage = 'ks_permissions';
  
  /**
   * Get stored permission state
   */
  private getStoredPermission(type: PermissionType): StoredPermission | null {
    try {
      const stored = localStorage.getItem(`${this.storage}_${type}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  /**
   * Store permission state
   */
  private storePermission(type: PermissionType, status: PermissionStatus) {
    const stored = this.getStoredPermission(type);
    const permission: StoredPermission = {
      status,
      timestamp: Date.now(),
      requestCount: (stored?.requestCount || 0) + 1
    };
    localStorage.setItem(`${this.storage}_${type}`, JSON.stringify(permission));
  }

  /**
   * Check current permission status without requesting
   */
  async checkStatus(type: PermissionType): Promise<PermissionStatus> {
    const stored = this.getStoredPermission(type);
    
    switch (type) {
      case 'location':
        return this.checkLocationStatus(stored);
      case 'camera':
        return this.checkMediaStatus('videoinput', stored);
      case 'microphone':
        return this.checkMediaStatus('audioinput', stored);
      case 'contacts':
        // Contacts API not widely supported, return stored or prompt
        return stored?.status || 'prompt';
      default:
        return 'prompt';
    }
  }

  private async checkLocationStatus(stored: StoredPermission | null): Promise<PermissionStatus> {
    if (!('geolocation' in navigator)) {
      return 'denied';
    }

    try {
      if ('permissions' in navigator && 'query' in navigator.permissions) {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        return permission.state as PermissionStatus;
      }
    } catch {}
    
    return stored?.status || 'prompt';
  }

  private async checkMediaStatus(kind: 'videoinput' | 'audioinput', stored: StoredPermission | null): Promise<PermissionStatus> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasDevice = devices.some(d => d.kind === kind);
      
      if (!hasDevice) {
        return 'denied';
      }

      // If we have device labels, permission is granted
      const hasLabels = devices.some(d => d.kind === kind && d.label);
      if (hasLabels) {
        return 'granted';
      }
    } catch {}
    
    return stored?.status || 'prompt';
  }

  /**
   * Request permission with context - returns pre-permission modal configuration
   */
  async requestPermission(context: PermissionContext): Promise<{
    shouldShowModal: boolean;
    modalConfig?: {
      title: string;
      description: string;
      icon: string;
      benefits: string[];
    };
    onConfirm: () => Promise<PermissionStatus>;
  }> {
    const currentStatus = await this.checkStatus(context.type);

    // If already granted, no modal needed
    if (currentStatus === 'granted') {
      return {
        shouldShowModal: false,
        onConfirm: async () => 'granted'
      };
    }

    // If blocked, show settings modal
    if (currentStatus === 'blocked' || (currentStatus === 'denied' && this.getStoredPermission(context.type)?.requestCount! > 1)) {
      return {
        shouldShowModal: true,
        modalConfig: this.getBlockedModalConfig(context),
        onConfirm: async () => {
          // Open settings
          this.openSettings();
          return 'blocked';
        }
      };
    }

    // Show pre-permission modal
    return {
      shouldShowModal: true,
      modalConfig: this.getPrePermissionModalConfig(context),
      onConfirm: async () => {
        return await this.requestNativePermission(context.type);
      }
    };
  }

  /**
   * Request native permission
   */
  private async requestNativePermission(type: PermissionType): Promise<PermissionStatus> {
    let status: PermissionStatus = 'denied';

    try {
      switch (type) {
        case 'location':
          status = await this.requestLocationPermission();
          break;
        case 'camera':
          status = await this.requestCameraPermission();
          break;
        case 'microphone':
          status = await this.requestMicrophonePermission();
          break;
        case 'contacts':
          // Contacts API not widely supported
          status = 'denied';
          break;
      }
    } catch (error) {
      console.error(`Permission request failed for ${type}:`, error);
      status = 'denied';
    }

    this.storePermission(type, status);
    return status;
  }

  private async requestLocationPermission(): Promise<PermissionStatus> {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        resolve('denied');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        () => resolve('granted'),
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            resolve('denied');
          } else {
            resolve('prompt');
          }
        },
        { timeout: 10000 }
      );
    });
  }

  private async requestCameraPermission(): Promise<PermissionStatus> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return 'granted';
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        return 'denied';
      }
      return 'denied';
    }
  }

  private async requestMicrophonePermission(): Promise<PermissionStatus> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return 'granted';
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        return 'denied';
      }
      return 'denied';
    }
  }

  private getPrePermissionModalConfig(context: PermissionContext) {
    const configs = {
      location: {
        title: 'Location Access Needed',
        description: `We need your location to ${context.reason}`,
        icon: 'MapPin',
        benefits: [
          'Accurate weather forecasts for your area',
          'Personalized crop recommendations',
          'Nearby market prices and schemes'
        ]
      },
      camera: {
        title: 'Camera Access Needed',
        description: `We need camera access to ${context.reason}`,
        icon: 'Camera',
        benefits: [
          'Scan crops for instant identification',
          'Capture land boundaries easily',
          'Take photos for AI recommendations'
        ]
      },
      microphone: {
        title: 'Microphone Access Needed',
        description: `We need microphone access to ${context.reason}`,
        icon: 'Mic',
        benefits: [
          'Voice commands for hands-free operation',
          'Ask questions to AI assistant',
          'Record voice notes for your farm'
        ]
      },
      contacts: {
        title: 'Contacts Access Needed',
        description: `We need contacts access to ${context.reason}`,
        icon: 'Users',
        benefits: [
          'Share information with fellow farmers',
          'Invite farmers to community',
          'Quick contact for emergencies'
        ]
      }
    };

    return configs[context.type];
  }

  private getBlockedModalConfig(context: PermissionContext) {
    return {
      title: `${context.type.charAt(0).toUpperCase() + context.type.slice(1)} Permission Blocked`,
      description: `You previously denied ${context.type} access. To use ${context.feature}, please enable it in your device settings.`,
      icon: 'Settings',
      benefits: [
        'Open device settings',
        `Find KisanShakti app`,
        `Enable ${context.type} permission`,
        'Return to the app'
      ]
    };
  }

  /**
   * Open device settings (best effort)
   */
  openSettings() {
    // For web, we can only show instructions
    // For mobile web, this might open settings on some browsers
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('android')) {
      // Android Chrome may support this
      window.open('app-settings:');
    } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
      // iOS Safari doesn't support opening settings directly
      // We'll show instructions instead
      alert('To enable permissions:\n1. Open Settings\n2. Scroll to Safari\n3. Find KisanShakti\n4. Enable permissions');
    } else {
      // Desktop - show browser settings hint
      alert('Please click the lock icon in your browser\'s address bar to manage permissions.');
    }
  }

  /**
   * Clear all stored permissions (for testing/reset)
   */
  clearAll() {
    const types: PermissionType[] = ['location', 'camera', 'microphone', 'contacts'];
    types.forEach(type => {
      localStorage.removeItem(`${this.storage}_${type}`);
    });
  }

  /**
   * Get permission statistics (for settings/debug)
   */
  getStats() {
    const types: PermissionType[] = ['location', 'camera', 'microphone', 'contacts'];
    return types.map(type => ({
      type,
      ...this.getStoredPermission(type)
    }));
  }
}

export const PermissionManager = new PermissionManagerClass();
