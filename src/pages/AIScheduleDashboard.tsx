import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AIScheduleAlerts } from '@/components/schedule/AIScheduleAlerts';
import { MarketingInsightsDashboard } from '@/components/schedule/MarketingInsightsDashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, TrendingUp, Bell, Database } from 'lucide-react';
import { tenantIsolationService } from '@/services/tenantIsolationService';

export default function AIScheduleDashboard() {
  const { t } = useTranslation();
  const [tenantId, setTenantId] = useState<string>('');

  useEffect(() => {
    const tid = tenantIsolationService.getTenantId();
    if (tid) {
      setTenantId(tid);
    }
  }, []);

  return (
    <div className="min-h-full bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
              <Brain className="w-8 h-8 text-primary" />
              AI Crop Intelligence
            </h1>
            <p className="text-muted-foreground mt-2">
              Automated scheduling, real-time monitoring & predictive insights
            </p>
          </div>
        </div>

        {/* System Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">AI Model</CardTitle>
              <Brain className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">Gemini 2.5 Flash</div>
              <p className="text-xs text-muted-foreground">Google AI</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Features</CardTitle>
              <Database className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">6 AI Systems</div>
              <p className="text-xs text-muted-foreground">Fully automated</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Data Sources</CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">Multi-source</div>
              <p className="text-xs text-muted-foreground">Weather, NDVI, Soil</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Explainability</CardTitle>
              <Bell className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">100% Transparent</div>
              <p className="text-xs text-muted-foreground">All decisions logged</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="alerts" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:w-auto">
            <TabsTrigger value="alerts" className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Farmer Alerts
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Marketing Insights
            </TabsTrigger>
            <TabsTrigger value="docs" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Documentation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="alerts">
            <AIScheduleAlerts />
          </TabsContent>

          <TabsContent value="insights">
            {tenantId && <MarketingInsightsDashboard tenantId={tenantId} />}
          </TabsContent>

          <TabsContent value="docs">
            <Card>
              <CardHeader>
                <CardTitle>AI System Architecture</CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <h3>1. Baseline Schedule Generation</h3>
                <p>
                  Generates crop schedules using expert agricultural guidelines, land details
                  (soil type, pH, NPK), weather forecasts, and regional best practices.
                </p>

                <h3>2. Continuous Monitoring & Refinement</h3>
                <p>
                  Monitors active schedules in real-time using weather changes, NDVI vegetation
                  health data, and soil conditions. Automatically suggests schedule adjustments.
                </p>

                <h3>3. Intelligent Alerts</h3>
                <p>
                  Generates actionable alerts for farmers covering irrigation, fertilizer,
                  pest control, disease management, and weather warnings.
                </p>

                <h3>4. Predictive Marketing Insights</h3>
                <p>
                  Analyzes aggregate farmer data to predict upcoming demand for fertilizers,
                  seeds, pesticides, and equipment. Helps tenant teams optimize inventory.
                </p>

                <h3>5. Decision Logging & Model Training</h3>
                <p>
                  Every AI decision is logged with input data, reasoning, and confidence scores.
                  Creates a structured dataset for continuous model improvement.
                </p>

                <h3>6. Multi-lingual & Explainable</h3>
                <p>
                  All AI recommendations include detailed reasoning in simple language.
                  Ready for translation to regional languages via i18n system.
                </p>

                <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/10">
                  <h4 className="font-semibold mb-2">Data Sources:</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Land details (soil, pH, NPK, irrigation, water source)</li>
                    <li>Real-time weather forecasts (7-day)</li>
                    <li>NDVI satellite vegetation index</li>
                    <li>Expert crop guidelines database</li>
                    <li>Historical performance data</li>
                  </ul>
                </div>

                <div className="mt-4 p-4 bg-success/5 rounded-lg border border-success/10">
                  <h4 className="font-semibold mb-2">2030-Ready Features:</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Climate-adaptive recommendations</li>
                    <li>Sustainable farming practices</li>
                    <li>Water optimization</li>
                    <li>Precision agriculture integration</li>
                    <li>Carbon footprint tracking ready</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
