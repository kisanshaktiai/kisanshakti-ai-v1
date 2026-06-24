import { VideoReelsViewer } from '@/components/video/VideoReelsViewer';
import { useVideoTutorials } from '@/hooks/useVideoTutorials';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

export default function VideoReels() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: videos = [], isLoading } = useVideoTutorials();

  const handleClose = () => {
    navigate('/app');
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!videos || videos.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <p className="text-lg font-semibold mb-2">{t('video.no_videos')}</p>
          <p className="text-sm text-white/70">{t('video.check_back_later')}</p>
        </div>
      </div>
    );
  }

  return <VideoReelsViewer videos={videos} onClose={handleClose} />;
}
