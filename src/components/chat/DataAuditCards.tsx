import React from 'react';
import { Card } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, Leaf, Activity, CloudRain, Calendar, 
  CheckCircle, AlertTriangle, XCircle, Info,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export interface DataAuditItem {
  found: boolean;
  missing_reasons?: string[];
  [key: string]: any;
}

export interface DataAudit {
  land: DataAuditItem & {
    land_id?: string;
    land_name?: string;
    current_crop?: string;
    area_acres?: number;
    growth_stage?: string;
    days_since_sowing?: number;
    has_coordinates?: boolean;
  };
  soil_health: DataAuditItem & {
    test_date?: string;
    test_age_days?: number;
    nitrogen_kg_per_ha?: number;
    phosphorus_kg_per_ha?: number;
    potassium_kg_per_ha?: number;
    ph_level?: number;
    nitrogen_state?: string;
    phosphorus_state?: string;
    potassium_state?: string;
  };
  ndvi: DataAuditItem & {
    latest_value?: number;
    latest_date?: string;
    age_days?: number;
    trend?: string;
    health_status?: string;
    history_count?: number;
  };
  weather: DataAuditItem & {
    temperature?: number;
    humidity?: number;
    rain_probability?: number;
    rain_last_24h?: number;
    data_age_hours?: number;
  };
  crop_schedule: DataAuditItem & {
    crop_name?: string;
    sowing_date?: string;
    expected_harvest?: string;
    status?: string;
  };
  summary: {
    total_data_sources: number;
    available_sources: number;
    data_quality_score: number;
    critical_missing: string[];
    recommendations: string[];
  };
}

interface DataAuditCardsProps {
  audit: DataAudit;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const StatusIcon = ({ found, stale }: { found: boolean; stale?: boolean }) => {
  if (!found) return <XCircle className="w-4 h-4 text-destructive" />;
  if (stale) return <AlertTriangle className="w-4 h-4 text-warning" />;
  return <CheckCircle className="w-4 h-4 text-success" />;
};

const StatusBadge = ({ found, stale, label }: { found: boolean; stale?: boolean; label?: string }) => {
  const { t } = useTranslation();
  if (!found) return <Badge variant="destructive" className="text-xs">{t('chatCards.cards.missing')}</Badge>;
  if (stale) return <Badge variant="outline" className="text-xs border-warning text-warning">Stale</Badge>;
  return <Badge variant="outline" className="text-xs border-success text-success">{label || t('chatCards.cards.found')}</Badge>;
};

const AuditCard = ({ 
  title, 
  icon: Icon, 
  found, 
  stale,
  children,
  missingReasons 
}: { 
  title: string; 
  icon: React.ElementType; 
  found: boolean; 
  stale?: boolean;
  children: React.ReactNode;
  missingReasons?: string[];
}) => {
  const { t } = useTranslation();
  return (
  <Card className={cn(
    "p-3 border transition-all",
    found 
      ? stale ? "border-warning/30 bg-warning/5" : "border-success/30 bg-success/5"
      : "border-destructive/30 bg-destructive/5"
  )}>
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <Icon className={cn(
          "w-4 h-4",
          found ? stale ? "text-warning" : "text-success" : "text-destructive"
        )} />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <StatusBadge found={found} stale={stale} />
    </div>
    {found ? (
      <div className="text-xs text-muted-foreground space-y-1">
        {children}
      </div>
    ) : (
      <div className="text-xs text-destructive/80">
        {missingReasons?.map((reason, i) => (
          <div key={i} className="flex items-center gap-1">
            <span>•</span>
            <span>{reason}</span>
          </div>
        )) || <span>{t('chatCards.cards.noDataAvailable')}</span>}
      </div>
    )}
    </Card>
  );
};

const DataRow = ({ label, value, unit }: { label: string; value: any; unit?: string }) => {
  if (value === undefined || value === null) return null;
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}{unit ? ` ${unit}` : ''}</span>
    </div>
  );
};

