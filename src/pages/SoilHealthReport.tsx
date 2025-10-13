import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function SoilHealthReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: result, error } = await supabase
        .from('soil_health')
        .select(`
          *,
          user_profiles!inner(full_name, farmer_code),
          lands!inner(name)
        `)
        .eq('land_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!result) {
        toast({ title: 'No Data', description: 'No soil health data available', variant: 'destructive' });
        navigate(-1);
        return;
      }
      setData(result);
    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-lg font-semibold mb-4">No Data Available</h2>
            <Button onClick={() => navigate(-1)}>Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-bold text-lg">Soil Health Report</h1>
            <p className="text-xs text-muted-foreground">{data.lands?.name}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-bold mb-2">{data.user_profiles?.full_name}</h2>
            <p className="text-sm text-muted-foreground">Code: {data.user_profiles?.farmer_code}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">pH Level</p>
                <p className="text-2xl font-bold">{data.ph_level?.toFixed(1) || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Organic Carbon</p>
                <p className="text-2xl font-bold">{data.organic_carbon?.toFixed(2) || 'N/A'}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nitrogen</p>
                <p className="text-2xl font-bold">{data.nitrogen_kg_per_ha || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">{data.nitrogen_level || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phosphorus</p>
                <p className="text-2xl font-bold">{data.phosphorus_kg_per_ha || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">{data.phosphorus_level || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Potassium</p>
                <p className="text-2xl font-bold">{data.potassium_kg_per_ha || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">{data.potassium_level || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Soil Type</p>
                <p className="text-sm font-semibold">{data.soil_type || 'Unknown'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
