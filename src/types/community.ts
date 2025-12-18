export type CommunityTab = 'feed' | 'groups' | 'trending' | 'saved' | 'my-posts';

// Post interface matching UI requirements - transformed from DB schema
export interface CommunityPost {
  id: string;
  authorName: string;
  authorAvatar: string;
  authorLocation: string;
  authorBadge: 'expert' | 'verified' | null;
  authorId: string;
  originalLanguage: string;
  originalContent: string;
  imageUrl?: string;
  mediaUrls?: string[];
  reactions: {
    helpful: number;
    tried: number;
    thanks: number;
  };
  likesCount: number;
  commentCount: number;
  sharesCount: number;
  savesCount: number;
  timestamp: string;
  createdAt: string;
  tags: string[];
  hasVoiceNote?: boolean;
  isVerified?: boolean;
}
