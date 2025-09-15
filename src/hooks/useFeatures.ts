import { useState, useEffect } from 'react';
import { useTenantStore } from '@/stores/tenantStore';
import { defaultFeatures, FeatureItem } from '@/config/featureConfig';

export function useFeatures() {
  const { tenant } = useTenantStore();
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('useFeatures Debug - Effect running with tenant:', tenant);
    console.log('useFeatures Debug - defaultFeatures count:', defaultFeatures.length);
    
    // Always use fresh features from defaultFeatures, never from cache
    // The cache was corrupting icon references
    let updatedFeatures: FeatureItem[];
    
    if (tenant?.settings?.features) {
      // Ensure features is an array
      const enabledFeatureIds = Array.isArray(tenant.settings.features) 
        ? tenant.settings.features 
        : [];
      console.log('useFeatures Debug - Tenant feature IDs:', enabledFeatureIds);
      
      // Map over defaultFeatures to preserve icon references
      updatedFeatures = defaultFeatures.map(feature => ({
        ...feature,
        enabled: feature.comingSoon ? false : enabledFeatureIds.includes(feature.id)
      }));
    } else {
      // No tenant settings - enable all features by default (except coming soon)
      console.log('useFeatures Debug - No tenant settings, enabling all non-coming-soon features');
      updatedFeatures = defaultFeatures.map(feature => ({
        ...feature,
        enabled: !feature.comingSoon // Enable all features except coming soon ones
      }));
    }
    
    console.log('useFeatures Debug - Updated features count:', updatedFeatures.length);
    console.log('useFeatures Debug - Enabled features:', updatedFeatures.filter(f => f.enabled).map(f => f.id));
    setFeatures(updatedFeatures);
    setIsLoading(false);
  }, [tenant]);

  const getEnabledFeatures = () => {
    const enabledList = features
      .filter(f => f.enabled || f.comingSoon)
      .sort((a, b) => a.order - b.order);
    console.log('useFeatures Debug - getEnabledFeatures count:', enabledList.length);
    console.log('useFeatures Debug - getEnabledFeatures IDs:', enabledList.map(f => f.id));
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