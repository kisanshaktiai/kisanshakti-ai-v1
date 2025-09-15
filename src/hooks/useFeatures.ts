import { useState, useEffect } from 'react';
import { useTenantStore } from '@/stores/tenantStore';
import { defaultFeatures, FeatureItem } from '@/config/featureConfig';

export function useFeatures() {
  const { tenant } = useTenantStore();
  const [features, setFeatures] = useState<FeatureItem[]>(defaultFeatures);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load features from local storage for offline support
    const cachedFeatures = localStorage.getItem('app_features');
    if (cachedFeatures) {
      try {
        const parsed = JSON.parse(cachedFeatures);
        setFeatures(parsed);
        setIsLoading(false);
        return; // Use cached features if available
      } catch (error) {
        console.error('Error parsing cached features:', error);
      }
    }

    // Apply tenant-specific feature configuration if available
    // Otherwise, enable all features by default (except coming soon)
    let updatedFeatures: FeatureItem[];
    
    if (tenant?.settings?.features) {
      // Ensure features is an array
      const enabledFeatureIds = Array.isArray(tenant.settings.features) 
        ? tenant.settings.features 
        : [];
      updatedFeatures = defaultFeatures.map(feature => ({
        ...feature,
        enabled: feature.comingSoon ? false : enabledFeatureIds.includes(feature.id)
      }));
    } else {
      // No tenant settings - enable all features by default (except coming soon)
      updatedFeatures = defaultFeatures.map(feature => ({
        ...feature,
        enabled: !feature.comingSoon // Enable all features except coming soon ones
      }));
    }
    
    setFeatures(updatedFeatures);
    
    // Cache for offline support
    localStorage.setItem('app_features', JSON.stringify(updatedFeatures));
    
    setIsLoading(false);
  }, [tenant]);

  const getEnabledFeatures = () => {
    return features
      .filter(f => f.enabled || f.comingSoon)
      .sort((a, b) => a.order - b.order);
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