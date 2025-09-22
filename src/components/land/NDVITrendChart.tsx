import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, BarChart } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NDVITrendChartProps {
  data: Array<{
    date: string;
    ndvi: number;
    evi: number;
    ndwi: number;
    savi: number;
  }>;
  selectedIndex: 'ndvi' | 'evi' | 'ndwi' | 'savi';
}

export function NDVITrendChart({ data, selectedIndex }: NDVITrendChartProps) {
  const { t } = useTranslation();

  const getStrokeColor = (index: string) => {
    switch (index) {
      case 'ndvi': return '#10b981';
      case 'evi': return '#3b82f6';
      case 'ndwi': return '#06b6d4';
      case 'savi': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {selectedIndex.toUpperCase()} Trend Analysis - Last 30 Days
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              domain={[0, 1]}
              style={{ fontSize: '12px' }}
            />
            <Tooltip 
              formatter={(value: number) => value.toFixed(3)}
              labelFormatter={(label) => `Date: ${formatDate(label)}`}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey={selectedIndex} 
              stroke={getStrokeColor(selectedIndex)}
              strokeWidth={2}
              dot={{ fill: getStrokeColor(selectedIndex), r: 4 }}
              activeDot={{ r: 6 }}
              name={selectedIndex.toUpperCase()}
            />
          </LineChart>
        </ResponsiveContainer>
        
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-sm font-medium mb-2">Trend Summary:</p>
          <p className="text-sm text-muted-foreground">
            {selectedIndex === 'ndvi' && 'Vegetation health has been stable with slight improvement over the past month.'}
            {selectedIndex === 'evi' && 'Enhanced vegetation index shows consistent crop growth patterns.'}
            {selectedIndex === 'ndwi' && 'Water content levels indicate adequate moisture in the field.'}
            {selectedIndex === 'savi' && 'Soil-adjusted values show healthy crop-soil interaction.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}