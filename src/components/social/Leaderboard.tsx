import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Medal, Award } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export function Leaderboard() {
  const [leaderboards, setLeaderboards] = useState<any>({
    overall: [],
    state: [],
    crop: []
  });

  useEffect(() => {
    fetchLeaderboards();
  }, []);

  const fetchLeaderboards = async () => {
    const { data } = await supabase
      .from('farmer_gamification')
      .select('*, farmer:farmers(*)')
      .order('total_points', { ascending: false })
      .limit(50);

    setLeaderboards({ overall: data || [] });
  };

  return (
    <div className="p-4">
      <Tabs defaultValue="overall">
        <TabsList className="w-full">
          <TabsTrigger value="overall" className="flex-1">Overall</TabsTrigger>
          <TabsTrigger value="weekly" className="flex-1">Weekly</TabsTrigger>
          <TabsTrigger value="monthly" className="flex-1">Monthly</TabsTrigger>
        </TabsList>

        <ScrollArea className="h-[calc(100vh-16rem)] mt-4">
          <TabsContent value="overall" className="space-y-3 mt-0">
            {leaderboards.overall.map((entry: any, index: number) => (
              <Card key={entry.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      {index === 0 ? <Trophy className="w-4 h-4 text-yellow-500" /> :
                       index === 1 ? <Medal className="w-4 h-4 text-muted-foreground" /> :
                       index === 2 ? <Award className="w-4 h-4 text-amber-600" /> :
                       <span className="text-sm font-bold">{index + 1}</span>}
                    </div>
                    <div>
                      <p className="font-medium">{entry.farmer?.name || 'Farmer'}</p>
                      <p className="text-sm text-muted-foreground">Level {entry.current_level}</p>
                    </div>
                  </div>
                  <Badge>{entry.total_points} points</Badge>
                </div>
              </Card>
            ))}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}