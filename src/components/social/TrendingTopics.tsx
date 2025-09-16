import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { TrendingUp, Hash, Flame, Activity, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function TrendingTopics() {
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  useEffect(() => {
    fetchTrendingTopics();
    // Refresh every 5 minutes
    const interval = setInterval(fetchTrendingTopics, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchTrendingTopics = async () => {
    const { data } = await supabase
      .from('trending_topics')
      .select('*')
      .order('trending_score', { ascending: false })
      .limit(10);
    
    setTopics(data || []);
  };

  // Mock data for demonstration if no real data
  const displayTopics = topics.length > 0 ? topics : [
    { id: '1', hashtag: 'organic', trending_score: 95, post_count: 234 },
    { id: '2', hashtag: 'harvest2025', trending_score: 88, post_count: 189 },
    { id: '3', hashtag: 'soilhealth', trending_score: 76, post_count: 156 },
    { id: '4', hashtag: 'smartfarming', trending_score: 72, post_count: 145 },
    { id: '5', hashtag: 'irrigation', trending_score: 68, post_count: 123 },
  ];

  return (
    <div className="space-y-4">
      {/* Modern Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500/20 via-red-500/20 to-pink-500/20 flex items-center justify-center shadow-lg">
            <Flame className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
              Trending Now
            </h2>
            <p className="text-xs text-muted-foreground">Most popular topics today</p>
          </div>
        </div>
        <Badge className="bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-600 border-orange-500/30">
          Live
        </Badge>
      </div>

      {/* Mobile-First Grid Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {displayTopics.map((topic, index) => (
          <motion.div
            key={topic.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card 
              className={cn(
                "relative p-4 cursor-pointer transition-all duration-300",
                "bg-gradient-to-br from-card/90 via-card/80 to-card/70",
                "hover:shadow-xl hover:scale-[1.02] hover:border-primary/30",
                "border-border/50",
                selectedTopic === topic.hashtag && "border-primary/50 bg-primary/5"
              )}
              onClick={() => setSelectedTopic(topic.hashtag === selectedTopic ? null : topic.hashtag)}
            >
              {/* Rank Badge */}
              {index < 3 && (
                <div className={cn(
                  "absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-lg",
                  index === 0 && "bg-gradient-to-br from-yellow-400 to-amber-500 text-white",
                  index === 1 && "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700",
                  index === 2 && "bg-gradient-to-br from-orange-400 to-orange-500 text-white"
                )}>
                  {index + 1}
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Hash className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="font-semibold text-sm truncate">
                      {topic.hashtag}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      <span>{topic.post_count || 0} posts</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-green-500" />
                      <span className="text-green-600">+{topic.trending_score || 0}%</span>
                    </div>
                  </div>
                </div>

                <ArrowRight className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform duration-300",
                  selectedTopic === topic.hashtag && "rotate-90 text-primary"
                )} />
              </div>

              {/* Progress Bar */}
              <div className="mt-3 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary/60"
                  initial={{ width: 0 }}
                  animate={{ width: `${topic.trending_score || 0}%` }}
                  transition={{ duration: 1, delay: index * 0.1 }}
                />
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Mobile-Friendly Categories */}
      <div className="mt-6 p-4 rounded-2xl bg-gradient-to-br from-muted/50 via-muted/30 to-muted/20 backdrop-blur-sm">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Popular Categories</h3>
        <div className="flex flex-wrap gap-2">
          {['Organic', 'Technology', 'Weather', 'Market', 'Seeds', 'Equipment'].map((category) => (
            <Badge 
              key={category}
              variant="secondary" 
              className="px-3 py-1.5 text-xs bg-gradient-to-r from-card/80 to-card/60 hover:from-primary/20 hover:to-primary/10 cursor-pointer transition-all duration-300"
            >
              {category}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}