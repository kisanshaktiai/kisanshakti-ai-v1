import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PostCard } from './PostCard';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Mock data for demonstration
const MOCK_POSTS = [
  {
    id: '1',
    authorName: 'राजेश पाटील',
    authorAvatar: '👨‍🌾',
    authorLocation: 'नासिक, महाराष्ट्र',
    authorBadge: 'expert',
    originalLanguage: 'mr',
    originalContent: 'माझ्या टोमॅटो पिकावर पांढरी माशी आली आहे. कोणी मला सांगू शकेल का की यावर काय उपाय करावा? मी सेंद्रिय शेती करतो.',
    imageUrl: 'https://images.unsplash.com/photo-1592841200221-a6898f307baa?w=800',
    reactions: { helpful: 24, tried: 8, thanks: 12 },
    commentCount: 15,
    timestamp: '2 तास पूर्वी',
    tags: ['टोमॅटो', 'कीटक नियंत्रण', 'सेंद्रिय'],
    hasVoiceNote: true,
  },
  {
    id: '2',
    authorName: 'Priya Sharma',
    authorAvatar: '👩‍🌾',
    authorLocation: 'Jaipur, Rajasthan',
    authorBadge: 'verified',
    originalLanguage: 'hi',
    originalContent: 'इस साल गेहूं की फसल बहुत अच्छी हुई है! नए बीज और ड्रिप इरीगेशन का कमाल है। 40% पानी की बचत और 25% ज्यादा उत्पादन। 🌾',
    imageUrl: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=800',
    reactions: { helpful: 156, tried: 45, thanks: 89 },
    commentCount: 67,
    timestamp: '5 घंटे पहले',
    tags: ['गेहूं', 'सफलता की कहानी', 'ड्रिप इरीगेशन'],
    hasVoiceNote: false,
  },
  {
    id: '3',
    authorName: 'கார்த்திக் முருகன்',
    authorAvatar: '👨‍🌾',
    authorLocation: 'Coimbatore, Tamil Nadu',
    authorBadge: null,
    originalLanguage: 'ta',
    originalContent: 'நெல் விவசாயத்தில் இயற்கை உரங்கள் பயன்படுத்துவதால் மண்ணின் தரம் மேம்பட்டுள்ளது. 3 ஆண்டுகளாக இந்த முறையை பின்பற்றுகிறேன்.',
    imageUrl: 'https://images.unsplash.com/photo-1536054337653-dce62da9c9f2?w=800',
    reactions: { helpful: 78, tried: 23, thanks: 34 },
    commentCount: 28,
    timestamp: '1 நாள் முன்பு',
    tags: ['நெல்', 'இயற்கை விவசாயம்'],
    hasVoiceNote: true,
  },
];

interface CommunityFeedProps {
  viewLanguage: string;
  filterByUser?: boolean;
}

export const CommunityFeed: React.FC<CommunityFeedProps> = ({
  viewLanguage,
  filterByUser = false
}) => {
  const { t } = useTranslation('social');
  const [posts, setPosts] = useState(MOCK_POSTS);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsRefreshing(false);
  };

  return (
    <div className="px-4 space-y-4">
      {/* Pull to Refresh Indicator */}
      {isRefreshing && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 py-4"
        >
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            {t('social.feed.refreshing', 'Refreshing...')}
          </span>
        </motion.div>
      )}

      {/* Refresh Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex justify-center"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="rounded-full gap-2 bg-card/50 backdrop-blur-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {t('social.feed.refresh', 'New posts available')}
        </Button>
      </motion.div>

      {/* Posts */}
      {posts.map((post, index) => (
        <motion.div
          key={post.id}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <PostCard 
            post={post}
            viewLanguage={viewLanguage}
          />
        </motion.div>
      ))}

      {/* Loading More */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-10 h-10 rounded-full border-3 border-primary/30 border-t-primary"
            />
            <span className="text-sm text-muted-foreground">
              {t('social.feed.loading', 'Loading more posts...')}
            </span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {posts.length === 0 && !isLoading && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-16"
        >
          <div className="text-6xl mb-4">🌱</div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {t('social.empty.feed', 'No posts yet')}
          </h3>
          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            {t('social.empty.feed_hint', 'Be the first to share your farming knowledge!')}
          </p>
        </motion.div>
      )}
    </div>
  );
};
