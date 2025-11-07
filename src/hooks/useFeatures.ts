import { useState, useEffect, useMemo } from 'react';
import { useTenantStore } from '@/stores/tenantStore';
import { defaultFeatures, FeatureItem } from '@/config/featureConfig';

export function useFeatures() {
  const { tenant } = useTenantStore();
  const [isLoading, setIsLoading] = useState(false);

  // Map database feature keys to app feature IDs
  const mapDatabaseFeaturesToAppIds = (dbFeatures: Record<string, boolean>): string[] => {
    const featureMapping: Record<string, string[]> = {
      'basic_analytics': ['analytics'],
      'farmer_management': ['lands', 'profile'],
      'communication_tools': ['chat', 'social'],
      'crop_schedules': ['schedule'],
      'weather_advisory': ['weather'],
      'market_linkage': ['market'],
      'scheme_information': ['schemes'],
    };

    const mappedIds: string[] = [];
    Object.entries(dbFeatures).forEach(([dbKey, isEnabled]) => {
      if (isEnabled && featureMapping[dbKey]) {
        mappedIds.push(...featureMapping[dbKey]);
      }
    });

    return mappedIds;
  };

  // Process features based on tenant settings
  const features = useMemo(() => {
    console.log('useFeatures - Processing features with tenant:', tenant);
    console.log('useFeatures - defaultFeatures count:', defaultFeatures.length);
    
    let processedFeatures: FeatureItem[];
    
    // Check if tenant has feature settings
    if (tenant?.settings?.features) {
      const tenantFeatures = tenant.settings.features;
      
      // Handle array format (new format)
      if (Array.isArray(tenantFeatures)) {
        console.log('useFeatures - Tenant features (array):', tenantFeatures);
        processedFeatures = defaultFeatures.map(feature => ({
          ...feature,
          enabled: feature.comingSoon ? false : tenantFeatures.includes(feature.id)
        }));
      } 
      // Handle object format (legacy format from database)
      else if (typeof tenantFeatures === 'object') {
        console.log('useFeatures - Tenant features (object, mapping to app IDs):', tenantFeatures);
        const mappedFeatureIds = mapDatabaseFeaturesToAppIds(tenantFeatures);
        console.log('useFeatures - Mapped feature IDs:', mappedFeatureIds);
        
        processedFeatures = defaultFeatures.map(feature => ({
          ...feature,
          enabled: feature.comingSoon ? false : mappedFeatureIds.includes(feature.id)
        }));
      } else {
        // Unknown format - enable all features by default
        console.log('useFeatures - Unknown tenant feature format, enabling all');
        processedFeatures = defaultFeatures.map(feature => ({
          ...feature,
          enabled: !feature.comingSoon
        }));
      }
    } else {
      // No tenant settings - enable all features by default (except coming soon)
      console.log('useFeatures - No tenant settings, enabling all non-coming-soon features');
      processedFeatures = defaultFeatures.map(feature => ({
        ...feature,
        enabled: !feature.comingSoon
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