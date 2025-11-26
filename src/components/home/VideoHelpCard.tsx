import { Card, CardContent } from '@/components/ui/card';
import { PlayCircle, Video } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

interface VideoHelpCardProps {
  videos: any[];
  onClick: () => void;
}

export function VideoHelpCard({ videos, onClick }: VideoHelpCardProps) {
  const featuredVideo = videos[0];
  const videoCount = videos.length;

  return (
    <Card 
      className="overflow-hidden cursor-pointer group border-border/40 backdrop-blur-sm hover:shadow-[0_10px_40px_-10px_rgba(var(--primary-rgb),0.3)] transition-all duration-300"
      onClick={onClick}
    >
      <div className="relative aspect-video bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10 overflow-hidden">
        {featuredVideo?.thumbnail_url ? (
          <img 
            src={featuredVideo.thumbnail_url} 
            alt={featuredVideo.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="w-16 h-16 text-muted-foreground/40" />
          </div>
        )}
        
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        
        {/* Play button */}
        <motion.div 
          className="absolute inset-0 flex items-center justify-center"
          whileHover={{ scale: 1.1 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <div className="w-16 h-16 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:bg-primary transition-colors">
            <PlayCircle className="w-10 h-10 text-primary-foreground" />
          </div>
        </motion.div>

        {/* Featured badge */}
        {featuredVideo?.is_featured && (
          <Badge 
            variant="default" 
            className="absolute top-3 right-3 bg-accent text-accent-foreground shadow-lg"
          >
            Featured
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h4 className="font-semibold text-sm mb-1 line-clamp-1 group-hover:text-primary transition-colors">
              {featuredVideo?.title || 'Video Tutorials'}
            </h4>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {featuredVideo?.description || 'Learn farming techniques with step-by-step video guides'}
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {videoCount} videos
          </Badge>
        </div>
        
        {featuredVideo?.tags && featuredVideo.tags.length > 0 && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {featuredVideo.tags.slice(0, 3).map((tag: string) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
