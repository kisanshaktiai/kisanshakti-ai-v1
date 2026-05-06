import { Card, CardContent } from '@/components/ui/card';
import { PlayCircle, Video } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { youTubeThumb, getYouTubeId } from '@/lib/youtube';

interface VideoHelpCardProps {
  videos: any[];
  onClick: () => void;
}

export function VideoHelpCard({ videos, onClick }: VideoHelpCardProps) {
  const { t } = useTranslation();
  const videoCount = videos.length;

  if (!videos || videos.length === 0) return null;

  return (
    <Card 
      className="overflow-hidden border-border/40 backdrop-blur-sm hover:shadow-[0_10px_40px_-10px_rgba(var(--primary-rgb),0.3)] transition-all duration-300 cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-semibold text-sm mb-0.5">{t('reels.home.title', 'Farming Reels')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('reels.home.subtitle', 'Short videos to learn modern farming')}
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {videoCount}
          </Badge>
        </div>

        {/* Horizontal Scrollable Thumbnails - Facebook Style */}
        <div className="relative -mx-4 px-4">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2">
            {videos.slice(0, 8).map((video) => {
              const ytId = video.video_url ? getYouTubeId(video.video_url) : null;
              const thumb = video.thumbnail_url || (ytId ? youTubeThumb(ytId, 'hq') : null);
              const views = video.total_views ?? video.view_count ?? 0;
              return (
              <motion.div
                key={video.id}
                onClick={onClick}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex-shrink-0 w-36 snap-start cursor-pointer group"
              >
                <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10 shadow-lg border border-border/20">
                  {thumb ? (
                    <img 
                      src={thumb} 
                      alt={video.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="w-10 h-10 text-muted-foreground/40" />
                    </div>
                  )}
                  
                  {/* Enhanced gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                  
                  {/* Centered play button - Facebook style */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div 
                      className="w-12 h-12 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-xl"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <PlayCircle className="w-7 h-7 text-black ml-0.5" fill="black" />
                    </motion.div>
                  </div>

                  {/* Featured badge */}
                  {video.is_featured && (
                    <Badge 
                      variant="default" 
                      className="absolute top-2 right-2 bg-accent text-accent-foreground text-[10px] px-2 py-1 h-auto shadow-lg"
                    >
                      Featured
                    </Badge>
                  )}

                  {/* Video title at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/90 to-transparent">
                    <p className="text-white text-xs font-semibold line-clamp-2 drop-shadow-lg">
                      {video.title}
                    </p>
                  </div>

                  {/* View count */}
                  {views > 0 && (
                    <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-1">
                      <p className="text-white text-[10px] font-semibold">
                        {views} views
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
