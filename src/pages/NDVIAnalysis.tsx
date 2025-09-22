import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { landsApi } from '@/services/landsApi';
import { NDVIMapView } from '@/components/land/NDVIMapView';
import { NDVITrendChart } from '@/components/land/NDVITrendChart';
import { ArrowLeft, Map, TrendingUp, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useTenantStore } from '@/stores/tenantStore';

const NDVIAnalysis = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const { tenant } = useTenantStore();
  const [selectedLandId, setSelectedLandId] = useState<string | null>(null);

  // Fetch lands for the farmer using the lands API service
  const { data: lands, isLoading: landsLoading } = useQuery({
    queryKey: ['lands', session?.farmerId, tenant?.id],
    queryFn: async () => {
      try {
        const landsData = await landsApi.fetchLands();
        // The API already filters by farmer_id and tenant_id through headers
        return landsData || [];
      } catch (error) {
        console.error('Error fetching lands:', error);
        return [];
      }
    },
    enabled: !!session?.farmerId && !!tenant?.id,
  });

  // Fetch NDVI data for selected land
  const { data: ndviData, isLoading: ndviLoading } = useQuery({
    queryKey: ['ndvi', selectedLandId],
    queryFn: async () => {
      if (!selectedLandId) return null;
      
      const { data, error } = await supabase
        .from('ndvi_data')
        .select('*')
        .eq('land_id', selectedLandId)
        .order('analyzed_at', { ascending: false })
        .limit(30);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedLandId,
  });

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">NDVI & Satellite Analysis</h1>
            <p className="text-sm text-muted-foreground">Monitor crop health</p>
          </div>
        </div>
      </div>

      {/* Land Selection */}
      {!selectedLandId && (
        <div className="p-4">
          <Card>
            <CardHeader>
              <CardTitle>Select a Land</CardTitle>
              <CardDescription>Choose a land to view its NDVI analysis</CardDescription>
            </CardHeader>
            <CardContent>
              {landsLoading ? (
                <div className="text-center py-4">Loading lands...</div>
              ) : lands && lands.length > 0 ? (
                <div className="grid gap-3">
                  {lands.map((land) => (
                    <Button
                      key={land.id}
                      variant="outline"
                      className="justify-start"
                      onClick={() => setSelectedLandId(land.id)}
                    >
                      <Map className="mr-2 h-4 w-4" />
                      {land.name} - {land.area_acres} acres
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-muted-foreground mb-4">No lands found</p>
                  <Button onClick={() => navigate('/app/lands')}>
                    Add Land
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* NDVI Analysis */}
      {selectedLandId && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedLandId(null)}
              className="mb-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Select Different Land
            </Button>

            <Tabs defaultValue="map" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="map">
                  <Map className="mr-2 h-4 w-4" />
                  Map View
                </TabsTrigger>
                <TabsTrigger value="trends">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Trends
                </TabsTrigger>
                <TabsTrigger value="insights">
                  <Info className="mr-2 h-4 w-4" />
                  Insights
                </TabsTrigger>
              </TabsList>

              <TabsContent value="map" className="mt-4">
                <NDVIMapView 
                  landId={selectedLandId}
                  boundary={lands?.find(l => l.id === selectedLandId)?.boundary_polygon_old || []}
                />
              </TabsContent>

              <TabsContent value="trends" className="mt-4">
                <NDVITrendChart 
                  data={ndviData?.map(d => ({
                    date: d.date,
                    ndvi: d.ndvi_value || 0,
                    evi: d.evi_value || 0,
                    ndwi: d.ndwi_value || 0,
                    savi: d.savi_value || 0
                  })) || []}
                  selectedIndex="ndvi"
                />
              </TabsContent>

              <TabsContent value="insights" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Crop Health Insights</CardTitle>
                    <CardDescription>AI-powered analysis of your crop health</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {ndviData && ndviData.length > 0 ? (
                      <div className="space-y-4">
                        <div className="p-4 bg-primary/10 rounded-lg">
                          <h3 className="font-semibold mb-2">Overall Health</h3>
                          <p className="text-sm">
                            {(ndviData[0].ndvi_value || 0) > 0.7 
                              ? '🟢 Excellent - Your crops are very healthy!'
                              : (ndviData[0].ndvi_value || 0) > 0.5
                              ? '🟡 Good - Crops are growing well'
                              : (ndviData[0].ndvi_value || 0) > 0.3
                              ? '🟠 Moderate - Some attention needed'
                              : '🔴 Poor - Immediate action required'}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <h3 className="font-semibold">Recommendations</h3>
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {(ndviData[0].ndvi_value || 0) < 0.5 && (
                              <>
                                <li>Check irrigation levels in low NDVI areas</li>
                                <li>Inspect for pest or disease issues</li>
                                <li>Consider nutrient supplementation</li>
                              </>
                            )}
                            {(ndviData[0].ndvi_value || 0) >= 0.5 && (
                              <>
                                <li>Maintain current irrigation schedule</li>
                                <li>Monitor weather conditions</li>
                                <li>Plan for optimal harvest time</li>
                              </>
                            )}
                          </ul>
                        </div>

                        <div className="p-4 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground">
                            Last updated: {new Date(ndviData[0].date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No NDVI data available yet. Data will be available after satellite analysis.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
};

export default NDVIAnalysis;