import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VideoCard } from './VideoCard';
import { VideoTutorial, incrementVideoViewCount } from '@/hooks/useVideoTutorials';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface VideoHelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
  videos: VideoTutorial[] | undefined;
  category: string;
  isLoading?: boolean;
}

export function VideoHelpDialog({ 
  isOpen, 
  onClose, 
  videos, 
  category,
  isLoading 
}: VideoHelpDialogProps) {
  const [selectedVideo, setSelectedVideo] = useState<VideoTutorial | null>(null);

  const handleVideoSelect = (video: VideoTutorial) => {
    setSelectedVideo(video);
    incrementVideoViewCount(video.id);
  };

  const handleBack = () => {
    setSelectedVideo(null);
  };

  const handleClose = () => {
    setSelectedVideo(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedVideo && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              <DialogTitle className="text-lg">
                {selectedVideo ? selectedVideo.title : 'Video Tutorials'}
              </DialogTitle>
            </div>
            {!selectedVideo && (
              <Badge variant="outline" className="text-xs">
                {category}
              </Badge>
            )}
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading videos...</p>
              </div>
            </div>
          ) : selectedVideo ? (
            // Video Player View
            <ScrollArea className="h-full">
              <div className="p-6 space-y-6">
                {/* Video Player */}
                <div className="relative aspect-video rounded-lg overflow-hidden shadow-lg bg-black">
                  <iframe
                    src={selectedVideo.video_url}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={selectedVideo.title}
                  />
                </div>

                {/* Video Details */}
                <div className="space-y-4">
                  {selectedVideo.description && (
                    <div>
                      <h3 className="font-semibold mb-2">About this video</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedVideo.description}
                      </p>
                    </div>
                  )}

                  {selectedVideo.tags && selectedVideo.tags.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2">Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedVideo.tags.map((tag, idx) => (
                          <Badge key={idx} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          ) : (
            // Video List View
            <ScrollArea className="h-full">
              <div className="p-6">
                {!videos || videos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <p className="text-muted-foreground mb-2">
                      No video tutorials available for this task yet.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Check back soon for helpful guides!
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {videos.map((video) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        onClick={() => handleVideoSelect(video)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
