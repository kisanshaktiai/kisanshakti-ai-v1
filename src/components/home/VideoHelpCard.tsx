import { Card, CardContent } from '@/components/ui/card';
import { PlayCircle, Video } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface VideoHelpCardProps {
  videos: any[];
  onClick: () => void;
}

export function VideoHelpCard({ videos, onClick }: VideoHelpCardProps) {
  const videoCount = videos.length;

  return (
    <Card 
      className="overflow-hidden border-border/40 backdrop-blur-sm hover:shadow-[0_10px_40px_-10px_rgba(var(--primary-rgb),0.3)] transition-all duration-300"
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-semibold text-sm mb-0.5">Video Tutorials</h4>
            <p className="text-xs text-muted-foreground">
              Learn farming techniques with step-by-step guides
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {videoCount}
          </Badge>
        </div>

        {/* Horizontal Scrollable Thumbnails */}
        <div className="relative -mx-4 px-4">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2">
            {videos.slice(0, 8).map((video, index) => (
              <motion.div
                key={video.id}
                onClick={onClick}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex-shrink-0 w-32 snap-start cursor-pointer group"
              >
                <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10">
                  {video.thumbnail_url ? (
                    <img 
                      src={video.thumbnail_url} 
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                  
                  {/* Dark gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  
                  {/* Play icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:bg-primary transition-colors">
                      <PlayCircle className="w-6 h-6 text-primary-foreground" />
                    </div>
                  </div>

                  {/* Featured badge */}
                  {video.is_featured && (
                    <Badge 
                      variant="default" 
                      className="absolute top-2 right-2 bg-accent text-accent-foreground text-[10px] px-1.5 py-0.5 h-auto shadow-lg"
                    >
                      Featured
                    </Badge>
                  )}

                  {/* Video title at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <p className="text-white text-[10px] font-medium line-clamp-2 drop-shadow-md">
                      {video.title}
                    </p>
                  </div>

                  {/* View count */}
                  {video.view_count > 0 && (
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5">
                      <p className="text-white text-[10px] font-medium">
                        {video.view_count} views
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
