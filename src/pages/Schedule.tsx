import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Calendar, Plus, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import CropScheduleView from '@/components/schedule/CropScheduleView';

interface Land {
  id: string;
  name: string;
  area_acres: number;
  area_guntas?: number;
  village?: string;
  current_crop?: string;
}

export default function Schedule() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [lands, setLands] = useState<Land[]>([]);
  const [selectedLandId, setSelectedLandId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLands();
  }, []);

  const fetchLands = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('lands')
        .select('id, name, area_acres, area_guntas, village, current_crop')
        .eq('farmer_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setLands(data);
        // Automatically select the first land
        setSelectedLandId(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching lands:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch lands',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedLand = lands.find(land => land.id === selectedLandId);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (lands.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/app')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">AI Crop Schedule</h1>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Lands Found</h3>
            <p className="text-muted-foreground text-center mb-6">
              Add your land first to generate AI-powered crop schedules
            </p>
            <Button onClick={() => navigate('/app/lands/add')}>
              <Plus className="h-4 w-4 mr-2" />
              Add Land
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/app')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">AI Crop Schedule</h1>
            <p className="text-muted-foreground">
              Manage crop schedules for your lands
            </p>
          </div>
        </div>
      </div>

      {/* Land Selection Tabs */}
      {lands.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select Land</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedLandId} onValueChange={setSelectedLandId}>
              <TabsList className="w-full flex-wrap h-auto p-1">
                {lands.map(land => (
                  <TabsTrigger 
                    key={land.id} 
                    value={land.id}
                    className="flex items-center gap-2"
                  >
                    <MapPin className="h-3 w-3" />
                    <span>{land.name}</span>
                    {land.current_crop && (
                      <span className="text-xs text-muted-foreground">
                        ({land.current_crop})
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Schedule View */}
      {selectedLand && (
        <CropScheduleView
          landId={selectedLand.id}
          landName={selectedLand.name}
          currentCrop={selectedLand.current_crop}
        />
      )}
    </div>
  );
}