import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PlayCircle, Clock, Eye } from 'lucide-react';
import { VideoTutorial } from '@/hooks/useVideoTutorials';

interface VideoCardProps {
  video: VideoTutorial;
  onClick: () => void;
}

export function VideoCard({ video, onClick }: VideoCardProps) {
  return (
    <Card 
      className="cursor-pointer overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-[1.02] group"
      onClick={onClick}
    >
      <CardContent className="p-0">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center overflow-hidden">
          {video.thumbnail_url ? (
            <img 
              src={video.thumbnail_url} 
              alt={video.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <PlayCircle className="h-12 w-12 mb-2 text-primary group-hover:scale-110 transition-transform" />
              <span className="text-xs">Video Tutorial</span>
            </div>
          )}
          
          {/* Play Overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <PlayCircle className="h-8 w-8 text-primary" />
              </div>
            </div>
          </div>

          {/* Featured Badge */}
          {video.is_featured && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-accent text-white border-0">
                Featured
              </Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <h4 className="font-semibold text-sm mb-2 line-clamp-2 text-foreground">
            {video.title}
          </h4>
          
          {video.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
              {video.description}
            </p>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {video.duration_minutes && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{video.duration_minutes} min</span>
              </div>
            )}
            
            <div className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              <span>{video.view_count || 0} views</span>
            </div>
          </div>

          {/* Tags */}
          {video.tags && video.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {video.tags.slice(0, 3).map((tag, idx) => (
                <Badge 
                  key={idx} 
                  variant="secondary" 
                  className="text-[10px] h-5"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
