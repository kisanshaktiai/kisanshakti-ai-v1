import { useState, useEffect, useMemo } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { defaultFeatures, FeatureItem } from '@/config/featureConfig';

export function useFeatures() {
  const { tenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);

  // Map database feature keys to app feature IDs for DISABLE overrides
  const mapDatabaseFeaturesToDisabledIds = (dbFeatures: Record<string, boolean>): string[] => {
    const featureMapping: Record<string, string[]> = {
      'basic_analytics': ['analytics'],
      'farmer_management': ['lands', 'profile'],
      'communication_tools': ['chat', 'social'],
      'crop_schedules': ['schedule'],
      'weather_advisory': ['weather'],
      'market_linkage': ['market'],
      'scheme_information': ['schemes'],
    };

    const disabledIds: string[] = [];
    Object.entries(dbFeatures).forEach(([dbKey, isEnabled]) => {
      // If explicitly disabled (false), add to disabled list
      if (isEnabled === false && featureMapping[dbKey]) {
        disabledIds.push(...featureMapping[dbKey]);
      }
    });

    return disabledIds;
  };

  // Process features based on tenant settings
  // DEFAULT: All features are ENABLED (except comingSoon)
  // Tenant settings act as DISABLE OVERRIDES
  const features = useMemo(() => {
    console.log('🎯 [useFeatures] Processing features - ALL ENABLED BY DEFAULT');
    console.log('🎯 [useFeatures] Tenant:', tenant?.id);
    console.log('🎯 [useFeatures] Default features count:', defaultFeatures.length);
    
    let processedFeatures: FeatureItem[];
    
    // Check if tenant has feature settings to DISABLE specific features
    if (tenant?.features) {
      const tenantFeatures = tenant.features;
      
      // Handle array format - features NOT in array are disabled
      if (Array.isArray(tenantFeatures)) {
        console.log('🎯 [useFeatures] Tenant features (array) - treating as ENABLED list:', tenantFeatures);
        processedFeatures = defaultFeatures.map(feature => ({
          ...feature,
          // Feature is enabled if:
          // 1. It's in the tenant array OR
          // 2. It's not comingSoon and tenant array is empty (enable all)
          enabled: feature.comingSoon ? false : (
            tenantFeatures.length === 0 ? true : tenantFeatures.includes(feature.id)
          )
        }));
      } 
      // Handle object format - features with false are disabled
      else if (typeof tenantFeatures === 'object') {
        console.log('🎯 [useFeatures] Tenant features (object) - checking for disabled features:', tenantFeatures);
        const disabledFeatureIds = mapDatabaseFeaturesToDisabledIds(tenantFeatures);
        console.log('🎯 [useFeatures] Explicitly disabled feature IDs:', disabledFeatureIds);
        
        processedFeatures = defaultFeatures.map(feature => ({
          ...feature,
          // Feature is enabled if:
          // 1. Not in disabled list AND
          // 2. Not comingSoon
          enabled: !feature.comingSoon && !disabledFeatureIds.includes(feature.id)
        }));
      } else {
        // Unknown format - enable all features by default
        console.log('🎯 [useFeatures] Unknown tenant feature format, enabling all by default');
        processedFeatures = defaultFeatures.map(feature => ({
          ...feature,
          enabled: !feature.comingSoon
        }));
      }
    } else {
      // No tenant settings - enable all features by default (except coming soon)
      console.log('🎯 [useFeatures] No tenant settings, enabling ALL non-coming-soon features');
      processedFeatures = defaultFeatures.map(feature => ({
        ...feature,
        enabled: !feature.comingSoon
      }));
    }
    
    const enabledCount = processedFeatures.filter(f => f.enabled).length;
    const comingSoonCount = processedFeatures.filter(f => f.comingSoon).length;
    
    console.log('✅ [useFeatures] Processed features:', {
      total: processedFeatures.length,
      enabled: enabledCount,
      comingSoon: comingSoonCount,
      enabledIds: processedFeatures.filter(f => f.enabled).map(f => f.id),
      comingSoonIds: processedFeatures.filter(f => f.comingSoon).map(f => f.id)
    });
    
    return processedFeatures;
  }, [tenant]);

  // Get enabled features (including coming soon for display)
  const enabledFeatures = useMemo(() => {
    const list = features
      .filter(f => f.enabled || f.comingSoon)
      .sort((a, b) => a.order - b.order);
    
    console.log('✅ [useFeatures] enabledFeatures:', {
      count: list.length,
      ids: list.map(f => f.id)
    });
    
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