export function DataAuditCards({ audit, isExpanded = false, onToggle }: DataAuditCardsProps) {
  const [expanded, setExpanded] = React.useState(isExpanded);
  const { t } = useTranslation();
  
  const qualityScore = audit.summary?.data_quality_score || 0;
  const qualityColor = qualityScore >= 80 ? 'text-success' : qualityScore >= 50 ? 'text-warning' : 'text-destructive';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4"
    >
      <Collapsible open={expanded} onOpenChange={(open) => {
        setExpanded(open);
        onToggle?.();
      }}>
        <CollapsibleTrigger className="w-full">
          <Card className="p-3 bg-muted/30 border-dashed cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{t('chatCards.cards.dataContextAudit')}</span>
                <Badge variant="outline" className={cn("text-xs", qualityColor)}>
                  {audit.summary?.available_sources || 0}/{audit.summary?.total_data_sources || 5} {t('chatCards.cards.sources')} • {qualityScore}% {t('chatCards.cards.quality')}
                </Badge>
              </div>
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            
            {!expanded && audit.summary?.critical_missing?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {audit.summary.critical_missing.slice(0, 3).map((item, i) => (
                  <Badge key={i} variant="destructive" className="text-xs">
                    Missing: {item}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
            >
              {/* Land Card */}
              <AuditCard 
                title={t('chatCards.cards.land')}
                icon={MapPin} 
                found={audit.land?.found}
                missingReasons={audit.land?.missing_reasons}
              >
                <DataRow label={t('chatCards.cards.name')} value={audit.land?.land_name} />
                <DataRow label={t('chatCards.cards.crop')} value={audit.land?.current_crop} />
                <DataRow label={t('chatCards.cards.area')} value={audit.land?.area_acres} unit={t('chatCards.cards.acre')} />
                <DataRow label={t('chatCards.cards.stage')} value={audit.land?.growth_stage} />
                <DataRow label={t('chatCards.cards.das')} value={audit.land?.days_since_sowing} unit={t('chatCards.cards.days')} />
                {!audit.land?.has_coordinates && (
                  <div className="text-warning text-xs mt-1">{t('chatCards.cards.noGpsCoordinates')}</div>
                )}
              </AuditCard>

              {/* Soil Health Card */}
              <AuditCard 
                title={t('chatCards.cards.soilHealth')}
                icon={Leaf} 
                found={audit.soil_health?.found}
                stale={(audit.soil_health?.test_age_days || 0) > 180}
                missingReasons={audit.soil_health?.missing_reasons}
              >
                <DataRow label="N" value={audit.soil_health?.nitrogen_kg_per_ha} unit={`kg/ha (${audit.soil_health?.nitrogen_state || '?'})`} />
                <DataRow label="P" value={audit.soil_health?.phosphorus_kg_per_ha} unit={`kg/ha (${audit.soil_health?.phosphorus_state || '?'})`} />
                <DataRow label="K" value={audit.soil_health?.potassium_kg_per_ha} unit={`kg/ha (${audit.soil_health?.potassium_state || '?'})`} />
                <DataRow label="pH" value={audit.soil_health?.ph_level} />
                {audit.soil_health?.test_age_days && (
                  <div className={cn(
                    "text-xs mt-1",
                    audit.soil_health.test_age_days > 180 ? "text-warning" : "text-muted-foreground"
                  )}>
                    {t('chatCards.cards.testAge')}: {audit.soil_health.test_age_days} {t('chatCards.cards.days')}
                  </div>
                )}
              </AuditCard>

              {/* NDVI Card */}
              <AuditCard 
                title={t('chatCards.cards.ndviSatellite')}
                icon={Activity} 
                found={audit.ndvi?.found}
                stale={(audit.ndvi?.age_days || 0) > 14}
                missingReasons={audit.ndvi?.missing_reasons}
              >
                <DataRow label={t('chatCards.cards.value')} value={audit.ndvi?.latest_value?.toFixed(2)} />
                <DataRow label={t('chatCards.cards.status')} value={audit.ndvi?.health_status} />
                <DataRow label={t('chatCards.cards.trend')} value={audit.ndvi?.trend} />
                <DataRow label={t('chatCards.cards.history')} value={audit.ndvi?.history_count} unit={t('chatCards.cards.readings')} />
                {audit.ndvi?.age_days && (
                  <div className={cn(
                    "text-xs mt-1",
                    audit.ndvi.age_days > 14 ? "text-warning" : "text-muted-foreground"
                  )}>
                    {t('chatCards.cards.age')}: {audit.ndvi.age_days} {t('chatCards.cards.days')}
                  </div>
                )}
              </AuditCard>

              {/* Weather Card */}
              <AuditCard 
                title={t('chatCards.cards.weather')}
                icon={CloudRain} 
                found={audit.weather?.found}
                stale={(audit.weather?.data_age_hours || 0) > 6}
                missingReasons={audit.weather?.missing_reasons}
              >
                <DataRow label={t('chatCards.cards.temp')} value={audit.weather?.temperature} unit="°C" />
                <DataRow label={t('chatCards.cards.humidity')} value={audit.weather?.humidity} unit="%" />
                <DataRow label={t('chatCards.cards.rainProb')} value={audit.weather?.rain_probability} unit="%" />
                <DataRow label={t('chatCards.cards.rain24h')} value={audit.weather?.rain_last_24h} unit="mm" />
              </AuditCard>

              {/* Crop Schedule Card */}
              <AuditCard 
                title={t('chatCards.cards.cropSchedule')}
                icon={Calendar} 
                found={audit.crop_schedule?.found}
                missingReasons={audit.crop_schedule?.missing_reasons}
              >
                <DataRow label={t('chatCards.cards.crop')} value={audit.crop_schedule?.crop_name} />
                <DataRow label={t('chatCards.cards.sowing')} value={audit.crop_schedule?.sowing_date?.split('T')[0]} />
                <DataRow label={t('chatCards.cards.harvest')} value={audit.crop_schedule?.expected_harvest?.split('T')[0]} />
                <DataRow label={t('chatCards.cards.status')} value={audit.crop_schedule?.status} />
              </AuditCard>

              {/* Summary Card */}
              {audit.summary?.recommendations?.length > 0 && (
                <Card className="p-3 bg-primary/5 border-primary/20 sm:col-span-2 lg:col-span-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{t('chatCards.cards.recommendations')}</span>
                  </div>
                  <div className="text-xs space-y-1">
                    {audit.summary.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <span className="text-primary">→</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </motion.div>
          </AnimatePresence>
        </CollapsibleContent>
      </Collapsible>
    </motion.div>
  );
}
