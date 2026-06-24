import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, MessageCircle, Share2, Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { incrementVideoViewCount } from '@/hooks/useVideoTutorials';

interface VideoReelsViewerProps {
  videos: any[];
  onClose: () => void;
  initialIndex?: number;
}

export function VideoReelsViewer({ videos, onClose, initialIndex = 0 }: VideoReelsViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentVideo = videos[currentIndex];

  // Auto-play current video, pause others
  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (video) {
        if (idx === currentIndex) {
          video.play().catch(() => {});
          // Increment view count for current video
          if (currentVideo?.id) {
            incrementVideoViewCount(currentVideo.id);
          }
        } else {
          video.pause();
          video.currentTime = 0;
        }
      }
    });
  }, [currentIndex, currentVideo]);

  // Handle scroll to change videos
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    const itemHeight = container.clientHeight;
    const newIndex = Math.round(scrollTop / itemHeight);
    
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < videos.length) {
      setCurrentIndex(newIndex);
      setProgress(0);
    }
  };

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted);
    videoRefs.current.forEach(video => {
      if (video) {
        video.muted = !isMuted;
      }
    });
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    const video = videoRefs.current[currentIndex];
    if (video) {
      if (isPlaying) {
        video.pause();
      } else {
        video.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Update progress
  const handleTimeUpdate = (idx: number) => {
    const video = videoRefs.current[idx];
    if (video && idx === currentIndex) {
      const progress = (video.currentTime / video.duration) * 100;
      setProgress(progress);
    }
  };

  // Handle video end
  const handleVideoEnd = (idx: number) => {
    if (idx === currentIndex && idx < videos.length - 1) {
      // Auto-scroll to next video
      if (containerRef.current) {
        containerRef.current.scrollTo({
          top: (idx + 1) * containerRef.current.clientHeight,
          behavior: 'smooth'
        });
      }
    } else if (idx === currentIndex) {
      // Loop current video
      const video = videoRefs.current[idx];
      if (video) {
        video.currentTime = 0;
        video.play();
      }
    }
  };

  if (!videos || videos.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* Close Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4 z-20 bg-black/40 backdrop-blur-sm hover:bg-black/60 text-white"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </Button>

      {/* Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/20 z-20">
        <div 
          className="h-full bg-primary transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Vertical Scrollable Container */}
      <div
        ref={containerRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory scroll-smooth"
        onScroll={handleScroll}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {videos.map((video, index) => (
          <div
            key={video.id}
            className="h-full snap-start relative flex items-center justify-center bg-black"
          >
            {/* Video Player */}
            <video
              ref={(el) => (videoRefs.current[index] = el)}
              src={video.video_url}
              className="w-full h-full object-contain"
              loop
              playsInline
              muted={isMuted}
              onTimeUpdate={() => handleTimeUpdate(index)}
              onEnded={() => handleVideoEnd(index)}
              onClick={togglePlayPause}
            />

            {/* Play/Pause Overlay */}
            <AnimatePresence>
              {!isPlaying && index === currentIndex && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-10 h-10 text-white ml-1" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Video Info Overlay - Bottom */}
            <div className="absolute bottom-20 left-4 right-20 z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h3 className="text-white font-bold text-lg mb-2 drop-shadow-lg">
                  {video.title}
                </h3>
                <p className="text-white/90 text-sm mb-3 line-clamp-2 drop-shadow-md">
                  {video.description}
                </p>
                {video.tags && video.tags.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {video.tags.slice(0, 3).map((tag: string) => (
                      <Badge 
                        key={tag} 
                        className="bg-white/20 backdrop-blur-sm text-white border-white/30"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>

            {/* Action Buttons - Right Side */}
            <div className="absolute right-4 bottom-32 flex flex-col gap-5 z-10">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                  <Heart className="w-6 h-6 text-white" />
                </div>
                <span className="text-white text-xs font-medium drop-shadow-md">
                  {video.view_count || 0}
                </span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                  <Share2 className="w-6 h-6 text-white" />
                </div>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleMute}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                  {isMuted ? (
                    <VolumeX className="w-6 h-6 text-white" />
                  ) : (
                    <Volume2 className="w-6 h-6 text-white" />
                  )}
                </div>
              </motion.button>
            </div>

            {/* Progress Dots - Right Side */}
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex flex-col gap-2 z-10">
              {videos.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (containerRef.current) {
                      containerRef.current.scrollTo({
                        top: idx * containerRef.current.clientHeight,
                        behavior: 'smooth'
                      });
                    }
                  }}
                  className={cn(
                    "rounded-full bg-white/40 transition-all duration-300",
                    currentIndex === idx ? "w-2 h-8" : "w-2 h-2"
                  )}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        div[class*="overflow-y-scroll"]::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </motion.div>
  );
}
