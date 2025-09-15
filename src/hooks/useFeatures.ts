import { useState, useEffect } from 'react';
import { useTenantStore } from '@/stores/tenantStore';
import { defaultFeatures, FeatureItem } from '@/config/featureConfig';

export function useFeatures() {
  const { tenant } = useTenantStore();
  const [features, setFeatures] = useState<FeatureItem[]>(defaultFeatures);
  const [isLoading, setIsLoading] = useState(true);
  
  console.log('useFeatures Debug - tenant:', tenant);
  console.log('useFeatures Debug - defaultFeatures:', defaultFeatures);

  useEffect(() => {
    console.log('useFeatures Debug - Effect running');
    
    // Clear any problematic cached features
    localStorage.removeItem('app_features'); // Clear cache to fix icon issues
    
    // Apply tenant-specific feature configuration if available
    // Otherwise, enable all features by default (except coming soon)
    let updatedFeatures: FeatureItem[];
    
    if (tenant?.settings?.features) {
      // Ensure features is an array
      const enabledFeatureIds = Array.isArray(tenant.settings.features) 
        ? tenant.settings.features 
        : [];
      console.log('useFeatures Debug - Tenant feature IDs:', enabledFeatureIds);
      updatedFeatures = defaultFeatures.map(feature => ({
        ...feature,
        enabled: feature.comingSoon ? false : enabledFeatureIds.includes(feature.id)
      }));
    } else {
      // No tenant settings - enable all features by default (except coming soon)
      console.log('useFeatures Debug - No tenant settings, enabling all features');
      updatedFeatures = defaultFeatures.map(feature => ({
        ...feature,
        enabled: !feature.comingSoon // Enable all features except coming soon ones
      }));
    }
    
    console.log('useFeatures Debug - Updated features:', updatedFeatures);
    setFeatures(updatedFeatures);
    
    // Cache for offline support
    localStorage.setItem('app_features', JSON.stringify(updatedFeatures));
    
    setIsLoading(false);
  }, [tenant]);

  const getEnabledFeatures = () => {
    const enabledList = features
      .filter(f => f.enabled || f.comingSoon)
      .sort((a, b) => a.order - b.order);
    console.log('useFeatures Debug - getEnabledFeatures result:', enabledList);
    return enabledList;
  };

  const getFeaturesByCategory = () => {
    const grouped: Record<string, FeatureItem[]> = {};
    features.forEach(feature => {
      const category = feature.category || 'other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(feature);
    });
    return grouped;
  };

  return {
    features,
    enabledFeatures: getEnabledFeatures(),
    featuresByCategory: getFeaturesByCategory(),
    isLoading
  };
}