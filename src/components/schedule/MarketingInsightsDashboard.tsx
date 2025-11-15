import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Users, MapPin, Calendar, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Insight {
  id: string;
  insight_type: string;
  crop_type: string | null;
  region: string | null;
  predicted_demand_quantity: number;
  predicted_demand_unit: string;
  confidence_score: number;
  time_window_start: string;
  time_window_end: string;
  affected_farmers_count: number;
  affected_lands_count: number;
  total_area_hectares: number;
  ai_reasoning: string;
  recommendations: string;
  created_at: string;
}

const insightTypeLabels: Record<string, string> = {
  fertilizer_demand: 'Fertilizer Demand',
  seed_demand: 'Seed Demand',
  pesticide_demand: 'Pesticide Demand',
  equipment_rental: 'Equipment Rental',
  harvest_season: 'Harvest Season',
  crop_trend: 'Crop Trend',
};

const insightTypeColors: Record<string, string> = {
  fertilizer_demand: 'bg-green-500/10 text-green-700',
  seed_demand: 'bg-blue-500/10 text-blue-700',
  pesticide_demand: 'bg-purple-500/10 text-purple-700',
  equipment_rental: 'bg-orange-500/10 text-orange-700',
  harvest_season: 'bg-yellow-500/10 text-yellow-700',
  crop_trend: 'bg-pink-500/10 text-pink-700',
};

export function MarketingInsightsDashboard({ tenantId }: { tenantId: string }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchInsights();
  }, [tenantId]);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('agri_marketing_insights')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setInsights(data || []);
    } catch (error) {
      console.error('Error fetching insights:', error);
      toast.error('Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  const generateNewInsights = async () => {
    try {
      setGenerating(true);
      const { data, error } = await supabase.functions.invoke('ai-marketing-insights', {
        body: { tenantId },
      });

      if (error) throw error;
      toast.success('New insights generated successfully');
      fetchInsights();
    } catch (error) {
      console.error('Error generating insights:', error);
      toast.error('Failed to generate insights');
    } finally {
      setGenerating(false);
    }
  };

  const totalFarmers = insights.reduce((sum, i) => Math.max(sum, i.affected_farmers_count), 0);
  const totalArea = insights.reduce((sum, i) => sum + (i.total_area_hectares || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Marketing Insights</h2>
          <p className="text-muted-foreground">AI-powered demand predictions and business opportunities</p>
        </div>
        <Button onClick={generateNewInsights} disabled={generating}>
          <RefreshCw className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
          Generate Insights
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Insights</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{insights.length}</div>
            <p className="text-xs text-muted-foreground">Active predictions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Affected Farmers</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFarmers}</div>
            <p className="text-xs text-muted-foreground">Across all insights</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Area</CardTitle>
            <MapPin className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalArea.toFixed(1)} ha</div>
            <p className="text-xs text-muted-foreground">Under monitoring</p>
          </CardContent>
        </Card>
      </div>

      {/* Insights List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading insights...</div>
        ) : insights.length === 0 ? (
          <Card className="p-8 text-center">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">No insights generated yet</p>
            <Button onClick={generateNewInsights} disabled={generating}>
              Generate First Insights
            </Button>
          </Card>
        ) : (
          insights.map((insight) => (
            <Card key={insight.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Badge className={insightTypeColors[insight.insight_type] || 'bg-gray-500/10'}>
                      {insightTypeLabels[insight.insight_type] || insight.insight_type}
                    </Badge>
                    <Badge variant="outline">
                      {Math.round(insight.confidence_score * 100)}% confidence
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(insight.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Demand</p>
                    <p className="font-semibold">
                      {insight.predicted_demand_quantity} {insight.predicted_demand_unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Farmers</p>
                    <p className="font-semibold">{insight.affected_farmers_count}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Area</p>
                    <p className="font-semibold">{insight.total_area_hectares.toFixed(1)} ha</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Timeline</p>
                    <p className="font-semibold flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(insight.time_window_start).toLocaleDateString()} - 
                      {new Date(insight.time_window_end).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {(insight.crop_type || insight.region) && (
                  <div className="flex gap-2 mb-3">
                    {insight.crop_type && (
                      <Badge variant="secondary">Crop: {insight.crop_type}</Badge>
                    )}
                    {insight.region && (
                      <Badge variant="secondary">Region: {insight.region}</Badge>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium mb-1">AI Reasoning:</p>
                    <p className="text-sm text-muted-foreground">{insight.ai_reasoning}</p>
                  </div>

                  {insight.recommendations && (
                    <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                      <p className="text-sm font-medium mb-1">Recommendations:</p>
                      <p className="text-sm">{insight.recommendations}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
