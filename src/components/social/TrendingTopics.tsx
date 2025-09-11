import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';

export function TrendingTopics() {
  const [topics, setTopics] = useState<any[]>([]);

  useEffect(() => {
    fetchTrendingTopics();
  }, []);

  const fetchTrendingTopics = async () => {
    const { data } = await supabase
      .from('trending_topics')
      .select('*')
      .order('trending_score', { ascending: false })
      .limit(5);
    
    setTopics(data || []);
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      <TrendingUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      {topics.map((topic) => (
        <Badge key={topic.id} variant="secondary" className="whitespace-nowrap">
          #{topic.hashtag}
        </Badge>
      ))}
    </div>
  );
}