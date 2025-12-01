// ============= CONTEXT HELPERS FOR SESSION-BASED CACHING =============
// Helper functions to build minimal and mini-refresh contexts

export function getMinimalContext(
  queryType: string,
  land: any,
  areaInAcres: string | number,
  daysSinceSowing: number | null,
  latestSoilHealth: any,
  latestNDVI: any,
  cropSchedule?: any,
  currentGrowthStage?: string
): string {
  const cropName = cropSchedule?.crop_name || land.current_crop || 'Unknown';
  const variety = cropSchedule?.crop_variety ? ` (${cropSchedule.crop_variety})` : '';
  const stage = currentGrowthStage ? ` [${currentGrowthStage}]` : '';
  
  // Query-specific minimal context
  if (queryType === 'watering') {
    return `${cropName}${variety}${stage} (${daysSinceSowing}d) | ${areaInAcres}ac | ${land.irrigation_type || 'No irrig'}`;
  }
  
  if (queryType === 'fertilizer') {
    const n = latestSoilHealth?.nitrogen_kg_per_ha || '?';
    const p = latestSoilHealth?.phosphorus_kg_per_ha || '?';
    const k = latestSoilHealth?.potassium_kg_per_ha || '?';
    return `${cropName}${variety} ${areaInAcres}ac | NPK: N:${n} P:${p}${p !== '?' && Number(p) < 20 ? '↓' : ''} K:${k} | Stage: ${stage || daysSinceSowing + 'd'}`;
  }
  
  if (queryType === 'pest') {
    const ndviVal = latestNDVI?.ndvi_value || latestNDVI?.mean_ndvi || '?';
    const healthStatus = getHealthStatus(ndviVal);
    return `${cropName}${variety}${stage} (${daysSinceSowing}d) | NDVI:${ndviVal}(${healthStatus})`;
  }
  
  if (queryType === 'health') {
    const ndviVal = latestNDVI?.ndvi_value || latestNDVI?.mean_ndvi || '?';
    return `${cropName}${variety}${stage} (${daysSinceSowing}d) | NDVI:${ndviVal}${ndviVal !== '?' && Number(ndviVal) >= 0.7 ? '↑' : ''}`;
  }
  
  if (queryType === 'market') {
    return `${cropName}${variety} ${areaInAcres}ac | Stage: ${stage || daysSinceSowing + 'd'}`;
  }
  
  // General: minimal info
  return `${cropName}${variety} ${areaInAcres}ac${stage ? ` | ${stage}` : ''}`;
}

export function getMiniRefresh(
  land: any,
  areaInAcres: string | number,
  latestSoilHealth: any
): string {
  const cropName = land.current_crop || 'Unknown';
  const n = latestSoilHealth?.nitrogen_kg_per_ha || '?';
  const p = latestSoilHealth?.phosphorus_kg_per_ha || '?';
  const k = latestSoilHealth?.potassium_kg_per_ha || '?';
  
  return `${cropName} ${areaInAcres}ac | NPK: N:${n} P:${p} K:${k}`;
}

function getHealthStatus(ndvi: number | string): string {
  if (ndvi === '?' || !ndvi) return 'unknown';
  const val = Number(ndvi);
  if (val >= 0.8) return 'excellent';
  if (val >= 0.7) return 'healthy';
  if (val >= 0.5) return 'moderate';
  if (val >= 0.3) return 'stressed';
  return 'poor';
}
