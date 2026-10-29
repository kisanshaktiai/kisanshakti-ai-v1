import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sprout, RefreshCw, Loader2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useCropGrowthTracking } from '@/hooks/useCropGrowthTracking';
import { CropPhotoCapture } from '@/components/Photo/CropPhotoCapture';
import { CropGrowthAnalysisCard } from '@/components/crop-growth/CropGrowthAnalysisCard';
import { CropGrowthAlerts } from '@/components/crop-growth/CropGrowthAlerts';
import { CropGrowthHistory } from '@/components/crop-growth/CropGrowthHistory';
import { useQuery } from '@tanstack/react-query';
import { landsApi } from '@/services/landsApi';
import { cn } from '@/lib/utils';

export default function CropGrowthTracking() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const [selectedLandId, setSelectedLandId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [captureOpen, setCaptureOpen] = useState(false);

  // Fetch user's lands
  const { data: lands, isLoading: landsLoading } = useQuery({
    queryKey: ['farmer-lands', user?.id, user?.tenantId],
    queryFn: async () => {
      if (!user?.id) return [];
      return (await landsApi.fetchLands()).filter((land): land is typeof land & { id: string } => !!land.id);
    },
    enabled: !!user?.id
  });

  // Auto-select first land
  useEffect(() => {
    if (lands && lands.length > 0 && !selectedLandId) {
      setSelectedLandId(lands[0].id);
    }
  }, [lands, selectedLandId]);

  const {
    uploads,
    uploadsLoading,
    latestAnalysis,
    analysisLoading,
    analysisHistory,
    alerts,
    isAnalyzing,
    analyzeUpload,
    markAlertRead,
    markAlertActioned,
    refetch
  } = useCropGrowthTracking(selectedLandId || undefined, user?.id, tenant?.id);

  const selectedLand = lands?.find(l => l.id === selectedLandId);

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-semibold flex items-center gap-2">
                <Sprout className="h-5 w-5 text-primary" />
                {t('cropGrowth.title', 'Crop Growth Tracking')}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t('cropGrowth.subtitle', 'AI-powered monitoring & predictions')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={uploadsLoading || analysisLoading}
          >
            <RefreshCw className={cn("h-5 w-5", (uploadsLoading || analysisLoading) && "animate-spin")} />
          </Button>
        </div>
      </header>

      <main className="p-4 space-y-4 pb-24">
        {/* Land Selection */}
        {lands && lands.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            {lands.map((land) => (
              <Button
                key={land.id}
                variant={selectedLandId === land.id ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                onClick={() => { setCaptureOpen(false); setSelectedLandId(land.id); }}
              >
                {land.name}
                {land.current_crop && (
                  <span className="ml-1 text-xs opacity-70">({land.current_crop})</span>
                )}
              </Button>
            ))}
          </div>
        ) : landsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <Sprout className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">{t('cropGrowth.noLands', 'No lands found')}</p>
              <p className="text-sm text-muted-foreground mb-4">
                {t('cropGrowth.addLandFirst', 'Add a land parcel first to start tracking')}
              </p>
              <Button onClick={() => navigate('/app/lands/add')}>
                {t('common.addLand', 'Add Land')}
              </Button>
            </CardContent>
          </Card>
        )}

        {selectedLandId && (
          <>
            {/* Upload Section */}
            <Button className="w-full min-h-12 whitespace-normal" onClick={() => setCaptureOpen(true)} disabled={!selectedLand || !user?.tenantId}>
              <Camera className="h-5 w-5 mr-2 shrink-0" />{t('cropGrowth.takePhoto')}
            </Button>
            {selectedLand && user?.tenantId && (
              <CropPhotoCapture
                isOpen={captureOpen}
                onClose={() => setCaptureOpen(false)}
                purpose="growth_tracking"
                farmerId={user.id}
                tenantId={user.tenantId}
                landId={selectedLand.id}
                onAnswer={() => refetch()}
              />
            )}

            {/* Alerts */}
            {alerts && alerts.length > 0 && (
              <CropGrowthAlerts
                alerts={alerts}
                onMarkRead={markAlertRead}
                onMarkActioned={markAlertActioned}
              />
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="overview">
                  {t('cropGrowth.overview', 'Overview')}
                </TabsTrigger>
                <TabsTrigger value="history">
                  {t('cropGrowth.history', 'History')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                {analysisLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : latestAnalysis ? (
                  <CropGrowthAnalysisCard analysis={latestAnalysis} />
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Sprout className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="font-medium">{t('cropGrowth.noHistory', 'No analysis yet')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('cropGrowth.startTracking', 'Upload crop photos to start tracking growth')}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <CropGrowthHistory
                  uploads={(uploads || []) as any}
                  analyses={(analysisHistory || []) as any}
                  onViewAnalysis={(id) => {
                    console.log('View analysis:', id);
                  }}
                  onAnalyze={(upload) => analyzeUpload(upload as any)}
                  isAnalyzing={isAnalyzing}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
