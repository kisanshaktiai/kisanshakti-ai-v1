import { useState, useEffect, useMemo } from 'react';
import { useTenantStore } from '@/stores/tenantStore';
import { defaultFeatures, FeatureItem } from '@/config/featureConfig';

export function useFeatures() {
  const { tenant } = useTenantStore();
  const [isLoading, setIsLoading] = useState(false);

  // Process features based on tenant settings
  const features = useMemo(() => {
    console.log('useFeatures - Processing features with tenant:', tenant);
    console.log('useFeatures - defaultFeatures count:', defaultFeatures.length);
    
    let processedFeatures: FeatureItem[];
    
    if (tenant?.settings?.features && Array.isArray(tenant.settings.features)) {
      // Use tenant-specific feature configuration
      const enabledFeatureIds = tenant.settings.features;
      console.log('useFeatures - Tenant feature IDs:', enabledFeatureIds);
      
      processedFeatures = defaultFeatures.map(feature => ({
        ...feature,
        enabled: feature.comingSoon ? false : enabledFeatureIds.includes(feature.id)
      }));
    } else {
      // No tenant settings - enable all features by default (except coming soon)
      console.log('useFeatures - No tenant settings, enabling all non-coming-soon features');
      processedFeatures = defaultFeatures.map(feature => ({
        ...feature,
        enabled: !feature.comingSoon // Enable all features except coming soon ones
      }));
    }
    
    console.log('useFeatures - Processed features count:', processedFeatures.length);
    console.log('useFeatures - Enabled features:', processedFeatures.filter(f => f.enabled).map(f => f.id));
    console.log('useFeatures - Coming soon features:', processedFeatures.filter(f => f.comingSoon).map(f => f.id));
    
    return processedFeatures;
  }, [tenant]);

  // Get enabled features (including coming soon for display)
  const enabledFeatures = useMemo(() => {
    const list = features
      .filter(f => f.enabled || f.comingSoon)
      .sort((a, b) => a.order - b.order);
    
    console.log('useFeatures - enabledFeatures count:', list.length);
    console.log('useFeatures - enabledFeatures IDs:', list.map(f => f.id));
    
    return list;
  }, [features]);

  // Get features grouped by category
  const featuresByCategory = useMemo(() => {
    const grouped: Record<string, FeatureItem[]> = {};
    features.forEach(feature => {
      const category = feature.category || 'other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(feature);
    });
    return grouped;
  }, [features]);

  return {
    features,
    enabledFeatures,
    featuresByCategory,
    isLoading
  };
}